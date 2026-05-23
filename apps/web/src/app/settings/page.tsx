import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  apiGet,
  listMemories,
  listIntegrations,
  listGoals,
  listAccesses,
  type User,
} from "@/lib/api";
import Link from "next/link";

export default async function SettingsHome() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null; // middleware redirects

  const [user, memories, integrations, goals, accesses] = await Promise.all([
    apiGet<User>(`/internal/users/${session.userId}`),
    listMemories(session.userId).catch(() => []),
    listIntegrations(session.userId).catch(() => []),
    listGoals(session.userId).catch(() => []),
    listAccesses(session.userId).catch(() => []),
  ]);

  const connectedCount = integrations.filter((i) => i.connection?.status === "active").length;
  const activeGoals = goals.filter((g) => g.status === "active").length;

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">
        {user.name ? `hi ${user.name}` : "settings"}
      </h1>
      <p className="text-white/50 text-sm mb-8">{user.phoneNumber}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          href="/settings/memories"
          title="memories"
          count={memories.length}
          label={`${memories.length} thing${memories.length === 1 ? "" : "s"} i remember about u`}
        />
        <Card
          href="/settings/integrations"
          title="integrations"
          count={connectedCount}
          label={`${connectedCount} of ${integrations.length} connected`}
        />
        <Card
          href="/settings/goals"
          title="goals"
          count={activeGoals}
          label={`${activeGoals} active`}
        />
        <Card
          href="/settings/audit"
          title="audit trail"
          count={accesses.length}
          label="every time i pulled a memory"
        />
      </div>

      <div className="mt-12">
        <Link
          href="/settings/danger"
          className="text-red-400/70 hover:text-red-400 text-sm"
        >
          danger zone →
        </Link>
      </div>
    </>
  );
}

function Card({ href, title, count, label }: { href: string; title: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      className="border border-white/10 rounded-xl p-5 hover:border-aura-purple transition-colors block"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-white/60 text-sm">{title}</span>
        <span className="text-white text-2xl font-semibold">{count}</span>
      </div>
      <p className="text-white/40 text-xs">{label}</p>
    </Link>
  );
}
