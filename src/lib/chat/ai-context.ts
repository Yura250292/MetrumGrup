import { prisma } from "@/lib/prisma";
import { downloadFileFromR2 } from "@/lib/r2-client";
import { parsePDF } from "@/lib/pdf-helper";

const MAX_TEXT_BYTES = 50_000; // 50 KB of extracted text total
const MAX_PDF_BYTES = 4 * 1024 * 1024; // parse PDFs up to 4 MB
const MAX_DOC_BYTES = 8 * 1024 * 1024; // parse DOC/DOCX up to 8 MB
const MAX_TEXT_ATTACHMENT_BYTES = 200 * 1024; // text/* up to 200 KB
const MAX_IMAGES = 5;

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-word",
  "application/vnd.oasis.opendocument.text",
]);

function isDocxAttachment(name: string, mimeType: string): boolean {
  if (DOCX_MIME_TYPES.has(mimeType)) return true;
  const lower = name.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".doc") || lower.endsWith(".odt");
}

const IMAGE_URL_PREFIX = /^https?:\/\//i;

export type AiContextImage = {
  url: string;
  mimeType: string;
  name: string;
};

export type AiContextResult = {
  transcript: string; // plain-text multi-message transcript incl. file contents
  images: AiContextImage[];
  notes: string[]; // human-readable metadata about context coverage
};

type MessageWithAttachments = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string } | null;
  attachments: {
    id: string;
    name: string;
    url: string;
    r2Key: string | null;
    mimeType: string;
    size: number;
    durationMs: number | null;
    transcript: string | null;
  }[];
};

function truncate(text: string, budget: number): { text: string; truncated: boolean } {
  const buf = Buffer.byteLength(text, "utf-8");
  if (buf <= budget) return { text, truncated: false };
  const sliced = text.slice(0, Math.max(0, budget));
  return { text: sliced, truncated: true };
}

async function safeReadAttachmentText(
  att: MessageWithAttachments["attachments"][number],
  remainingBudget: number,
): Promise<{ block: string | null; bytesUsed: number; note?: string }> {
  if (remainingBudget <= 0) {
    return { block: null, bytesUsed: 0, note: `⚠ ${att.name}: пропущено (ліміт контексту)` };
  }
  if (!att.r2Key) {
    return { block: null, bytesUsed: 0, note: `⚠ ${att.name}: немає r2Key` };
  }

  // Text-like: plain, csv, json, markdown
  if (att.mimeType.startsWith("text/") || att.mimeType === "application/json") {
    if (att.size > MAX_TEXT_ATTACHMENT_BYTES) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: пропущено (>200 KB)`,
      };
    }
    try {
      const buf = await downloadFileFromR2(att.r2Key);
      const raw = buf.toString("utf-8");
      const { text, truncated } = truncate(raw, remainingBudget);
      const block = `=== ФАЙЛ: ${att.name} (${att.mimeType}) ===\n${text}${truncated ? "\n…[обрізано]" : ""}\n=== /ФАЙЛ ===`;
      return { block, bytesUsed: Buffer.byteLength(block, "utf-8") };
    } catch (err) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: помилка читання (${err instanceof Error ? err.message : "?"})`,
      };
    }
  }

  // DOCX / DOC / ODT
  if (isDocxAttachment(att.name, att.mimeType)) {
    if (att.size > MAX_DOC_BYTES) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: пропущено документ (>8 MB)`,
      };
    }
    try {
      const buf = await downloadFileFromR2(att.r2Key);
      const mammoth = await import("mammoth");
      const { value: rawText } = await mammoth.extractRawText({ buffer: buf });
      const cleaned = rawText.trim();
      if (!cleaned) {
        return {
          block: null,
          bytesUsed: 0,
          note: `⚠ ${att.name}: документ без тексту`,
        };
      }
      const { text, truncated } = truncate(cleaned, remainingBudget);
      const header = `=== ДОКУМЕНТ: ${att.name} ===`;
      const block = `${header}\n${text}${truncated ? "\n…[обрізано]" : ""}\n=== /ДОКУМЕНТ ===`;
      return { block, bytesUsed: Buffer.byteLength(block, "utf-8") };
    } catch (err) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: не вдалось прочитати документ (${err instanceof Error ? err.message : "?"})`,
      };
    }
  }

  // PDF
  if (att.mimeType === "application/pdf") {
    if (att.size > MAX_PDF_BYTES) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: пропущено PDF (>4 MB)`,
      };
    }
    try {
      const buf = await downloadFileFromR2(att.r2Key);
      const parsed = await parsePDF(buf);
      if (!parsed.text || parsed.text.trim().length === 0) {
        return {
          block: null,
          bytesUsed: 0,
          note: `⚠ ${att.name}: PDF без тексту`,
        };
      }
      const { text, truncated } = truncate(parsed.text, remainingBudget);
      const header = `=== PDF: ${att.name}${parsed.numpages ? `, ${parsed.numpages} стор.` : ""} ===`;
      const block = `${header}\n${text}${truncated ? "\n…[обрізано]" : ""}\n=== /PDF ===`;
      return { block, bytesUsed: Buffer.byteLength(block, "utf-8") };
    } catch (err) {
      return {
        block: null,
        bytesUsed: 0,
        note: `⚠ ${att.name}: не вдалось прочитати PDF (${err instanceof Error ? err.message : "?"})`,
      };
    }
  }

  // Audio → prefer cached transcript
  if (att.mimeType.startsWith("audio/")) {
    if (att.transcript && att.transcript.trim().length > 0) {
      const { text, truncated } = truncate(att.transcript, remainingBudget);
      const header = `=== АУДІО-ТРАНСКРИПТ: ${att.name} ===`;
      const block = `${header}\n${text}${truncated ? "\n…[обрізано]" : ""}\n=== /АУДІО ===`;
      return { block, bytesUsed: Buffer.byteLength(block, "utf-8") };
    }
    return {
      block: null,
      bytesUsed: 0,
      note: `ℹ ${att.name}: аудіо-повідомлення без транскрипту (натисни \"Транскрипт\" на вкладенні)`,
    };
  }

  // Unknown — just a note
  return {
    block: null,
    bytesUsed: 0,
    note: `ℹ ${att.name} (${att.mimeType}) — контент не витягнуто`,
  };
}

