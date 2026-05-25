import { distance } from "fastest-levenshtein";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/matching/normalize";
import type {
  ExtractedData,
  ExtractedCounterparty,
  ExtractedProjectHint,
} from "./prompts/documents/types";

const NAME_SIMILARITY_THRESHOLD = 0.85;
const ABSOLUTE_DISTANCE_THRESHOLD = 3;

export interface CounterpartyMatch {
  counterpartyId: string;
  name: string;
  matchReason: "edrpou_exact" | "name_levenshtein";
  score: number;
}

export interface ProjectMatch {
  projectId: string;
  title: string;
  matchReason: "title_ilike" | "address_ilike";
}

/**
 * Шукає Counterparty у scope фірми: спочатку exact match по ЄДРПОУ, потім
 * fuzzy по нормалізованій назві. Повертає null якщо жоден кандидат не
 * задовольняє пороги.
 */
export async function linkCounterparty(
  extracted: ExtractedCounterparty | undefined,
  firmId: string,
): Promise<CounterpartyMatch | null> {
  if (!extracted) return null;

  if (extracted.edrpou) {
    const byEdrpou = await prisma.counterparty.findFirst({
      where: { firmId, edrpou: extracted.edrpou, isActive: true },
      select: { id: true, name: true },
    });
    if (byEdrpou) {
      return {
        counterpartyId: byEdrpou.id,
        name: byEdrpou.name,
        matchReason: "edrpou_exact",
        score: 1,
      };
    }
  }

  if (!extracted.name) return null;

  const candidates = await prisma.counterparty.findMany({
    where: { firmId, isActive: true },
    select: { id: true, name: true },
  });

  const targetNorm = normalizeName(extracted.name);
  if (!targetNorm) return null;

  let best: CounterpartyMatch | null = null;
  for (const c of candidates) {
    const cNorm = normalizeName(c.name);
    if (!cNorm) continue;
    const d = distance(targetNorm, cNorm);
    const maxLen = Math.max(targetNorm.length, cNorm.length);
    const similarity = maxLen === 0 ? 1 : 1 - d / maxLen;
    const matches =
      similarity >= NAME_SIMILARITY_THRESHOLD || d <= ABSOLUTE_DISTANCE_THRESHOLD;
    if (matches && (!best || similarity > best.score)) {
      best = {
        counterpartyId: c.id,
        name: c.name,
        matchReason: "name_levenshtein",
        score: similarity,
      };
    }
  }
  return best;
}

/**
 * Шукає Project у scope фірми по keyword / address. Якщо знайдено лише один
 * кандидат — повертає його; за >1 повертає null (потрібен ручний вибір у UI,
 * щоб не зв'язати з неправильним об'єктом).
 */
export async function linkProject(
  extracted: ExtractedProjectHint | undefined,
  firmId: string,
): Promise<ProjectMatch | null> {
  if (!extracted) return null;

  const titleHits = extracted.keyword
    ? await prisma.project.findMany({
        where: {
          firmId,
          title: { contains: extracted.keyword, mode: "insensitive" },
        },
        select: { id: true, title: true },
        take: 5,
      })
    : [];

  if (titleHits.length === 1) {
    return {
      projectId: titleHits[0].id,
      title: titleHits[0].title,
      matchReason: "title_ilike",
    };
  }

  const addressHits = extracted.address
    ? await prisma.project.findMany({
        where: {
          firmId,
          address: { contains: extracted.address, mode: "insensitive" },
        },
        select: { id: true, title: true },
        take: 5,
      })
    : [];

  if (addressHits.length === 1) {
    return {
      projectId: addressHits[0].id,
      title: addressHits[0].title,
      matchReason: "address_ilike",
    };
  }

  return null;
}

export interface AutoLinkResult {
  counterparty: CounterpartyMatch | null;
  project: ProjectMatch | null;
}

export async function autoLinkExtractedDocument(
  data: ExtractedData,
  firmId: string,
): Promise<AutoLinkResult> {
  const [counterparty, project] = await Promise.all([
    linkCounterparty(data.counterparty, firmId),
    linkProject(data.project, firmId),
  ]);
  return { counterparty, project };
}
