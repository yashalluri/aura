"use client";

import { useState } from "react";

export function ExportButton() {
  const [loading, setLoading] = useState(false);

  async function onExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onExport}
      disabled={loading}
      className="px-4 py-2 bg-aura-purple/20 text-aura-purple border border-aura-purple/40 rounded-lg text-sm disabled:opacity-50"
    >
      {loading ? "preparing..." : "download my data"}
    </button>
  );
}
