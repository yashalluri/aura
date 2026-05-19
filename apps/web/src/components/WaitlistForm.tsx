"use client";

import { useState } from "react";
import { copy } from "@/lib/copy";

/**
 * Best-effort normalization to E.164. Strips everything but digits and a leading
 * "+". If the user typed a US number without country code, prefix +1.
 */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  // US default
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function WaitlistForm() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setErrorMsg("enter a valid phone number");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalized }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "failed");
      }
      setStatus("done");
      setPhone("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="text-aura-purple text-lg font-medium text-center">
        {copy.waitlist.successText}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
    >
      <input
        type="tel"
        required
        inputMode="tel"
        autoComplete="tel"
        placeholder={copy.waitlist.placeholder}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="flex-1 bg-white/5 border border-aura-border rounded-full px-5 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-aura-purple/50 text-sm"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-aura-purple hover:bg-aura-purple/80 text-white font-medium rounded-full px-6 py-3 text-sm transition-colors disabled:opacity-50"
      >
        {status === "loading" ? "..." : copy.waitlist.buttonText}
      </button>
      {status === "error" && errorMsg && (
        <p className="text-red-400 text-sm text-center sm:text-left">
          {errorMsg}
        </p>
      )}
    </form>
  );
}
