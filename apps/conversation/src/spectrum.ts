import { Spectrum, type SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { FastifyBaseLogger } from "fastify";
import { env } from "./env.js";
import { handleInbound } from "./lib/inboundHandler.js";
import { handleGroupInbound } from "./lib/groupInboundHandler.js";
import { burstDelayMs } from "./lib/burst.js";
import { normalizeInboundToText, type PhotonMessageContent } from "./lib/multimodal.js";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Defensive group detection. Photon's SDK shape varies across versions, so we
// probe several likely fields. If none indicate a group, we treat it as 1:1.
// Once you confirm Photon's actual group API, tighten this to the real field.
interface MaybeGroupSpace {
  id?: string;
  externalId?: string;
  isGroup?: boolean;
  type?: string;
  kind?: string;
  participants?: unknown[];
  members?: unknown[];
}

function detectGroup(space: unknown): { isGroup: boolean; externalId: string | null } {
  const s = space as MaybeGroupSpace;
  const externalId = s.externalId ?? s.id ?? null;
  if (s.isGroup === true) return { isGroup: true, externalId };
  if (s.type === "group" || s.kind === "group") return { isGroup: true, externalId };
  const participantCount =
    (Array.isArray(s.participants) ? s.participants.length : 0) ||
    (Array.isArray(s.members) ? s.members.length : 0);
  // >2 participants (the user + Aura + at least one more) => group.
  if (participantCount > 2) return { isGroup: true, externalId };
  return { isGroup: false, externalId };
}

export async function startInboundLoop(log: FastifyBaseLogger): Promise<void> {
  const app = await getSpectrumApp();
  log.info("spectrum: inbound loop started");

  for await (const [space, message] of app.messages) {
    const senderPhone = message.sender.id;
    const rawContent = message.content as unknown as PhotonMessageContent;

    // Normalize any inbound content type (text, image, voice note, etc.)
    // into a text representation the LLM can reason about.
    const text = await normalizeInboundToText(rawContent);
    if (!text) {
      log.info(
        { type: rawContent.type, sender: senderPhone },
        "inbound could not be normalized to text; skipping",
      );
      continue;
    }

    const { isGroup, externalId } = detectGroup(space);

    try {
      let bursts: string[];

      if (isGroup && externalId) {
        // Group chat: classify first; only respond if addressed.
        const senderName = (message.sender as { name?: string }).name;
        const result = await handleGroupInbound({
          externalId,
          senderPhone,
          senderName,
          text,
          log,
        });
        if (!result.shouldRespond) {
          continue; // Aura stays quiet in the group
        }
        bursts = result.bursts;
      } else {
        // 1:1 chat: full personal pipeline.
        bursts = await handleInbound(senderPhone, text, log);
      }

      for (let i = 0; i < bursts.length; i++) {
        const chunk = bursts[i];
        if (!chunk) continue;
        if (i > 0) await sleep(burstDelayMs());
        await space.send(chunk);
      }
    } catch (err) {
      log.error({ err, senderPhone, isGroup }, "inbound handler failed");
      try {
        if (!isGroup) {
          await space.send("something went wrong on my end\n\ntext me again in a sec?");
        }
      } catch (sendErr) {
        log.error({ err: sendErr }, "failed to send fallback reply");
      }
    }
  }
}
