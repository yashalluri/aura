import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyOtpToken,
  makeSessionToken,
  OTP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  cookieOptions,
} from "@/lib/session";
import { getUserByPhone } from "@/lib/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { phone?: string; code?: string } | null;
  const phone = body?.phone;
  const code = body?.code;
  if (!phone || !code) {
    return NextResponse.json({ error: "phone + code required" }, { status: 400 });
  }

  const cookieStore = cookies();
  const otpToken = cookieStore.get(OTP_COOKIE_NAME)?.value;
  if (!otpToken || !verifyOtpToken(otpToken, phone, code)) {
    return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
  }

  const user = await getUserByPhone(phone);
  if (!user) {
    return NextResponse.json({ error: "no account — text Aura first" }, { status: 404 });
  }

  const session = makeSessionToken(user.id, phone);
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(SESSION_COOKIE_NAME, session, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });
  res.cookies.delete(OTP_COOKIE_NAME);
  return res;
}
