import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { deleteUser } from "@/lib/api";

export async function DELETE() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteUser(session.userId);
  return NextResponse.json({ ok: true });
}
