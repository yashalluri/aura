import type { FastifyPluginAsync } from "fastify";
import { validateTwilioSignature, sendSms } from "../lib/twilio.js";
import * as api from "../lib/apiClient.js";
import { generateResponse } from "../llm/aura.js";
import { executeAction } from "../lib/actions.js";
import { getHistory, addMessage } from "../lib/conversation.js";
import { env, isProd } from "../env.js";

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Twilio sends form-urlencoded POST
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const params: Record<string, string> = {};
        const str = typeof body === "string" ? body : body.toString();
        for (const pair of str.split("&")) {
          const [key, val] = pair.split("=");
          if (key && val !== undefined) {
            params[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, " "));
          }
        }
        done(null, params);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post("/sms/webhook", async (req, reply) => {
    const body = req.body as Record<string, string>;
    const from = body.From ?? "";
    const text = body.Body?.trim() ?? "";

    // ── Validate Twilio signature in production ──
    if (isProd) {
      const sig = (req.headers["x-twilio-signature"] as string) ?? "";
      const protocol = req.headers["x-forwarded-proto"] ?? "https";
      const host = req.headers["host"] ?? "localhost";
      const url = `${protocol}://${host}${req.url}`;

      if (!validateTwilioSignature(url, body, sig)) {
        req.log.warn({ from }, "invalid Twilio signature");
        return reply.code(403).send("Forbidden");
      }
    }

    if (!from || !text) {
      return reply.code(400).send(twiml("Missing From or Body"));
    }

    req.log.info({ from, text }, "inbound SMS");

    try {
      // 1. Get or create user
      const user = await api.getOrCreateUser(from);

      // 2. Get user context
      const [contacts, routines] = await Promise.all([
        api.getContacts(user.id),
        api.getRoutines(user.id),
      ]);

      // 3. Get conversation history
      const history = getHistory(from);

      // 4. Generate LLM response
      const auraResponse = await generateResponse(
        text,
        user,
        contacts,
        routines,
        history,
      );

      // 5. Execute any action the LLM decided on
      let replyText = auraResponse.text;
      if (auraResponse.action) {
        try {
          const actionResult = await executeAction(
            auraResponse.action,
            user.id,
            contacts,
            routines,
          );
          if (actionResult) {
            replyText = actionResult;
          }
        } catch (err) {
          req.log.error({ err, action: auraResponse.action }, "action failed");
        }
      }

      // 5b. Auto-flip onboarded once user has a name + at least one contact or routine
      if (!user.isOnboarded) {
        // Re-fetch to pick up any changes from actions above (set_name, add_contact, etc.)
        const [fresh, freshContacts, freshRoutines] = await Promise.all([
          api.getUser(user.id),
          api.getContacts(user.id),
          api.getRoutines(user.id),
        ]);
        if (fresh.name && (freshContacts.length > 0 || freshRoutines.length > 0)) {
          await api.updateUser(user.id, { isOnboarded: true });
          req.log.info({ userId: user.id }, "user onboarded");
        }
      }

      // 6. Update conversation history
      addMessage(from, { role: "user", content: text, timestamp: Date.now() });
      addMessage(from, { role: "assistant", content: replyText, timestamp: Date.now() });

      // 7. Reply via TwiML
      return reply
        .header("Content-Type", "text/xml")
        .send(twiml(replyText));
    } catch (err) {
      req.log.error({ err, from }, "webhook error");
      return reply
        .header("Content-Type", "text/xml")
        .send(twiml("Something went wrong on my end. Try again in a sec!"));
    }
  });
};

/** Build a minimal TwiML response */
function twiml(message: string): string {
  // Escape XML special chars
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
