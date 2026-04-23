import { distance } from "fastest-levenshtein";
import type { Material } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "./normalize";

export type MatchClassification = "MATCHED" | "SUGGESTED" | "UNMATCHED";

export const MATCH_THRESHOLDS = {
  matched: 0.8,
  suggested: 0.6,
} as const;

export interface MaterialCandidate {
  material: Material;
  score: number;
  normalizedName: string;
}

interface CacheEntry {
  materials: Material[];
  normalized: Map<string, string>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

async function loadActiveMaterials(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const materials = await prisma.material.findMany({ where: { isActive: true } });
  const normalized = new Map<string, string>();
  for (const m of materials) {
    normalized.set(m.id, normalizeName(m.name));
  }
  cache = { materials, normalized, expiresAt: now + CACHE_TTL_MS };
  return cache;
}

export function invalidateMaterialMatcherCache(): void {
  cache = null;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

function scoreMaterial(rawNormalized: string, raw: string, material: Material, normalized: string): number {
  let score = levenshteinSimilarity(rawNormalized, normalized);

  const rawLower = raw.toLowerCase();
  if (material.sku && rawLower.includes(material.sku.toLowerCase())) {
    score += 0.15;
  }
  if (material.category && rawLower.includes(material.category.toLowerCase())) {
    score += 0.1;
  }

  return Math.min(score, 1);
}

export interface MatchOptions {
  topN?: number;
}

export async function matchMaterial(
  rawName: string,
  opts: MatchOptions = {},
): Promise<MaterialCandidate[]> {
  const topN = opts.topN ?? 3;
  if (!rawName?.trim()) return [];

  const { materials, normalized } = await loadActiveMaterials();
  const rawNorm = normalizeName(rawName);

  const scored: MaterialCandidate[] = materials.map((material) => {
    const norm = normalized.get(material.id) ?? "";
    return {
      material,
      normalizedName: norm,
      score: scoreMaterial(rawNorm, rawName, material, norm),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function classifyMatch(score: number): MatchClassification {
  if (score >= MATCH_THRESHOLDS.matched) return "MATCHED";
  if (score >= MATCH_THRESHOLDS.suggested) return "SUGGESTED";
  return "UNMATCHED";
}

const CATEGORY_KEYWORDS: Array<{ test: RegExp; category: string }> = [
  { test: /цемент|бетон|розчин|пісок|щебінь|гравій/i, category: "Сухі суміші" },
  { test: /цегла|газоблок|пеноблок|блок/i, category: "Стінові матеріали" },
  { test: /арматура|метал|профіль|труба сталева/i, category: "Металопрокат" },
  { test: /дошка|брус|пиломатеріал|фанера/i, category: "Пиломатеріали" },
  { test: /черепиц|металочерепиц|покрівля/i, category: "Покрівля" },
  { test: /утеплювач|мінвата|пінопласт|екструзія/i, category: "Ізоляція" },
  { test: /гіпсокартон|шпаклівка|штукатурк/i, category: "Оздоблення" },
  { test: /плитка|клей плитков|керамогр/i, category: "Облицювальні" },
  { test: /кабель|проводка|розетк|вимикач|автомат/i, category: "Електрика" },
  { test: /труба|фітинг|кран|змішувач/i, category: "Сантехніка" },
];

function hashName(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0").toUpperCase();
}

export interface ProposedMaterial {
  sku: string;
  category: string;
  unit: string;
}

export function proposeNewMaterial(
  rawName: string,
  rawUnit: string | null | undefined,
): ProposedMaterial {
  const norm = normalizeName(rawName) || rawName;
  const sku = `MAT-${hashName(norm)}`;
  const category = CATEGORY_KEYWORDS.find((k) => k.test.test(rawName))?.category ?? "Інше";
  const unit = (rawUnit?.trim() || "шт").toLowerCase();
  return { sku, category, unit };
}
