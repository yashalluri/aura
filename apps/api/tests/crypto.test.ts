import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateUserKey, encrypt, decrypt, isCiphertext } from "../src/lib/crypto.js";

describe("crypto envelope", () => {
  it("generates a wrapped user key", () => {
    const k1 = generateUserKey();
    const k2 = generateUserKey();
    assert.notEqual(k1, k2, "user keys should be random");
    assert.ok(k1.startsWith("v1:"), "wrapped key uses v1 prefix");
  });

  it("encrypts and decrypts roundtrip", () => {
    const userKey = generateUserKey();
    const plaintext = "User has a sister named Maya in Brooklyn.";
    const cipher = encrypt(plaintext, userKey);
    assert.ok(isCiphertext(cipher));
    assert.notEqual(cipher, plaintext);
    const back = decrypt(cipher, userKey);
    assert.equal(back, plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const userKey = generateUserKey();
    const a = encrypt("hello", userKey);
    const b = encrypt("hello", userKey);
    assert.notEqual(a, b, "IV randomness means same plaintext != same ciphertext");
    assert.equal(decrypt(a, userKey), "hello");
    assert.equal(decrypt(b, userKey), "hello");
  });

  it("rejects tampered ciphertext", () => {
    const userKey = generateUserKey();
    const cipher = encrypt("real content", userKey);
    // flip a character in the ciphertext body
    const parts = cipher.split(":");
    parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith("A") ? "B" : "A");
    const tampered = parts.join(":");
    assert.throws(() => decrypt(tampered, userKey), /decrypt|auth|tag/i);
  });

  it("rejects ciphertext encrypted under a different user key", () => {
    const u1 = generateUserKey();
    const u2 = generateUserKey();
    const cipher = encrypt("private", u1);
    assert.throws(() => decrypt(cipher, u2));
  });

  it("isCiphertext discriminates", () => {
    assert.equal(isCiphertext("v1:abc:def"), true);
    assert.equal(isCiphertext("plain text"), false);
    assert.equal(isCiphertext(""), false);
  });
});
