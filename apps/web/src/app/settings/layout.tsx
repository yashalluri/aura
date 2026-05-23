import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  // The login page renders without this layout via grouping conventions;
  // for other settings pages, require a session.
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/settings" className="text-aura-purple font-medium text-sm tracking-wide">
          aura · settings
        </Link>
        <nav className="flex gap-6 text-sm text-white/60">
          <Link href="/settings/memories" className="hover:text-white">memories</Link>
          <Link href="/settings/integrations" className="hover:text-white">integrations</Link>
          <Link href="/settings/goals" className="hover:text-white">goals</Link>
          <Link href="/settings/audit" className="hover:text-white">audit</Link>
          <Link href="/settings/danger" className="hover:text-red-400">danger zone</Link>
          <form action="/api/auth/logout" method="POST">
            <button className="hover:text-white" type="submit">logout</button>
          </form>
        </nav>
      </header>
      <main className="flex-1 px-6 py-8 max-w-4xl w-full mx-auto">{children}</main>
    </div>
  );
}
