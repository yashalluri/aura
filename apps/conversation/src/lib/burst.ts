// Burst formatting — turn one LLM reply into 2-4 separate iMessages.
//
// Real friends text in bursts. One reply from the LLM gets split on blank
// lines (the model is prompted to use them as burst boundaries). If the
// model returns a wall of text, we fall back to sentence-level splitting
// with a 12-word cap. Always capped at 4 bursts.

const MAX_BURSTS = 4;
const HARD_MAX_WORDS_PER_BURST = 18; // hard ceiling for runaway sentences
const SOFT_TARGET_WORDS_PER_BURST = 12;

/**
 * Split LLM output into bursts. Each burst is a short iMessage.
 * Action JSON (if present) is stripped first (kept by caller, not sent).
 */
export function splitIntoBursts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Blank-line separator is the primary signal.
  const blocks = trimmed
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  let bursts: string[];

  if (blocks.length >= 2) {
    bursts = blocks;
  } else {
    // Wall-of-text fallback: sentence-level split.
    bursts = sentenceSplit(trimmed);
  }

  // Enforce max bursts: if more, merge tail into the last one.
  if (bursts.length > MAX_BURSTS) {
    const kept = bursts.slice(0, MAX_BURSTS - 1);
    const merged = bursts.slice(MAX_BURSTS - 1).join(" ");
    bursts = [...kept, merged];
  }

  // Soft per-burst cap: if any burst is huge, try to break it.
  bursts = bursts.flatMap(softBreak);
  if (bursts.length > MAX_BURSTS) {
    const kept = bursts.slice(0, MAX_BURSTS - 1);
    const merged = bursts.slice(MAX_BURSTS - 1).join(" ");
    bursts = [...kept, merged];
  }

  return bursts.map((b) => b.trim()).filter(Boolean);
}

function sentenceSplit(text: string): string[] {
  // Split on sentence boundaries, keeping the punctuation with the preceding sentence.
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return [text];
  }
  return parts;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function softBreak(burst: string): string[] {
  if (wordCount(burst) <= HARD_MAX_WORDS_PER_BURST) return [burst];
  // Try sentence-level break first.
  const sents = sentenceSplit(burst);
  if (sents.length > 1) return sents;
  // Last resort: hard split at the soft target.
  const words = burst.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += SOFT_TARGET_WORDS_PER_BURST) {
    out.push(words.slice(i, i + SOFT_TARGET_WORDS_PER_BURST).join(" "));
  }
  return out;
}

/**
 * Compute a small randomized delay (ms) to put between bursts when sending.
 * Real friends don't slam-fire texts simultaneously.
 */
export function burstDelayMs(): number {
  return 300 + Math.floor(Math.random() * 500); // 300-800ms
}
