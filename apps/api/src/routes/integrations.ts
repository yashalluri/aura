// Integration routes — list connections, connect (start OAuth), revoke.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { APPS, ALLOWED_APP_IDS, isAppId } from "../integrations/registry.js";
import {
  isComposioEnabled,
  startConnect,
  revokeConnection,
} from "../integrations/composio.js";

const ConnectSchema = z.object({
  app: z.string().refine(isAppId, { message: "unknown app" }),
  redirectUri: z.string().url().optional(),
});

const UpdateSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});

function genWebhookToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  // List all integration apps + each user's connection status.
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/integrations",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      const connections = await prisma.integrationConnection.findMany({
        where: { userId: user.id },
      });
      const byApp = new Map(connections.map((c) => [c.app, c]));

      return ALLOWED_APP_IDS.map((id) => {
        const def = APPS[id];
        const conn = byApp.get(id);
        return {
          ...def,
          connection: conn
            ? {
                id: conn.id,
                status: conn.status,
                connectedAt: conn.connectedAt,
                lastSyncAt: conn.lastSyncAt,
                webhookToken: def.transport === "shortcut" ? conn.webhookToken : null,
              }
            : null,
        };
      });
    },
  );

  // Start a connect flow.
  //   - composio transport → returns { redirectUrl }; user goes there to grant access
  //   - shortcut transport → returns { webhookToken, webhookUrl }; user pastes into iOS Shortcut
  app.post<{ Params: { userId: string } }>(
    "/users/:userId/integrations/connect",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      const { app: appId, redirectUri } = ConnectSchema.parse(req.body);
      const def = APPS[appId as keyof typeof APPS];
      if (!def) return reply.code(400).send({ error: "unknown app" });

      if (def.transport === "shortcut") {
        const token = genWebhookToken();
        const conn = await prisma.integrationConnection.upsert({
          where: { userId_app: { userId: user.id, app: appId } },
          create: {
            userId: user.id,
            app: appId,
            status: "active",
            scopes: def.defaultScopes ?? [],
            webhookToken: token,
          },
          update: { status: "active", webhookToken: token },
        });
        const baseUrl = (req.protocol + "://" + req.hostname).replace(/\/$/, "");
        return reply.code(201).send({
          transport: "shortcut",
          connectionId: conn.id,
          webhookToken: token,
          webhookUrl: `${baseUrl}/signals/${appId}/${token}`,
          instructions: `In the Aura Sync iOS Shortcut, set the ${def.displayName} webhook URL to the one above. The Shortcut posts aggregated data daily and on-demand.`,
        });
      }

      // Composio transport
      if (!isComposioEnabled()) {
        return reply.code(503).send({
          error: "Composio integration is not configured. Set COMPOSIO_API_KEY.",
        });
      }
      if (!def.composioApp) {
        return reply.code(500).send({ error: "missing composioApp slug for " + appId });
      }
      try {
        const callback = redirectUri ?? `${req.protocol}://${req.hostname}/internal/integrations/oauth-callback`;
        const result = await startConnect({
          userId: user.id,
          composioApp: def.composioApp,
          scopes: def.defaultScopes,
          redirectUri: callback,
        });
        await prisma.integrationConnection.upsert({
          where: { userId_app: { userId: user.id, app: appId } },
          create: {
            userId: user.id,
            app: appId,
            status: result.status,
            scopes: def.defaultScopes ?? [],
            composioConnectionId: result.id,
          },
          update: {
            status: result.status,
            composioConnectionId: result.id,
          },
        });
        return reply.code(201).send({
          transport: "composio",
          status: result.status,
          redirectUrl: result.redirectUrl,
        });
      } catch (err) {
        return reply.code(500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // Revoke a connection.
  app.post<{ Params: { userId: string; app: string } }>(
    "/users/:userId/integrations/:app/revoke",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const conn = await prisma.integrationConnection.findUnique({
        where: { userId_app: { userId: user.id, app: req.params.app } },
      });
      if (!conn) throw notFound("IntegrationConnection");
      if (conn.composioConnectionId) {
        await revokeConnection(conn.composioConnectionId).catch(() => {
          /* logged in service */
        });
      }
      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { status: "revoked", webhookToken: null },
      });
      return { ok: true };
    },
  );

  // Update settings (e.g. bodyOptIn for mail integrations).
  app.patch<{ Params: { userId: string; app: string } }>(
    "/users/:userId/integrations/:app",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const { settings } = UpdateSettingsSchema.parse(req.body);
      const conn = await prisma.integrationConnection.findUnique({
        where: { userId_app: { userId: user.id, app: req.params.app } },
      });
      if (!conn) throw notFound("IntegrationConnection");
      const updated = await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { settings: settings as object },
      });
      return updated;
    },
  );
}
