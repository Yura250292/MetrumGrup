import { randomBytes } from "node:crypto";

/**
 * Криптографічно випадковий бідовий токен для RFQRecipient.accessToken.
 * 32 байти (256 біт ентропії) → ~43 символів base64url. Знаючи один валідний
 * токен не можна вгадати інший. Не плутати з RFQ.publicLinkToken (cuid) —
 * той лише для read-only preview, а цей — канал авторизації постачальника.
 */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Перевірка форми токена ПЕРЕД походом у БД — захист від bot-сканерів,
 * що дриблять короткі/непотрібні символи. 32 — нижня межа для base64url(32 bytes).
 */
export function isValidTokenShape(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  if (token.length < 32 || token.length > 128) return false;
  return TOKEN_RE.test(token);
}
