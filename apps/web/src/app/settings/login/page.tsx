"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/settings";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "couldn't send code");
        return;
      }
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "invalid code");
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-aura-purple font-medium text-sm tracking-wide mb-6">
          aura settings
        </p>

        {step === "phone" ? (
          <form onSubmit={startOtp}>
            <h1 className="text-2xl font-semibold text-white mb-2">log in</h1>
            <p className="text-white/50 text-sm mb-6">
              we'll text u a 6-digit code via aura
            </p>
            <input
              type="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-aura-purple"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-aura-purple text-white font-medium py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? "sending..." : "send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <h1 className="text-2xl font-semibold text-white mb-2">enter code</h1>
            <p className="text-white/50 text-sm mb-6">sent to {phone}</p>
            <input
              type="text"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              inputMode="numeric"
              maxLength={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-aura-purple"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-aura-purple text-white font-medium py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? "checking..." : "log in"}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="mt-2 w-full text-white/50 text-sm py-2"
            >
              ← change number
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
