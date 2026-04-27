/**
 * RFC 6238 TOTP (time-based one-time password) helper.
 *
 * Pure Web Crypto, no external dependency. Compatible with Google
 * Authenticator, 1Password, Authy, Yubico Authenticator.
 *
 * Wiring this into NextAuth login is the next step (NOT done here):
 *   - add a Prisma model `UserMfa { userId, secret, enabledAt, backupCodesHash[] }`
 *   - in `Credentials.authorize`, after password check, demand TOTP if mfa enabled
 *   - add /admin-v2/profile/security UI for enroll → show otpauth URL as QR + verify
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALGO = "SHA-1";
const SECRET_BYTES = 20; // 160-bit, RFC 6238 recommended for SHA-1

function base32Encode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(s: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateSecret(): string {
  const buf = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

function counterFromTime(time: number, step: number): Uint8Array {
  const counter = Math.floor(time / 1000 / step);
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  return buf;
}

async function hmac(secret: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const secretBuf = secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer;
  const messageBuf = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey("raw", secretBuf, { name: "HMAC", hash: ALGO }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, messageBuf);
  return new Uint8Array(sig);
}

export async function generateCode(secretBase32: string, time: number = Date.now()): Promise<string> {
  const secret = base32Decode(secretBase32);
  const counter = counterFromTime(time, STEP_SECONDS);
  const sig = await hmac(secret, counter);
  const offset = sig[sig.length - 1] & 0x0f;
  const truncated =
    ((sig[offset] & 0x7f) << 24) |
    (sig[offset + 1] << 16) |
    (sig[offset + 2] << 8) |
    sig[offset + 3];
  const code = (truncated % 10 ** DIGITS).toString().padStart(DIGITS, "0");
  return code;
}

export async function verifyCode(
  secretBase32: string,
  code: string,
  options: { window?: number; time?: number } = {}
): Promise<boolean> {
  const window = options.window ?? 1;
  const time = options.time ?? Date.now();
  for (let i = -window; i <= window; i++) {
    const candidate = await generateCode(secretBase32, time + i * STEP_SECONDS * 1000);
    if (constantTimeEqual(candidate, code.trim())) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}

export function otpauthUrl(params: { issuer: string; account: string; secret: string }): string {
  const issuer = encodeURIComponent(params.issuer);
  const account = encodeURIComponent(params.account);
  const secret = params.secret;
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(5);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codes;
}
