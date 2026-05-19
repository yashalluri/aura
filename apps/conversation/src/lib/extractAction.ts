import type { ParsedAction } from "./types.js";

export function extractAction(raw: string): { text: string; action?: ParsedAction } {
  // Look for a JSON object on the last line
  const lines = raw.trim().split("\n");
  const lastLine = lines[lines.length - 1]?.trim() ?? "";

  if (lastLine.startsWith("{") && lastLine.endsWith("}")) {
    try {
      const parsed = JSON.parse(lastLine) as ParsedAction;
      if (parsed && typeof parsed === "object" && "action" in parsed) {
        const text = lines.slice(0, -1).join("\n").trim();
        return { text: text || "Got it!", action: parsed };
      }
    } catch {
      // Not valid JSON — treat whole thing as text
    }
  }

  return { text: raw.trim() };
}
