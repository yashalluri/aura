// Quick operator helper: list the most recent signal_events to verify the
// ingestion pipeline is writing rows.

import { prisma } from "../src/lib/db.js";

async function main(): Promise<void> {
  const rows = await prisma.signalEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`signal_events count (latest 10): ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  ${r.createdAt.toISOString()} ${r.source}/${r.kind} → ${r.summary}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
