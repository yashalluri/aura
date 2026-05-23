import { NextResponse } from "next/server";
import { generateOtp, makeOtpToken, OTP_COOKIE_NAME, cookieOptions } from "@/lib/session";
import { sendOtpViaPhoton } from "@/lib/photon";

const PHONE_REGEX = /^\+\d{8,15}$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { phone?: string } | null;
  const phone = body?.phone;
  if (!phone || !PHONE_REGEX.test(phone)) {
    return NextResponse.json(
      { error: "phone must be E.164 (e.g. +14155551234)" },
      { status: 400 },
    );
  }

  const code = generateOtp();
  const token = makeOtpToken(phone, code);
  const sent = await sendOtpViaPhoton(phone, code);
  if (!sent) {
    return NextResponse.json({ error: "couldn't send code" }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(OTP_COOKIE_NAME, token, { ...cookieOptions, maxAge: 600 });
  return res;
}
