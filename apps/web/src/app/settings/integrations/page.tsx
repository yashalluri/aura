import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { listIntegrations } from "@/lib/api";
import { RevokeButton } from "./RevokeButton";

export default async function IntegrationsPage() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  const integrations = await listIntegrations(session.userId).catch(() => []);

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">integrations</h1>
      <p className="text-white/50 text-sm mb-8">
        connect calendar/spotify/etc so i can actually know what's up.
      </p>

      <ul className="space-y-2">
        {integrations.map((i) => (
          <li
            key={i.id}
            className="border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-white/90 font-medium">{i.displayName}</span>
                {i.connection?.status === "active" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-aura-purple/20 text-aura-purple">
                    connected
                  </span>
                )}
                {i.connection?.status === "revoked" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                    revoked
                  </span>
                )}
                <span className="text-xs text-white/30">
                  {i.transport === "shortcut" ? "ios shortcut" : "composio"}
                </span>
              </div>
              <p className="text-white/40 text-xs mt-1">{i.description}</p>
            </div>
            {i.connection?.status === "active" ? (
              <RevokeButton userId={session.userId} app={i.id} />
            ) : (
              <span className="text-xs text-white/40">
                connect via text:&nbsp;
                <span className="text-white/60">"connect {i.displayName}"</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
