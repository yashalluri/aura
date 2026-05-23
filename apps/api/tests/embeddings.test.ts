import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toVectorLiteral, EMBEDDING_DIM, EMBEDDING_MODEL } from "../src/lib/embeddings.js";

describe("embeddings constants + helpers", () => {
  it("EMBEDDING_DIM is 1536 (text-embedding-3-small)", () => {
    assert.equal(EMBEDDING_DIM, 1536);
  });

  it("EMBEDDING_MODEL is text-embedding-3-small", () => {
    assert.equal(EMBEDDING_MODEL, "text-embedding-3-small");
  });

  it("toVectorLiteral formats a number array as pgvector literal", () => {
    assert.equal(toVectorLiteral([1, 2, 3]), "[1,2,3]");
    assert.equal(toVectorLiteral([0.1, 0.2, -0.3]), "[0.1,0.2,-0.3]");
    assert.equal(toVectorLiteral([]), "[]");
  });

  it("toVectorLiteral handles a real-sized 1536-dim vector", () => {
    const v = new Array(1536).fill(0).map((_, i) => i * 0.001);
    const out = toVectorLiteral(v);
    assert.ok(out.startsWith("[0,"));
    assert.ok(out.endsWith(`]`));
    // Spot-check a value
    assert.ok(out.includes("0.5"));
  });
});
