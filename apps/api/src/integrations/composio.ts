// Composio wrapper — thin abstraction over the Composio SDK so we can swap
// providers later without touching consumers.
//
// IMPORTANT: this file uses dynamic import for `@composio/core` so the module
// can load even if COMPOSIO_API_KEY isn't set (e.g. in tests / dev without
// integrations enabled). Calling any function below without a key throws a
// clear error rather than a cryptic "module load failed" at startup.

import { env } from "../env.js";

export interface ComposioConnection {
  id: string;
  status: "active" | "pending_oauth" | "error";
  redirectUrl?: string;
}

export interface ComposioToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

let composioPromise: Promise<unknown> | null = null;

async function getClient(): Promise<unknown> {
  if (!env.COMPOSIO_API_KEY) {
    throw new Error(
      "COMPOSIO_API_KEY is not set — integration features are disabled. Set it in .env to enable.",
    );
  }
  if (!composioPromise) {
    composioPromise = (async () => {
      // Dynamic import so this file loads cleanly when Composio isn't installed/configured.
      const mod = await import("@composio/core" as string).catch((err) => {
        throw new Error(
          `Composio SDK not installed. Run: npm install @composio/core --workspace apps/api. (${err})`,
        );
      });
      // The SDK's default export shape changed across versions — feature-detect.
      const Client = (mod as Record<string, unknown>).Composio ?? (mod as Record<string, unknown>).default;
      if (!Client) throw new Error("Composio SDK loaded but no Composio class found");
      return new (Client as new (opts: { apiKey: string }) => unknown)({
        apiKey: env.COMPOSIO_API_KEY!,
      });
    })();
  }
  return composioPromise;
}

/**
 * Start an OAuth connect flow for a given Composio app. Returns a redirect
 * URL the user should be sent to. After they grant, Composio calls our
 * redirect_uri (configured in their dashboard) which fires our /webhook/composio
 * endpoint, which finalizes the connection.
 */
export async function startConnect(opts: {
  userId: string;
  composioApp: string;
  scopes?: string[];
  redirectUri: string;
}): Promise<ComposioConnection> {
  const client = (await getClient()) as {
    connectedAccounts?: {
      initiate: (a: unknown) => Promise<{ id: string; redirectUrl?: string; status?: string }>;
    };
  };
  if (!client.connectedAccounts?.initiate) {
    throw new Error("Composio SDK does not expose connectedAccounts.initiate — check SDK version");
  }
  const res = await client.connectedAccounts.initiate({
    userId: opts.userId,
    appName: opts.composioApp,
    scopes: opts.scopes,
    redirectUri: opts.redirectUri,
  });
  return {
    id: res.id,
    status: (res.status === "ACTIVE" ? "active" : "pending_oauth") as "active" | "pending_oauth",
    redirectUrl: res.redirectUrl,
  };
}

/**
 * Execute a tool against an active connection. Examples:
 *   executeTool({ userId, composioApp: "googlecalendar", tool: "events.list", args: {...} })
 */
export async function executeTool(opts: {
  userId: string;
  composioApp: string;
  tool: string;
  args: Record<string, unknown>;
}): Promise<ComposioToolResult> {
  try {
    const client = (await getClient()) as {
      tools?: {
        execute: (a: unknown) => Promise<unknown>;
      };
    };
    if (!client.tools?.execute) {
      throw new Error("Composio SDK does not expose tools.execute");
    }
    const data = await client.tools.execute({
      userId: opts.userId,
      appName: opts.composioApp,
      action: opts.tool,
      params: opts.args,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Revoke a Composio connection. Idempotent — already-revoked returns ok.
 */
export async function revokeConnection(connectionId: string): Promise<boolean> {
  try {
    const client = (await getClient()) as {
      connectedAccounts?: { delete: (id: string) => Promise<unknown> };
    };
    if (!client.connectedAccounts?.delete) return false;
    await client.connectedAccounts.delete(connectionId);
    return true;
  } catch (err) {
    console.error("revokeConnection failed", err);
    return false;
  }
}

/**
 * Whether Composio is configured. Used by routes to short-circuit cleanly.
 */
export function isComposioEnabled(): boolean {
  return Boolean(env.COMPOSIO_API_KEY);
}
