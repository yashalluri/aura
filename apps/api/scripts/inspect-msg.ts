import { prisma } from "../src/lib/db.js";
async function main() {
  const byContent = await prisma.message.findFirst({
    where: { content: { contains: "phase 3 encryption smoke" } },
  });
  const latest = await prisma.message.findFirst({
    orderBy: { createdAt: "desc" },
  });
  console.log("search-by-plaintext-substring:", byContent ? "FOUND (encryption FAILED — plaintext leaked)" : "NOT FOUND ✓ (content is ciphertext, plaintext substring doesn't match)");
  console.log("latest msg raw content (first 100):", latest?.content.slice(0, 100));
  console.log("isCiphertext (starts with v1:):", latest?.content.startsWith("v1:") ? "YES ✓" : "NO");
}
main().finally(() => prisma.$disconnect());
