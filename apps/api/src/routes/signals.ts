// Signal ingestion routes.
//
// Two paths:
//   1. /internal/signals/:app/:webhookToken — public, no Bearer auth required;
//      token-authenticated. Used by the iOS Shortcuts bridge. We pull the
//      user from the token.
//   2. /internal/users/:userId/signals — Bearer-authed, internal-only. Used
//      by Composio's webhook handler (which lands at a separate endpoint
//      configured in their dashboard) once a connection is established.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { isAppId, APPS } from "../integrations/registry.js";
import { normalize } from "../integrations/normalize.js";
import { ingestNormalized } from "../services/signals.js";

const SignalsBody = z.object({
  payload: z.unknown(),
});

export async function signalsRoutes(app: FastifyInstance): Promise<void> {
  // Internal (Bearer-authed) — Composio webhook ingestor or direct API caller.
  app.post<{ Params: { userId: string; app: string } }>(
    "/users/:userId/signals/:app",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      if (!isAppId(req.params.app)) {
        return reply.code(400).send({ error: "unknown app" });
      }
      const { payload } = SignalsBody.parse(req.body);
      const events = normalize(req.params.app, payload);
      const result = await ingestNormalized({ userId: user.id, source: req.params.app, events });

      await prisma.integrationConnection.updateMany({
        where: { userId: user.id, app: req.params.app },
        data: { lastSyncAt: new Date() },
      });

      return reply.code(200).send({ ...result, events: events.length });
    },
  );
}

/**
 * Public webhook for the iOS Shortcuts bridge — registered separately because
 * it has no Bearer auth (it uses the per-user webhook token in the URL).
 * This plugin is mounted outside the /internal prefix.
 */
export async function publicSignalsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { app: string; token: string } }>(
    "/signals/:app/:token",
    async (req, reply) => {
      if (!isAppId(req.params.app)) {
        return reply.code(400).send({ error: "unknown app" });
      }
      const def = APPS[req.params.app];
      if (def.transport !== "shortcut") {
        return reply.code(400).send({ error: "app does not support shortcut transport" });
      }
      const conn = await prisma.integrationConnection.findUnique({
        where: { webhookToken: req.params.token },
      });
      if (!conn || conn.status !== "active") {
        return reply.code(401).send({ error: "invalid or revoked webhook token" });
      }
      if (conn.app !== req.params.app) {
        return reply.code(400).send({ error: "token does not match app" });
      }
      const { payload } = SignalsBody.parse(req.body);
      const events = normalize(req.params.app, payload);
      const result = await ingestNormalized({
        userId: conn.userId,
        source: req.params.app,
        events,
      });

      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date() },
      });

      return reply.code(200).send({ ...result, events: events.length });
    },
  );
}
