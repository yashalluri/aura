// Style profile — measure how the user actually texts so Aura can mirror them.
//
// Computed from the user's own messages (role=user) over a recent window.
// Injected into the prompt as a compact block. The system prompt instructs
// the model to mirror these metrics — slang density, emoji rate, message
// length, vibe.
//
// Until we have ≥10 user messages the profile is null and we fall back to
// the default gen-z tone.

import { findInText, lookup } from "../llm/lexicon.js";

export interface StyleProfile {
  sampleSize: number;
  avgLength: number;              // chars per user message
  avgBurstSize: number;            // approx user messages per "turn" (sequential without assistant in between)
  lowercaseRatio: number;          // fraction of messages with no uppercase
  emojiRate: number;               // emoji per message
  topMarkers: string[];            // lexicon terms they use, ranked by frequency
  topEmoji: string[];              // emoji they use, ranked
  usesPeriodsOnFragments: number;  // fraction of fragments ending in period
  vibe: "dry" | "hyped" | "chatty" | "terse";
}

export interface ProfileInputMessage {
  role: "user" | "assistant";
  content: string;
}

const MIN_SAMPLES = 10;

const EMOJI_REGEX = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;

export function computeStyleProfile(messages: ProfileInputMessage[]): StyleProfile | null {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  if (userMessages.length < MIN_SAMPLES) return null;

  const sampleSize = userMessages.length;
  const totalChars = userMessages.reduce((sum, m) => sum + m.length, 0);
  const avgLength = totalChars / sampleSize;

  // Burst size: approximate by counting consecutive user messages in the sequence.
  let totalBursts = 0;
  let currentBurst = 0;
  let burstCount = 0;
  for (const m of messages) {
    if (m.role === "user") {
      currentBurst++;
    } else if (currentBurst > 0) {
      totalBursts += currentBurst;
      burstCount++;
      currentBurst = 0;
    }
  }
  if (currentBurst > 0) {
    totalBursts += currentBurst;
    burstCount++;
  }
  const avgBurstSize = burstCount > 0 ? totalBursts / burstCount : 1;

  // Lowercase ratio: messages with no uppercase letters.
  const lowercase = userMessages.filter((m) => !/[A-Z]/.test(m)).length;
  const lowercaseRatio = lowercase / sampleSize;

  // Emoji rate
  let emojiTotal = 0;
  const emojiCounts = new Map<string, number>();
  for (const m of userMessages) {
    const matches = m.match(EMOJI_REGEX) ?? [];
    emojiTotal += matches.length;
    for (const e of matches) {
      emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
    }
  }
  const emojiRate = emojiTotal / sampleSize;
  const topEmoji = [...emojiCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  // Slang markers via lexicon intersection
  const markerCounts = new Map<string, number>();
  for (const m of userMessages) {
    for (const entry of findInText(m)) {
      if (entry.register === "emoji") continue; // emoji counted separately
      markerCounts.set(entry.term, (markerCounts.get(entry.term) ?? 0) + 1);
    }
  }
  const topMarkers = [...markerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  // Period-on-fragment rate: short messages (<=3 words) ending in "."
  const fragments = userMessages.filter((m) => {
    const w = m.trim().split(/\s+/).filter(Boolean);
    return w.length > 0 && w.length <= 3;
  });
  const fragPeriods = fragments.filter((m) => m.trim().endsWith(".")).length;
  const usesPeriodsOnFragments = fragments.length ? fragPeriods / fragments.length : 0;

  // Vibe classification — emoji rate dominates other signals.
  let vibe: StyleProfile["vibe"];
  if (emojiRate > 0.6 || avgBurstSize > 2.5) {
    vibe = "hyped";
  } else if (avgLength > 60) {
    vibe = "chatty";
  } else if (avgLength < 15 && emojiRate < 0.2) {
    vibe = "terse";
  } else {
    vibe = "dry";
  }

  return {
    sampleSize,
    avgLength,
    avgBurstSize,
    lowercaseRatio,
    emojiRate,
    topMarkers,
    topEmoji,
    usesPeriodsOnFragments,
    vibe,
  };
}

/**
 * Format the profile into a compact prompt block. Returns "" if no profile.
 */
export function formatStyleProfile(profile: StyleProfile | null): string {
  if (!profile) return "";
  const markers = profile.topMarkers.length ? profile.topMarkers.join(", ") : "(none)";
  const emoji = profile.topEmoji.length ? profile.topEmoji.join(" ") : "(none)";
  const lower = Math.round(profile.lowercaseRatio * 100);
  const emojiPer = profile.emojiRate.toFixed(1);
  const burst = profile.avgBurstSize.toFixed(1);
  const len = Math.round(profile.avgLength);
  return `## How they actually text (mirror this)
avg message: ${len} chars, ~${burst} per turn
lowercase: ${lower}%
emoji rate: ${emojiPer}/msg ${emoji !== "(none)" ? `(${emoji})` : ""}
slang they use: ${markers}
vibe: ${profile.vibe} — match their density, do not exceed it`;
}

/**
 * Recommended marker budget per burst, derived from the profile.
 * Default 1 marker per 2-3 bursts when no profile.
 */
export function markerBudget(profile: StyleProfile | null): { perBurst: number; perReply: number } {
  if (!profile) return { perBurst: 0.5, perReply: 1.5 };
  if (profile.vibe === "hyped") return { perBurst: 1, perReply: 3 };
  if (profile.vibe === "chatty") return { perBurst: 0.6, perReply: 2 };
  if (profile.vibe === "terse") return { perBurst: 0.3, perReply: 1 };
  return { perBurst: 0.5, perReply: 1.5 };
}
