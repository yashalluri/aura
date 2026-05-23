"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={handleLogout}
      className="text-white/40 hover:text-white/80 text-xs uppercase tracking-wider transition-colors"
    >
      log out
    </button>
  );
}
