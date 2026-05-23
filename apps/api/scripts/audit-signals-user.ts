import { prisma } from "../src/lib/db.js";
const all = await prisma.signalEvent.findMany({ where: { userId: "cmpc4snqr0000ohjz34p4y6ke" }, orderBy: { createdAt: "desc" }, take: 5 });
console.log(`user signals: ${all.length}`);
for (const r of all) console.log(`  ${r.source}/${r.kind} → ${r.summary}`);
await prisma.$disconnect();
