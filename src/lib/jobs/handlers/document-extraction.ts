import type { IncomingDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { defineJob } from "@/lib/jobs/queue";
import { downloadDocumentFromR2 } from "@/lib/r2/documents";
import { extractDocument } from "@/lib/ai/document-extractor";
import { autoLinkExtractedDocument } from "@/lib/ai/document-auto-link";

export type DocumentExtractionPayload = {
  documentId: string;
};

export const documentExtractionJob = defineJob<DocumentExtractionPayload>(
  "document.extract",
  async ({ documentId }) => {
    const doc = await prisma.incomingDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        firmId: true,
        type: true,
        mimeType: true,
        originalFileUrl: true,
        status: true,
      },
    });

    if (!doc) {
      log.warn("document.extract:missing", { documentId });
      return;
    }
    if (doc.status !== "PROCESSING") {
      log.info("document.extract:skip_non_processing", { documentId, status: doc.status });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await downloadDocumentFromR2(doc.originalFileUrl);
    } catch (err) {
      await markFailed(doc.id, `R2 download failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const { data, log: extractionLog } = await extractDocument(
      buffer,
      doc.mimeType,
      doc.type as IncomingDocumentType,
    );

    await prisma.documentExtractionLog.create({
      data: {
        documentId: doc.id,
        model: extractionLog.model,
        prompt: extractionLog.prompt,
        response: extractionLog.response,
        durationMs: extractionLog.durationMs,
        success: extractionLog.success,
        errorMessage: extractionLog.errorMessage,
      },
    });

    if (!extractionLog.success) {
      await markFailed(doc.id, extractionLog.errorMessage ?? "AI extraction failed");
      return;
    }

    const autoLink = await autoLinkExtractedDocument(data, doc.firmId);
    const enrichedExtractedData = {
      ...data,
      autoLink: {
        counterpartyId: autoLink.counterparty?.counterpartyId ?? null,
        counterpartyName: autoLink.counterparty?.name ?? null,
        counterpartyMatchReason: autoLink.counterparty?.matchReason ?? null,
        projectId: autoLink.project?.projectId ?? null,
        projectTitle: autoLink.project?.title ?? null,
        projectMatchReason: autoLink.project?.matchReason ?? null,
      },
    };

    await prisma.incomingDocument.update({
      where: { id: doc.id },
      data: {
        status: "PARSED",
        extractedData: enrichedExtractedData as unknown as Prisma.InputJsonValue,
        confidence: data.overallConfidence,
        errorMessage: null,
      },
    });

    log.info("document.extract:done", {
      documentId: doc.id,
      confidence: data.overallConfidence,
      counterpartyMatch: autoLink.counterparty?.matchReason ?? null,
    });
  },
);

async function markFailed(documentId: string, errorMessage: string): Promise<void> {
  await prisma.incomingDocument.update({
    where: { id: documentId },
    data: { status: "FAILED", errorMessage },
  });
}
