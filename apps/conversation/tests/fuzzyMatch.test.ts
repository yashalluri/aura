import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch } from "../src/lib/fuzzyMatch.js";

const items = [
  { id: "c1", name: "Mom" },
  { id: "c2", name: "Jake from work" },
  { id: "c3", name: "Sarah" },
  { id: "c4", name: "Sarah B" },
];

describe("fuzzyMatch", () => {
  it("exact match (case-insensitive)", () => {
    const result = fuzzyMatch("mom", items);
    assert.equal(result?.id, "c1");
  });

  it("exact match with different casing", () => {
    const result = fuzzyMatch("MOM", items);
    assert.equal(result?.id, "c1");
  });

  it("substring match", () => {
    const result = fuzzyMatch("jake", items);
    assert.equal(result?.id, "c2");
  });

  it("reverse substring (query contains item name)", () => {
    const result = fuzzyMatch("called mom today", items);
    assert.equal(result?.id, "c1");
  });

  it("returns null when no match", () => {
    const result = fuzzyMatch("Bob", items);
    assert.equal(result, null);
  });

  it("returns null when multiple ambiguous substring matches", () => {
    // Both "Sarah" and "Sarah B" match "sarah"
    const result = fuzzyMatch("sarah", items);
    // "sarah" exact-matches "Sarah" (case-insensitive)
    assert.equal(result?.id, "c3");
  });

  it("returns null when multiple partial matches with no exact", () => {
    // "sar" matches both Sarah and Sarah B as substring
    const result = fuzzyMatch("sar", items);
    assert.equal(result, null);
  });

  it("handles empty items list", () => {
    const result = fuzzyMatch("anything", []);
    assert.equal(result, null);
  });

  it("handles whitespace in query", () => {
    const result = fuzzyMatch("  mom  ", items);
    assert.equal(result?.id, "c1");
  });
});
