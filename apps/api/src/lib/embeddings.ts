// Embedding generation via OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens).
// Used by memory + entity services. Falls back to a zero vector if the API is
// unavailable, so we never block writes on embedding failure — recall just
// won't surface that memory until re-embedded.

import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const EMBEDDING_DIM = 1536;
export const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Get a single embedding. Returns a 1536-dim float array.
 * On failure logs and returns null so callers can choose to skip the row.
 */
export async function embed(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed.slice(0, 8000), // input cap to stay well under 8191 tokens
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("embed failed", err);
    return null;
  }
}

/**
 * Batch embed up to ~100 strings. More efficient than embed() in a loop.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const inputs = texts.map((t) => t.trim().slice(0, 8000)).filter((t) => t.length > 0);
  if (!inputs.length) return texts.map(() => null);
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs,
    });
    // Map back to original positions, accounting for filtered empties.
    const out: (number[] | null)[] = [];
    let i = 0;
    for (const t of texts) {
      if (!t.trim()) {
        out.push(null);
      } else {
        out.push(res.data[i]?.embedding ?? null);
        i++;
      }
    }
    return out;
  } catch (err) {
    console.error("embedBatch failed", err);
    return texts.map(() => null);
  }
}

/**
 * Format a number[] as the pgvector text literal: "[0.1, 0.2, ...]"
 * Used when writing via $executeRawUnsafe since prisma doesn't support
 * the vector type natively.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