/**
 * Build a transcript + image list for an @ai mention, reading recent chat
 * attachments when the model can use them.
 */
export async function buildConversationAiContext(
  conversationId: string,
  aiBotUserId: string,
  opts: { messageLimit?: number } = {},
): Promise<AiContextResult> {
  const limit = opts.messageLimit ?? 20;

  const messages = (await prisma.chatMessage.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { id: true, name: true } },
      attachments: {
        select: {
          id: true,
          name: true,
          url: true,
          r2Key: true,
          mimeType: true,
          size: true,
          durationMs: true,
          transcript: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })) as MessageWithAttachments[];

  messages.reverse(); // chronological

  const transcriptLines: string[] = [];
  const images: AiContextImage[] = [];
  const notes: string[] = [];
  let textBudget = MAX_TEXT_BYTES;

  for (const m of messages) {
    const who = m.author?.id === aiBotUserId ? "AI" : m.author?.name ?? "Користувач";
    const body = m.body?.trim() || "";
    const attSummaries: string[] = [];

    for (const att of m.attachments) {
      // Image → collect URL for vision, don't consume text budget
      if (att.mimeType.startsWith("image/") && IMAGE_URL_PREFIX.test(att.url)) {
        if (images.length < MAX_IMAGES) {
          images.push({ url: att.url, mimeType: att.mimeType, name: att.name });
          attSummaries.push(`🖼 ${att.name}`);
        } else {
          attSummaries.push(`🖼 ${att.name} [ліміт зображень]`);
        }
        continue;
      }

      const { block, bytesUsed, note } = await safeReadAttachmentText(att, textBudget);
      if (block) {
        transcriptLines.push(block);
        textBudget = Math.max(0, textBudget - bytesUsed);
        attSummaries.push(`📎 ${att.name}`);
      } else {
        // Still mention file presence so AI knows it exists
        attSummaries.push(`📎 ${att.name} (${att.mimeType})`);
        if (note) notes.push(note);
      }
    }

    const header = `${who}:`;
    const line = attSummaries.length
      ? `${header} ${body}${body ? " " : ""}[${attSummaries.join(", ")}]`
      : `${header} ${body || "[порожнє]"}`;
    transcriptLines.push(line);
  }

  return {
    transcript: transcriptLines.join("\n\n"),
    images,
    notes,
  };
}
