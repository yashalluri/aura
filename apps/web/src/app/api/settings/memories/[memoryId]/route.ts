import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { deleteMemory } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: { memoryId: string } },
) {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteMemory(session.userId, params.memoryId);
  return NextResponse.json({ ok: true });
}
