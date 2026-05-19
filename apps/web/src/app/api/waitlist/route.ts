import { NextResponse } from "next/server";

const PHOTON_PROJECT_ID = process.env.PHOTON_PROJECT_ID ?? "";
const PHOTON_PROJECT_SECRET = process.env.PHOTON_PROJECT_SECRET ?? "";
const PHOTON_BASE_URL = "https://spectrum.photon.codes";

/**
 * Auto-add the submitter to our Photon project so they can text Aura.
 * On the Pro tier, users must be pre-whitelisted under Project → Users
 * before they can message in. This endpoint is the API-backed version of
 * that dashboard step.
 *
 * Idempotent: if Photon reports the user already exists, treat as success.
 */
export async function POST(request: Request) {
  if (!PHOTON_PROJECT_ID || !PHOTON_PROJECT_SECRET) {
    return NextResponse.json(
      { error: "Photon not configured" },
      { status: 500 },
    );
  }

  let phoneNumber: unknown;
  try {
    const body = (await request.json()) as { phoneNumber?: unknown };
    phoneNumber = body.phoneNumber;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof phoneNumber !== "string" || !/^\+\d{8,15}$/.test(phoneNumber)) {
    return NextResponse.json(
      { error: "phoneNumber must be E.164 (e.g. +14155551234)" },
      { status: 400 },
    );
  }

  const auth = Buffer.from(
    `${PHOTON_PROJECT_ID}:${PHOTON_PROJECT_SECRET}`,
  ).toString("base64");

  const res = await fetch(
    `${PHOTON_BASE_URL}/projects/${PHOTON_PROJECT_ID}/users/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ type: "shared", phoneNumber }),
    },
  );

  if (res.ok) {
    return NextResponse.json({ ok: true });
  }

  // Treat duplicate as success (idempotent signup).
  const text = await res.text();
  if (res.status === 409 || /exist|duplicate/i.test(text)) {
    return NextResponse.json({ ok: true, alreadyExisted: true });
  }

  return NextResponse.json(
    { error: `photon ${res.status}: ${text.slice(0, 200)}` },
    { status: res.status },
  );
}
