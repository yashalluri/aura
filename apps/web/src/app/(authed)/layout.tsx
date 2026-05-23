// Auth-gated section. Anything under `(authed)` requires a valid session
// cookie. The /you 3D graph is the entire authed surface.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const payload = readSession(session);
  if (!payload) {
    redirect("/login");
  }
  return (
    <div className="min-h-screen bg-aura-black text-white">
      <header className="absolute top-0 right-0 z-10 p-4">
        <LogoutButton />
      </header>
      {children}
    </div>
  );
}
