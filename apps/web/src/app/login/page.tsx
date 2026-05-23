// Phone-number login. Step 1: enter phone → SMS code arrives via Aura's line.
// Step 2: enter code → session cookie + redirect to /you.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function startLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("enter a valid phone number");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "send failed");
      setPhone(normalized);
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "invalid code");
      router.push("/you");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-aura-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-medium mb-2">aura</h1>
        <p className="text-white/60 text-sm mb-8">
          {stage === "phone"
            ? "enter your number to see your aura"
            : "we sent you a code — check your messages"}
        </p>

        {stage === "phone" ? (
          <form onSubmit={startLogin} className="space-y-3">
            <input
              type="tel"
              autoFocus
              required
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 555-1234"
              className="w-full bg-white/5 border border-aura-border rounded-full px-5 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-aura-purple/50"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-aura-purple hover:bg-aura-purple/80 text-white font-medium rounded-full px-6 py-3 transition-colors disabled:opacity-50"
            >
              {busy ? "sending…" : "send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <input
              type="text"
              autoFocus
              required
              maxLength={6}
              inputMode="numeric"
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit code"
              className="w-full bg-white/5 border border-aura-border rounded-full px-5 py-3 text-white text-center text-2xl tracking-widest placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-aura-purple/50"
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full bg-aura-purple hover:bg-aura-purple/80 text-white font-medium rounded-full px-6 py-3 transition-colors disabled:opacity-50"
            >
              {busy ? "verifying…" : "enter your aura"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("phone");
                setCode("");
                setError(null);
              }}
              className="w-full text-white/40 hover:text-white/80 text-sm pt-2"
            >
              different number?
            </button>
          </form>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    </main>
  );
}
