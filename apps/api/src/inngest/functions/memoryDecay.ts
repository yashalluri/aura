// Weekly memory decay job.
//
// Reduces importance of long-untouched memories; archives those below
// the threshold. Keeps the memory pool from getting noisy as users age.

import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import { decayMemories } from "../../services/memory.js";

export const memoryDecay: InngestFunction.Any = inngest.createFunction(
  {
    id: "memory-decay",
    triggers: [{ cron: "0 4 * * 0" }], // Sunday 4am UTC
  },
  async ({ logger }) => {
    const { decayed, archived } = await decayMemories();
    logger.info({ decayed, archived }, "memory decay run");
    return { decayed, archived };
  },
);
