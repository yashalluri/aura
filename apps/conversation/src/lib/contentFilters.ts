// Outbound content guard — stop the LLM from receiving (or echoing back)
// obviously-sensitive secrets like SSNs, API keys, passwords. This is a
// cheap last-line-of-defense regex pass, not a substitute for proper PII
// redaction (Sprint 4 v2).

const SENSITIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "credit_card", pattern: /\b(?:\d[ -]*?){13,19}\b/ },
  { name: "api_key", pattern: /\b(sk-[A-Za-z0-9_-]{20,}|api[_-]?key[\s=:]+[\w-]{12,})/i },
  { name: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "password", pattern: /\b(password|passwd|pwd)\s*[:=]\s*\S{4,}/i },
  { name: "2fa", pattern: /\b(2fa|otp|mfa|tfa)\s+(?:code|token)\b/i },
];

export interface FilterResult {
  safe: boolean;
  redacted: string;
  matches: string[]; // names of matched patterns
}

/**
 * Scan text for sensitive content. Returns redacted text + list of matched
 * pattern names. If safe=false, the caller should warn the user instead of
 * sending the content to the LLM.
 */
export function filterContent(text: string): FilterResult {
  const matches: string[] = [];
  let redacted = text;
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(redacted)) {
      matches.push(name);
      redacted = redacted.replace(pattern, `[REDACTED_${name.toUpperCase()}]`);
    }
  }
  return { safe: matches.length === 0, redacted, matches };
}

/**
 * Convenience wrapper: returns the original text if safe, otherwise throws
 * a FilterRejection with the matched pattern names.
 */
export class FilterRejection extends Error {
  constructor(public matches: string[]) {
    super(`content rejected: matched sensitive patterns: ${matches.join(", ")}`);
  }
}

export function assertSafe(text: string): string {
  const r = filterContent(text);
  if (!r.safe) throw new FilterRejection(r.matches);
  return text;
}
