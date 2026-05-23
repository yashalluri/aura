// /you — the single 3D memory-graph surface. The entire authenticated web
// product is this one page.
//
// Loads in three layers:
//   1. People (Entity kind=person) — anchor nodes, brightest, largest.
//   2. Memories — orbit their subject if it resolves to a person/place/topic,
//      otherwise float free.
//   3. Episodes — placeholder for Phase-5+ when episodic summaries land.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { apiGet } from "@/lib/api";
import { MemoryGraph } from "@/components/memory/MemoryGraph";

interface Entity {
  id: string;
  kind: string;
  canonical: string;
  aliases: string[];
}
interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  confidence: number;
  source: string;
  createdAt: string;
  lastRecalledAt: string | null;
}

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const payload = readSession(session);
  if (!payload) redirect("/login");

  const [entities, memories] = await Promise.all([
    apiGet<Entity[]>(`/internal/users/${payload.userId}/entities`),
    apiGet<Memory[]>(`/internal/users/${payload.userId}/memories`),
  ]);

  return (
    <main className="w-screen h-screen overflow-hidden">
      <MemoryGraph
        userId={payload.userId}
        initialEntities={entities}
        initialMemories={memories}
      />
    </main>
  );
}
