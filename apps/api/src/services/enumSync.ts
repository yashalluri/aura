import {
  RelationshipType,
  FrequencyType,
  ToneMode,
} from "@prisma/client";
import {
  RELATIONSHIP_TYPES,
  FREQUENCY_TYPES,
  TONE_MODES,
} from "@aura/shared";

function setEq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const v of b) if (!setA.has(v)) return false;
  return true;
}

/**
 * Asserts that Prisma's generated enums match the string-literal unions in
 * `@aura/shared`. If you add a value in one place but not the other, this
 * fails loudly on boot (and in tests).
 */
export function assertEnumsInSync(): void {
  const prismaRel = Object.values(RelationshipType);
  const prismaFreq = Object.values(FrequencyType);
  const prismaTone = Object.values(ToneMode);

  if (!setEq(prismaRel, RELATIONSHIP_TYPES)) {
    throw new Error(
      `RelationshipType drift: prisma=${prismaRel.join(",")} shared=${RELATIONSHIP_TYPES.join(",")}`,
    );
  }
  if (!setEq(prismaFreq, FREQUENCY_TYPES)) {
    throw new Error(
      `FrequencyType drift: prisma=${prismaFreq.join(",")} shared=${FREQUENCY_TYPES.join(",")}`,
    );
  }
  if (!setEq(prismaTone, TONE_MODES)) {
    throw new Error(
      `ToneMode drift: prisma=${prismaTone.join(",")} shared=${TONE_MODES.join(",")}`,
    );
  }
}
