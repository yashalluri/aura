import { Spectrum, type SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { FastifyBaseLogger } from "fastify";
import { env } from "./env.js";
import { handleInbound } from "./lib/inboundHandler.js";

let appPromise: Promise<SpectrumInstance> | null = null;

export function getSpectrumApp(): Promise<SpectrumInstance> {
  if (!appPromise) {
    appPromise = Spectrum({
      projectId: env.PHOTON_PROJECT_ID,
      projectSecret: env.PHOTON_PROJECT_SECRET,
      providers: [imessage.config()],
    });
  }
  return appPromise;
}

export async function startInboundLoop(log: FastifyBaseLogger): Promise<void> {
  const app = await getSpectrumApp();
  log.info("spectrum: inbound loop started");

  for await (const [space, message] of app.messages) {
    if (message.content.type !== "text") {
      log.info(
        { type: message.content.type, sender: message.sender.id },
        "non-text inbound; skipping for now",
      );
      continue;
    }

    const senderPhone = message.sender.id;
    const text = message.content.text;

    try {
      const reply = await handleInbound(senderPhone, text, log);
      await space.send(reply);
    } catch (err) {
      log.error({ err, senderPhone }, "inbound handler failed");
      try {
        await space.send("something went wrong on my end. text me again in a sec?");
      } catch (sendErr) {
        log.error({ err: sendErr }, "failed to send fallback reply");
      }
    }
  }
}
