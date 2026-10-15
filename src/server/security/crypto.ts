import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { env } from "@/server/env";

// argon2id with OWASP-recommended parameters (m=19 MiB, t=2, p=1).
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };

export async function hashSecret(plain: string): Promise<string> {
  return argonHash(plain, ARGON);
}

export async function verifySecret(hashed: string | null | undefined, plain: string): Promise<boolean> {
  if (!hashed) {
    // Burn comparable time when the account/secret does not exist (no user enumeration via timing).
    await argonHash(plain, ARGON);
    return false;
  }
  try {
    return await argonVerify(hashed, plain);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Keyed hash for low-entropy codes (OTP, recovery codes) so DB leaks cannot be brute-forced offline without the key. */
export function hmac(value: string, purpose = "default"): string {
  return createHmac("sha256", `${env().SESSION_SECRET}:${purpose}`).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomCode(groups: number, groupLen = 4): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < groupLen; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    parts.push(s);
  }
  return parts.join("-");
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`${env().SESSION_SECRET}:enc:v1`).digest();
}

/** AES-256-GCM; output = base64url(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function decrypt(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** HMAC-signed, expiring value for cookies/links that must not be forged (e.g. OAuth state). */
export function sign(value: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${Buffer.from(value).toString("base64url")}.${exp}`;
  return `${body}.${hmac(body, "sign")}`;
}

export function unsign(token: string | undefined | null): string | null {
  if (!token) return null;
  const [b64, exp, mac] = token.split(".");
  if (!b64 || !exp || !mac) return null;
  if (!safeEqual(mac, hmac(`${b64}.${exp}`, "sign"))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return Buffer.from(b64, "base64url").toString("utf8");
}

// ── TOTP (RFC 6238, SHA-1, 30s, 6 digits) ──────────────────────────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpGenerateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const bin = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totpVerify(secret: string, code: string, now = Date.now()): boolean {
  const counter = Math.floor(now / 30_000);
  const clean = code.replace(/\s/g, "");
  // Accept ±1 step for clock drift.
  return [-1, 0, 1].some((w) => safeEqual(totpCode(secret, counter + w), clean));
}

export function totpUri(secret: string, account: string): string {
  return `otpauth://totp/ANOR:${encodeURIComponent(account)}?secret=${secret}&issuer=ANOR&algorithm=SHA1&digits=6&period=30`;
}
