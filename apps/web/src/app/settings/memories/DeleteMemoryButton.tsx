"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteMemoryButton({ userId, memoryId }: { userId: string; memoryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function onDelete() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setLoading(true);
    await fetch(`/api/settings/memories/${memoryId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={onDelete}
      disabled={loading}
      className={`text-xs px-3 py-1 rounded-md border whitespace-nowrap ${
        confirmed
          ? "border-red-400 text-red-400 hover:bg-red-400/10"
          : "border-white/20 text-white/60 hover:text-white"
      }`}
    >
      {loading ? "..." : confirmed ? "sure?" : "delete"}
    </button>
  );
}
