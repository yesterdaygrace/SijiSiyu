import "dotenv/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex key. Generate one with: openssl rand -hex 32",
    );
  }
  return Buffer.from(raw, "hex");
}

export function isEncryptionConfigured(): boolean {
  return /^[a-fA-F0-9]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "");
}

export function encryptSecret(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptSecret(value: EncryptedValue): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function secureRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return [];
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [[key, value]];
      }
    }),
  );
}

export const parseCookies = parseCookieHeader;
