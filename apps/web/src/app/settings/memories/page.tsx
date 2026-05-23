import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { listMemories } from "@/lib/api";
import { DeleteMemoryButton } from "./DeleteMemoryButton";

export default async function MemoriesPage() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  const memories = await listMemories(session.userId).catch(() => []);

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">memories</h1>
      <p className="text-white/50 text-sm mb-8">
        everything i remember about u. delete any of these and i'll never bring it up again.
      </p>

      {memories.length === 0 && (
        <p className="text-white/40 text-sm">nothing saved yet. just keep talking 💜</p>
      )}

      <ul className="space-y-2">
        {memories.map((m) => (
          <li
            key={m.id}
            className="border border-white/10 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
          >
            <div className="flex-1">
              <p className="text-white/90 text-sm">{m.content}</p>
              <p className="text-white/30 text-xs mt-1">
                {m.kind} · importance {m.importance.toFixed(2)} · {new Date(m.createdAt).toLocaleDateString()}
                <span className="ml-2 text-white/20">from {m.source}</span>
              </p>
            </div>
            <DeleteMemoryButton userId={session.userId} memoryId={m.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
