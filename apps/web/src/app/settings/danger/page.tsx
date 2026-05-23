import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { ExportButton } from "./ExportButton";
import { DeleteAccountButton } from "./DeleteAccountButton";

export default async function DangerPage() {
  const session = readSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  return (
    <>
      <h1 className="text-2xl font-semibold text-white mb-1">danger zone</h1>
      <p className="text-white/50 text-sm mb-8">
        export everything i know about u. or wipe the slate.
      </p>

      <div className="space-y-6">
        <div className="border border-white/10 rounded-xl p-6">
          <h2 className="text-white font-medium mb-2">export everything</h2>
          <p className="text-white/50 text-sm mb-4">
            download a json file with every message, memory, signal event, entity, and audit row.
            memories are decrypted in the export.
          </p>
          <ExportButton />
        </div>

        <div className="border border-red-400/30 rounded-xl p-6">
          <h2 className="text-red-400 font-medium mb-2">delete my account</h2>
          <p className="text-white/50 text-sm mb-4">
            irreversible. wipes every memory, message, integration, goal, and audit row.
            you can sign up again later but everything starts fresh.
          </p>
          <DeleteAccountButton />
        </div>
      </div>
    </>
  );
}
