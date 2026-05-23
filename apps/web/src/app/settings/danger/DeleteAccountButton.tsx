"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm" | "loading">("idle");
  const [typed, setTyped] = useState("");

  async function onDelete() {
    if (stage === "idle") {
      setStage("confirm");
      return;
    }
    if (typed !== "delete") return;
    setStage("loading");
    await fetch("/api/settings/account", { method: "DELETE" });
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div>
      {stage === "confirm" && (
        <div className="mb-3">
          <label className="text-white/60 text-xs block mb-2">
            type <span className="text-red-400">delete</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-400"
          />
        </div>
      )}
      <button
        onClick={onDelete}
        disabled={stage === "loading" || (stage === "confirm" && typed !== "delete")}
        className="px-4 py-2 bg-red-400/20 text-red-400 border border-red-400/40 rounded-lg text-sm disabled:opacity-30"
      >
        {stage === "loading"
          ? "wiping..."
          : stage === "confirm"
          ? "permanently delete"
          : "delete account"}
      </button>
    </div>
  );
}
