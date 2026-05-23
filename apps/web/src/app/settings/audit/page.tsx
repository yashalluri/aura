import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { listAccesses } from "@/lib/api";

export default async function AuditPage() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  const accesses = await listAccesses(session.userId).catch(() => []);

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">audit trail</h1>
      <p className="text-white/50 text-sm mb-8">
        every time i pulled a memory into a reply. you can verify where every "you mentioned X" came from.
      </p>

      <ul className="space-y-1">
        {accesses.length === 0 && (
          <li className="text-white/40 text-sm">no memory accesses yet.</li>
        )}
        {accesses.map((a) => (
          <li
            key={a.id}
            className="text-xs text-white/60 border-l-2 border-white/10 pl-3 py-1"
          >
            <span className="text-white/90">{a.actor}</span>
            {a.context && <span className="text-white/40"> · {a.context}</span>}
            <span className="text-white/30 ml-2">
              {new Date(a.accessedAt).toLocaleString()}
            </span>
            <span className="text-white/20 ml-2">→ memory {a.memoryId.slice(0, 12)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
