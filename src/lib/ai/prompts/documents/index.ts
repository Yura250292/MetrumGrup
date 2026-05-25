import type { IncomingDocumentType } from "@prisma/client";
import { invoicePrompt } from "./invoice";
import type { DocumentPrompt } from "./types";

const PROMPTS: Partial<Record<IncomingDocumentType, DocumentPrompt>> = {
  INVOICE: invoicePrompt,
};

export function getDocumentPrompt(type: IncomingDocumentType): DocumentPrompt | null {
  return PROMPTS[type] ?? null;
}

export { invoicePrompt };
export type { DocumentPrompt };
