import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEXICON,
  lookup,
  findInText,
  getActiveCore,
  formatLexicon,
  ACTIVE_CORE_TERMS,
} from "../src/llm/lexicon.js";

describe("LEXICON schema", () => {
  it("has no duplicate canonical terms", () => {
    const seen = new Set<string>();
    for (const entry of LEXICON) {
      assert.ok(!seen.has(entry.term), `duplicate term: ${entry.term}`);
      seen.add(entry.term);
    }
  });

  it("every entry has at least one source", () => {
    for (const entry of LEXICON) {
      assert.ok(entry.sources.length > 0, `entry ${entry.term} has no sources`);
    }
  });

  it("every entry has at least one example", () => {
    for (const entry of LEXICON) {
      assert.ok(
        entry.examples_correct.length > 0,
        `entry ${entry.term} has no examples_correct`,
      );
    }
  });

  it("contains the famous 'ig' anti-pattern entry", () => {
    const ig = lookup("ig");
    assert.ok(ig, "'ig' must be in the lexicon");
    assert.ok(ig!.meaning.toLowerCase().includes("i guess"));
    assert.ok(
      ig!.examples_wrong && ig!.examples_wrong.some((s) => s.toLowerCase().includes("instagram")),
      "'ig' must have an anti-example calling out Instagram",
    );
  });

  it("blocks 😂 from generation (parent-coded)", () => {
    const e = lookup("😂");
    assert.ok(e);
    assert.equal(e!.generate, false, "😂 must be marked generate: false");
  });

  it("blocks the 2026 cringe leaderboard from generation", () => {
    for (const t of ["skibidi", "sigma", "6-7", "slay", "cheugy"]) {
      const e = lookup(t);
      assert.ok(e, `expected lexicon entry for ${t}`);
      assert.equal(e!.generate, false, `${t} must be generate:false`);
    }
  });

  it("allows the invisible-common Gen Z markers to generate", () => {
    for (const t of ["fr", "ngl", "lowkey", "tbh", "atp", "lol", "bro", "deadass", "ig"]) {
      const e = lookup(t);
      assert.ok(e, `expected lexicon entry for ${t}`);
      assert.equal(e!.generate, true, `${t} should be generate:true`);
    }
  });
});

describe("findInText", () => {
  it("finds simple words", () => {
    const found = findInText("fr that was wild");
    const terms = found.map((e) => e.term);
    assert.ok(terms.includes("fr"));
  });

  it("finds bigrams", () => {
    const found = findInText("no cap that was the best meal");
    const terms = found.map((e) => e.term);
    assert.ok(terms.includes("no cap"));
  });

  it("matches variants (e.g. 'nah' for 'nahh')", () => {
    const found = findInText("nah bro");
    const terms = found.map((e) => e.term);
    assert.ok(terms.includes("nahh"));
  });

  it("finds emoji", () => {
    const found = findInText("lol 💀");
    const terms = found.map((e) => e.term);
    assert.ok(terms.includes("💀"));
  });

  it("returns empty for plain text with no lexicon terms", () => {
    const found = findInText("the quick brown fox jumps over the lazy dog");
    assert.equal(found.length, 0);
  });
});

describe("getActiveCore", () => {
  it("returns lexicon entries for every term in ACTIVE_CORE_TERMS", () => {
    const core = getActiveCore();
    assert.equal(core.length, ACTIVE_CORE_TERMS.length);
  });
});

describe("formatLexicon", () => {
  it("includes the heading and term lines", () => {
    const formatted = formatLexicon(getActiveCore());
    assert.ok(formatted.includes("Slang lexicon"));
    assert.ok(formatted.includes("fr"));
    assert.ok(formatted.includes("ngl"));
  });

  it("flags RECOGNIZE-ONLY terms differently than USE terms", () => {
    const skibidi = lookup("skibidi");
    const fr = lookup("fr");
    const formatted = formatLexicon([skibidi!, fr!]);
    assert.ok(formatted.includes("RECOGNIZE-ONLY"));
    assert.ok(formatted.includes("USE"));
  });

  it("returns empty string for empty entry list", () => {
    assert.equal(formatLexicon([]), "");
  });
});
