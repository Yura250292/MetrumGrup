import crypto from "node:crypto";

/**
 * HMAC підпис одного раунду торгу. Дзеркало `signature.ts`/`createApprovalSignature`
 * — той самий SIGNATURE_SALT, той самий sha256 — щоб forensics-інструменти не
 * розрізняли estimate approval і client negotiation rounds.
 *
 * Канонічна форма payload: {itemProposalId, roundNumber, actorSide, action,
 * proposedQuantity, proposedUnitPrice, proposedAmount, comment, timestamp,
 * ipAddress?, userAgent?} — ключі сортуються алфавітно через JSON.stringify(_, keys).
 *
 * Підпис ловить підробку post-write: якщо хтось вручну змінить рядок у БД,
 * `verifyRoundSignature` поверне false.
 */
export interface NegotiationRoundSignaturePayload {
  itemProposalId: string;
  roundNumber: number;
  actorSide: "firm" | "client";
  action: string;
  proposedQuantity: string | null;
  proposedUnitPrice: string | null;
  proposedAmount: string | null;
  comment: string | null;
  timestamp: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function getSalt(): string {
  return process.env.SIGNATURE_SALT || "default-salt-change-in-production";
}

function canonicalize(payload: NegotiationRoundSignaturePayload): string {
  const keys = Object.keys(payload).sort();
  return JSON.stringify(payload, keys);
}

export function createRoundSignature(
  payload: NegotiationRoundSignaturePayload,
): string {
  const data = canonicalize(payload) + getSalt();
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifyRoundSignature(
  hash: string,
  payload: NegotiationRoundSignaturePayload,
): boolean {
  return createRoundSignature(payload) === hash;
}
