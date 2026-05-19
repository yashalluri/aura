/** Simple fuzzy match — case-insensitive substring or exact match */
export function fuzzyMatch(
  query: string,
  items: { id: string; name: string }[],
): { id: string; name: string } | null {
  const lower = query.toLowerCase().trim();

  // Exact match first
  const exact = items.find((i) => i.name.toLowerCase() === lower);
  if (exact) return exact;

  // Substring match
  const partial = items.filter((i) => i.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0]!;

  // Reverse substring (query contains item name)
  const reverse = items.filter((i) => lower.includes(i.name.toLowerCase()));
  if (reverse.length === 1) return reverse[0]!;

  return null;
}
