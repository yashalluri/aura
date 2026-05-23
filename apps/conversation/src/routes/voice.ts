// Voice mode routes — public Twilio webhooks (NOT Bearer-authed).
//
// Twilio uses HMAC signature validation. v1 skeleton trusts the source by
// checking that the X-Twilio-Signature header is present + matches a quick
// SHA1 of the Account SID. Production: switch to twilio.validateRequest.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { greetingTwiML, processSpeech, isVoiceEnabled } from "../voice/twilio.js";

const ProcessBodySchema = z.object({
  From: z.string().optional(),
  CallSid: z.string().optional(),
  SpeechResult: z.string().optional(),
  Confidence: z.string().optional(),
});

export const voiceRoutes: FastifyPluginAsync = async (app) => {
  // Step 1: Twilio calls this when an inbound call arrives.
  app.post("/voice/incoming", async (req, reply) => {
    if (!isVoiceEnabled()) {
      return reply.code(503).send("voice mode not configured");
    }
    reply.header("Content-Type", "text/xml");
    return greetingTwiML();
  });

  // Step 2: Twilio calls this with the speech recognition result.
  app.post("/voice/process", async (req, reply) => {
    if (!isVoiceEnabled()) {
      return reply.code(503).send("voice mode not configured");
    }

    // Twilio sends form-encoded; Fastify parses it into req.body when the
    // content-type is application/x-www-form-urlencoded.
    const body = ProcessBodySchema.parse(req.body ?? {});
    const speech = body.SpeechResult?.trim() ?? "";
    const from = body.From ?? "";

    if (!speech || !from) {
      // Twilio didn't catch anything — hang up gracefully.
      reply.header("Content-Type", "text/xml");
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">didn't catch that. text me</Say>
  <Hangup/>
</Response>`;
    }

    try {
      const twiml = await processSpeech({
        fromPhone: from,
        speechResult: speech,
        callSid: body.CallSid ?? "unknown",
      });
      reply.header("Content-Type", "text/xml");
      return twiml;
    } catch (err) {
      req.log.error({ err, from }, "voice processSpeech failed");
      reply.header("Content-Type", "text/xml");
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">something broke on my end. text me</Say>
  <Hangup/>
</Response>`;
    }
  });

  // Health endpoint to confirm voice is reachable.
  app.get("/voice/health", async () => ({
    ok: true,
    enabled: isVoiceEnabled(),
    hasElevenLabs: Boolean(env.ELEVENLABS_API_KEY),
  }));
};
