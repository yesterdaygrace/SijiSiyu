import test from "node:test";
import assert from "node:assert/strict";
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  parseCookies,
  secureRandomToken,
  sha256,
} from "../server/utils/security.js";

test("isEncryptionConfigured returns true when 64-hex key is set", () => {
  assert.equal(isEncryptionConfigured(), true);
});

test("encryptSecret and decryptSecret perform roundtrip AES-256-GCM encryption", () => {
  const secret = "threads_access_token_super_secret_12345!@#$%^&*()";
  const encrypted = encryptSecret(secret);

  assert.ok(encrypted.ciphertext.length > 0);
  assert.ok(encrypted.iv.length > 0);
  assert.ok(encrypted.tag.length > 0);

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret);
});

test("sha256 computes expected hash length", () => {
  const hash = sha256("test_session_token");
  assert.equal(hash.length, 64);
  assert.equal(typeof hash, "string");
  // Deterministic
  assert.equal(sha256("test_session_token"), hash);
});

test("secureRandomToken returns base64url random tokens", () => {
  const token1 = secureRandomToken(32);
  const token2 = secureRandomToken(32);
  assert.notEqual(token1, token2);
  assert.ok(token1.length >= 32);
});

test("constantTimeEqual compares strings safely", () => {
  assert.equal(constantTimeEqual("abc123state", "abc123state"), true);
  assert.equal(constantTimeEqual("abc123state", "wrong_state"), false);
});

test("parseCookies parses cookie headers into key-value map", () => {
  const header = "saved_session=abc123token; threads_oauth_state=xyz789; theme=dark";
  const parsed = parseCookies(header);
  assert.equal(parsed.saved_session, "abc123token");
  assert.equal(parsed.threads_oauth_state, "xyz789");
  assert.equal(parsed.theme, "dark");
});

test("parseCookies handles empty or undefined header", () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(""), {});
});
