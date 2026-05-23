// Settings auth — phone + OTP via Photon's SMS, JWT cookie for session.
//
// Stateless OTP: the /api/auth/start endpoint generates a 6-digit code,
// hashes it, and sets an HTTP-only cookie containing
//   { phone, codeHash, exp }
// signed with AUTH_SECRET. /api/auth/verify reads the cookie, hashes the
// submitted code, compares. On success we set a long-lived session cookie
// with userId.
//
// No new DB table required.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "aura_session";
const OTP_COOKIE = "aura_otp";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.INTERNAL_API_SECRET ?? "";
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET (or INTERNAL_API_SECRET as fallback) must be ≥16 chars");
  }
  return s;
}

function hash(s: string): string {
  return createHmac("sha256", secret()).update(s).digest("base64url");
}

function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function makeOtpToken(phone: string, code: string): string {
  return sign({
    phone,
    codeHash: hash(code),
    exp: Date.now() + OTP_TTL_MS,
  });
}

export function verifyOtpToken(token: string, phone: string, code: string): boolean {
  const parsed = verify(token);
  if (!parsed) return false;
  if (parsed.phone !== phone) return false;
  const expected = parsed.codeHash as string;
  if (typeof expected !== "string") return false;
  const actual = hash(code);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function makeSessionToken(userId: string, phone: string): string {
  return sign({ userId, phone, exp: Date.now() + SESSION_TTL_MS });
}

export function readSession(token: string | undefined): { userId: string; phone: string } | null {
  if (!token) return null;
  const parsed = verify(token);
  if (!parsed) return null;
  if (typeof parsed.userId !== "string" || typeof parsed.phone !== "string") return null;
  return { userId: parsed.userId, phone: parsed.phone };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const OTP_COOKIE_NAME = OTP_COOKIE;

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
