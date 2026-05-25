import type {
  IncomingDocumentStatus,
  IncomingDocumentSource,
  IncomingDocumentType,
  LinkedEntityType,
} from "@prisma/client";

export interface DocumentListItem {
  id: string;
  type: IncomingDocumentType;
  source: IncomingDocumentSource;
  status: IncomingDocumentStatus;
  originalFileName: string;
  fileSizeBytes: number;
  mimeType: string;
  confidence: number | null;
  uploadedAt: string;
  reviewedAt: string | null;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string | null;
  errorMessage: string | null;
  uploadedBy: { id: string; name: string } | null;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  total: number;
  take: number;
  skip: number;
}

export interface DocumentDetail extends DocumentListItem {
  extractedData: Record<string, unknown> | null;
  originalFileUrl: string;
  reviewedBy: { id: string; name: string } | null;
  extractionLogs: Array<{
    id: string;
    model: string;
    durationMs: number;
    success: boolean;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export interface DocumentDetailResponse {
  document: DocumentDetail;
  signedUrl: string | null;
}

export const STATUS_LABELS: Record<IncomingDocumentStatus, string> = {
  PROCESSING: "Обробка…",
  PARSED: "Перевірити",
  REVIEWED: "Перевірено",
  LINKED: "Привʼязано",
  ARCHIVED: "Архів",
  FAILED: "Помилка",
};

export const TYPE_LABELS: Record<IncomingDocumentType, string> = {
  INVOICE: "Рахунок-фактура",
  CONTRACT: "Договір",
  ACT: "Акт виконаних робіт",
  COMMERCIAL_OFFER: "Комерційна пропозиція",
  RECEIPT: "Чек",
  KB2V: "КБ-2в",
  KB3: "КБ-3",
  WAYBILL: "ТТН / накладна",
  OTHER: "Інше",
};

export const SOURCE_LABELS: Record<IncomingDocumentSource, string> = {
  UPLOAD: "Завантаження",
  EMAIL: "Email",
  FOREMAN: "Виконроб",
  SCAN: "Сканер",
  API: "API",
};
