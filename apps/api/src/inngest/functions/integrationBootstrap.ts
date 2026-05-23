// Day-1 ingest from active Composio connections.
//
// Triggered by `aura/integration.bootstrap` after an OAuth completes (or on
// demand). Pulls a recent window of data per app, runs it through the
// normalizer, and persists. The first ingest is what makes Aura "already
// know things" from message #1.

import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { prisma } from "../../lib/db.js";
import { isAppId, APPS } from "../../integrations/registry.js";
import { normalize } from "../../integrations/normalize.js";
import { ingestNormalized } from "../../services/signals.js";
import { executeTool, isComposioEnabled } from "../../integrations/composio.js";
import { mirrorContactsToEntities, upsertEntity } from "../../services/graph.js";

interface BootstrapArgs {
  userId: string;
  app: string;
}

export const integrationBootstrap: InngestFunction.Any = inngest.createFunction(
  {
    id: "integration-bootstrap",
    triggers: [{ event: "aura/integration.bootstrap" }],
  },
  async ({ event, step, logger }) => {
    const { userId, app } = event.data as BootstrapArgs;
    if (!isAppId(app)) {
      logger.warn({ app }, "unknown app in bootstrap");
      return { skipped: true };
    }
    const def = APPS[app];
    if (def.transport !== "composio") {
      // Shortcut-transport apps bootstrap themselves when the user first runs
      // the iOS Shortcut. Nothing to pull on our side.
      logger.info({ app }, "shortcut-transport app — skipping cloud bootstrap");
      return { skipped: true };
    }
    if (!isComposioEnabled() || !def.composioApp) {
      logger.warn({ app }, "composio not configured");
      return { skipped: true };
    }

    const conn = await step.run("load-conn", async () =>
      prisma.integrationConnection.findUnique({
        where: { userId_app: { userId, app } },
      }),
    );
    if (!conn || conn.status !== "active") {
      logger.info({ userId, app, status: conn?.status }, "no active connection");
      return { skipped: true };
    }

    // App-specific bootstrap fetches.
    if (app === "google_calendar") {
      const r = await step.run("fetch-calendar", async () => {
        const res = await executeTool({
          userId,
          composioApp: "googlecalendar",
          tool: "events.list",
          args: {
            // last 90 days + next 30 days
            timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            maxResults: 250,
          },
        });
        return res.ok ? res.data : null;
      });
      const events = normalize("google_calendar", r);
      const out = await ingestNormalized({ userId, source: app, events });
      return { ...out, events: events.length };
    }

    if (app === "google_contacts") {
      const r = await step.run("fetch-contacts", async () => {
        const res = await executeTool({
          userId,
          composioApp: "googlecontacts",
          tool: "people.connections.list",
          args: { pageSize: 500 },
        });
        return res.ok ? res.data : null;
      });
      // Contacts seed entities directly (not SignalEvents).
      await step.run("seed-entities", async () => {
        const list = extractContactList(r);
        for (const c of list) {
          await upsertEntity({
            userId,
            kind: "person",
            canonical: c.name,
            aliases: c.aliases,
            attrs: { phone: c.phone, email: c.email },
          });
        }
        await mirrorContactsToEntities(userId);
        return list.length;
      });
      return { seeded_contacts: true };
    }

    if (app === "gmail") {
      const r = await step.run("fetch-gmail-headers", async () => {
        const res = await executeTool({
          userId,
          composioApp: "gmail",
          tool: "messages.list",
          args: { maxResults: 50, labelIds: ["INBOX"], format: "metadata" },
        });
        return res.ok ? res.data : null;
      });
      const events = normalize("gmail", r);
      return ingestNormalized({ userId, source: app, events });
    }

    if (app === "spotify") {
      const r = await step.run("fetch-spotify-recent", async () => {
        const res = await executeTool({
          userId,
          composioApp: "spotify",
          tool: "player.recently-played",
          args: { limit: 50 },
        });
        return res.ok ? res.data : null;
      });
      const events = normalize("spotify", r);
      return ingestNormalized({ userId, source: app, events });
    }

    logger.warn({ app }, "no bootstrap handler implemented for this composio app");
    return { skipped: true };
  },
);

interface RawContact {
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  phoneNumbers?: Array<{ value?: string }>;
  emailAddresses?: Array<{ value?: string }>;
}

function extractContactList(raw: unknown): Array<{ name: string; aliases: string[]; phone?: string; email?: string }> {
  const connections =
    (raw && typeof raw === "object" && "connections" in raw
      ? ((raw as { connections: unknown }).connections as RawContact[])
      : null) ?? [];
  const out: Array<{ name: string; aliases: string[]; phone?: string; email?: string }> = [];
  for (const c of connections) {
    const name = c.names?.[0]?.displayName ?? "";
    if (!name) continue;
    const aliases: string[] = [];
    const given = c.names?.[0]?.givenName;
    if (given && given !== name) aliases.push(given);
    out.push({
      name,
      aliases,
      phone: c.phoneNumbers?.[0]?.value,
      email: c.emailAddresses?.[0]?.value,
    });
  }
  return out;
}
