import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { revokeIntegration } from "@/lib/api";

export async function POST(
  _req: Request,
  { params }: { params: { app: string } },
) {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await revokeIntegration(session.userId, params.app);
  return NextResponse.json({ ok: true });
}
