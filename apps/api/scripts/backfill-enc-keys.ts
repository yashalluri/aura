// Backfill per-user encryption keys for users created before Phase 1 (where
// User.encKey was null). Idempotent — only touches rows where encKey is null.
// Run once after Phase 1 lands; safe to re-run.

import { prisma } from "../src/lib/db.js";
import { generateUserKey } from "../src/lib/crypto.js";

async function main(): Promise<void> {
  const usersWithoutKey = await prisma.user.findMany({
    where: { encKey: null },
    select: { id: true, phoneNumber: true },
  });

  if (usersWithoutKey.length === 0) {
    console.log("✓ no backfill needed — all users have encKey");
    return;
  }

  console.log(`backfilling encKey for ${usersWithoutKey.length} user(s)...`);
  for (const u of usersWithoutKey) {
    const encKey = generateUserKey();
    await prisma.user.update({ where: { id: u.id }, data: { encKey } });
    console.log(`  ✓ ${u.id} (${u.phoneNumber})`);
  }
  console.log("done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
