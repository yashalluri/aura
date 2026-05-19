"use client";

import { useState } from "react";
import { copy } from "@/lib/copy";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
      setEmail("");
    } catch {
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
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 bg-white/5 border border-aura-border rounded-full px-5 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-aura-purple/50 text-sm"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-aura-purple hover:bg-aura-purple/80 text-white font-medium rounded-full px-6 py-3 text-sm transition-colors disabled:opacity-50"
      >
        {status === "loading" ? "..." : copy.waitlist.buttonText}
      </button>
      {status === "error" && (
        <p className="text-red-400 text-sm text-center sm:text-left">something went wrong, try again</p>
      )}
    </form>
  );
}
