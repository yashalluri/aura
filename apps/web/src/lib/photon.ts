// Photon SMS — used by the settings login flow to send OTP codes.
//
// The marketing-site signup already POSTs to /projects/.../users to
// pre-create. For OTP we need to send the user a message. Spectrum's HTTP
// API for sending: POST /projects/:id/messages.

const PHOTON_PROJECT_ID = process.env.PHOTON_PROJECT_ID ?? "";
const PHOTON_PROJECT_SECRET = process.env.PHOTON_PROJECT_SECRET ?? "";
const PHOTON_BASE_URL = "https://spectrum.photon.codes";

export async function sendOtpViaPhoton(phoneNumber: string, code: string): Promise<boolean> {
  if (!PHOTON_PROJECT_ID || !PHOTON_PROJECT_SECRET) {
    console.error("photon not configured");
    return false;
  }
  const auth = Buffer.from(
    `${PHOTON_PROJECT_ID}:${PHOTON_PROJECT_SECRET}`,
  ).toString("base64");
  try {
    const res = await fetch(
      `${PHOTON_BASE_URL}/projects/${PHOTON_PROJECT_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          to: phoneNumber,
          provider: "imessage",
          content: { type: "text", text: `your aura settings code: ${code}` },
        }),
      },
    );
    return res.ok;
  } catch (err) {
    console.error("photon send failed", err);
    return false;
  }
}
