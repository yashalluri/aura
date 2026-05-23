import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterContent, assertSafe, FilterRejection } from "../src/lib/contentFilters.js";

describe("content filters", () => {
  it("allows benign text", () => {
    const r = filterContent("hey what's up tonight");
    assert.equal(r.safe, true);
    assert.deepEqual(r.matches, []);
    assert.equal(r.redacted, "hey what's up tonight");
  });

  it("catches SSNs", () => {
    const r = filterContent("ssn 123-45-6789 don't lose it");
    assert.equal(r.safe, false);
    assert.ok(r.matches.includes("ssn"));
    assert.ok(r.redacted.includes("[REDACTED_SSN]"));
  });

  it("catches API keys", () => {
    const r = filterContent("the key is sk-abcdef0123456789ABCDEF");
    assert.equal(r.safe, false);
    assert.ok(r.matches.includes("api_key"));
  });

  it("catches password disclosures", () => {
    const r = filterContent("password: hunter22");
    assert.equal(r.safe, false);
    assert.ok(r.matches.includes("password"));
  });

  it("catches AWS keys", () => {
    const r = filterContent("AKIAIOSFODNN7EXAMPLE leaked");
    assert.equal(r.safe, false);
    assert.ok(r.matches.includes("aws_key"));
  });

  it("assertSafe throws on bad content", () => {
    assert.throws(() => assertSafe("ssn 123-45-6789"), FilterRejection);
  });

  it("assertSafe returns the original text when safe", () => {
    assert.equal(assertSafe("normal text"), "normal text");
  });
});
