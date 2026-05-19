import twilio from "twilio";
import { env } from "../env.js";

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendSms(to: string, body: string): Promise<string> {
  const msg = await client.messages.create({
    to,
    from: env.TWILIO_PHONE_NUMBER,
    body,
  });
  return msg.sid;
}

/**
 * Validate an incoming Twilio webhook request signature.
 * Returns true if the request is authentic.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params,
  );
}
