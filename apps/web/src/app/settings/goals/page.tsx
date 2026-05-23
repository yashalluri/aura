import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { listGoals } from "@/lib/api";

export default async function GoalsPage() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  const goals = await listGoals(session.userId).catch(() => []);
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const other = goals.filter((g) => g.status === "paused" || g.status === "abandoned");

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">goals</h1>
      <p className="text-white/50 text-sm mb-8">
        add or update goals by texting me. e.g. "i want to ship aura v1 by august".
      </p>

      <Section title="active" items={active} />
      <Section title="done" items={done} muted />
      <Section title="paused / abandoned" items={other} muted />
    </>
  );
}

function Section({
  title,
  items,
  muted,
}: {
  title: string;
  items: Array<{ id: string; kind: string; title: string; why: string | null; status: string }>;
  muted?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-8">
      <p className="text-white/40 text-xs uppercase tracking-wide mb-3">{title}</p>
      <ul className="space-y-2">
        {items.map((g) => (
          <li
            key={g.id}
            className={`border border-white/10 rounded-lg px-4 py-3 ${muted ? "opacity-60" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-white/90">{g.title}</span>
              <span className="text-xs text-white/40">{g.kind}-term</span>
            </div>
            {g.why && <p className="text-white/50 text-sm mt-1">{g.why}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
