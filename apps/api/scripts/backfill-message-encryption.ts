// Backfill encryption for Message rows created before Phase 3 (when
// Message.content was stored plaintext). Idempotent — rows that already
// look like v1:... ciphertext are skipped. Safe to re-run.
//
// Operator script. Run once after Phase 3 lands:
//   cd apps/api && npx tsx --env-file=../../.env scripts/backfill-message-encryption.ts

import { prisma } from "../src/lib/db.js";
import { encrypt, isCiphertext } from "../src/lib/crypto.js";

const BATCH_SIZE = 200;

async function main(): Promise<void> {
  let totalEncrypted = 0;
  let totalSkippedCiphertext = 0;
  let totalSkippedNoKey = 0;

  // Page through users so each batch only loads one user's enc_key once.
  const users = await prisma.user.findMany({
    select: { id: true, encKey: true },
  });

  for (const u of users) {
    if (!u.encKey) {
      const count = await prisma.message.count({ where: { userId: u.id } });
      if (count > 0) {
        console.warn(
          `⚠ user ${u.id} has ${count} messages but no encKey — run backfill-enc-keys.ts first`,
        );
        totalSkippedNoKey += count;
      }
      continue;
    }

    let cursor: string | undefined = undefined;
    for (;;) {
      const batch = await prisma.message.findMany({
        where: { userId: u.id },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, content: true },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!.id;

      for (const m of batch) {
        if (isCiphertext(m.content)) {
          totalSkippedCiphertext++;
          continue;
        }
        const encrypted = encrypt(m.content, u.encKey);
        await prisma.message.update({
          where: { id: m.id },
          data: { content: encrypted },
        });
        totalEncrypted++;
      }
    }
  }

  console.log(`✓ encrypted ${totalEncrypted} plaintext message(s)`);
  console.log(`  skipped (already ciphertext): ${totalSkippedCiphertext}`);
  if (totalSkippedNoKey > 0) {
    console.log(`  skipped (no encKey): ${totalSkippedNoKey} — run backfill-enc-keys.ts and re-run this script`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
