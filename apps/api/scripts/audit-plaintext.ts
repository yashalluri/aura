import { prisma } from "../src/lib/db.js";
import { isCiphertext } from "../src/lib/crypto.js";
async function main() {
  const all = await prisma.message.findMany({ select: { id: true, content: true } });
  const plaintext = all.filter((m) => !isCiphertext(m.content));
  console.log(`total messages: ${all.length}`);
  console.log(`plaintext (UNENCRYPTED): ${plaintext.length}`);
  if (plaintext.length > 0) plaintext.slice(0, 3).forEach((m) => console.log(`  ${m.id}: ${m.content.slice(0, 60)}`));
}
main().finally(() => prisma.$disconnect());
