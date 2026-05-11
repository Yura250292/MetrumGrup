/**
 * Перетворює `RawInvoiceRow[]` з парсера в готовий до commit-у `ImportPlan`:
 *   - кластеризує постачальників за нормалізованим ключем;
 *   - матчить кластери на existing Counterparty (per-firm, для обох фірм);
 *   - матчить "Куди везли" на existing Project (firmId-scoped);
 *   - призначає кожному invoice firm (default Group, дозволяє override з UI).
 *
 * Не пише в БД — це чистий transform для preview-step.
 */
import { distance } from "fastest-levenshtein";
import {
  normalizeSupplierKey,
  inferCounterpartyType,
  pickDisplayName,
} from "./normalize-supplier";
import { matchProject, type ProjectCandidate } from "./match-project";
import type { RawInvoiceRow } from "./parse-excel";

export type FirmId = "metrum-group" | "metrum-studio";

export const DEFAULT_INVOICE_FIRM: FirmId = "metrum-group";

export type CounterpartyCandidate = {
  id: string;
  name: string;
  firmId: string | null;
  edrpou: string | null;
  taxId: string | null;
};

export type ClusterPreview = {
  normalizedKey: string;
  displayName: string;
  inferredType: "LEGAL" | "FOP" | "INDIVIDUAL";
  rawNames: string[];
  rowCount: number;
  totalAmount: number;
  /// Match in metrum-group (null = новий контрагент для цієї фірми).
  groupMatch: { id: string; name: string } | null;
  /// Match in metrum-studio.
  studioMatch: { id: string; name: string } | null;
};

export type InvoicePreview = {
  rowNumber: number;
  supplierKey: string;
  supplierRaw: string;
  invoiceNumber: string | null;
  destination: string | null;
  matchedProjectId: string | null;
  matchedProjectConfidence: number;
  amount: number | null;
  deliveryDate: string | null;
  paymentDate: string | null;
  isPaid: boolean;
  firmIdAssigned: FirmId;
  issues: string[];
};

export type ImportPlan = {
  clusters: ClusterPreview[];
  invoices: InvoicePreview[];
  totals: {
    paidCount: number;
    paidSum: number;
    debtCount: number;
    debtSum: number;
    totalRows: number;
    newCounterpartiesInGroup: number;
    newCounterpartiesInStudio: number;
    matchedToProject: number;
  };
};

const FUZZY_THRESHOLD = 0.2;

function matchExisting(
  key: string,
  rawDisplay: string,
  candidates: CounterpartyCandidate[],
): { id: string; name: string } | null {
  if (!key) return null;

  // Точне співпадіння по нормалізованому імені.
  for (const c of candidates) {
    if (normalizeSupplierKey(c.name) === key) return { id: c.id, name: c.name };
  }

  // Substring (мін 4 символи).
  if (key.length >= 4) {
    for (const c of candidates) {
      const cKey = normalizeSupplierKey(c.name);
      if (cKey.length < 4) continue;
      if (cKey.includes(key) || key.includes(cKey)) {
        return { id: c.id, name: c.name };
      }
    }
  }

  // Levenshtein.
  let best: { id: string; name: string; score: number } | null = null;
  for (const c of candidates) {
    const cKey = normalizeSupplierKey(c.name);
    if (cKey.length === 0) continue;
    const maxLen = Math.max(cKey.length, key.length);
    if (maxLen === 0) continue;
    const dist = distance(cKey, key);
    const score = dist / maxLen;
    if (score < FUZZY_THRESHOLD && (!best || score < best.score)) {
      best = { id: c.id, name: c.name, score };
    }
  }
  if (best) return { id: best.id, name: best.name };

  // Незмаппіно — використаємо rawDisplay (не використовується нижче, але
  // лишаю для майбутніх перевірок).
  void rawDisplay;
  return null;
}

export function buildPlan(args: {
  rows: RawInvoiceRow[];
  counterpartiesGroup: CounterpartyCandidate[];
  counterpartiesStudio: CounterpartyCandidate[];
  projectsByFirm: { group: ProjectCandidate[]; studio: ProjectCandidate[] };
}): ImportPlan {
  const { rows, counterpartiesGroup, counterpartiesStudio, projectsByFirm } = args;

  // 1. Кластеризація raw → cluster.
  const clusterMap = new Map<
    string,
    { rawNames: string[]; rowCount: number; totalAmount: number }
  >();
  for (const r of rows) {
    const key = normalizeSupplierKey(r.supplier);
    if (!key) continue;
    const entry = clusterMap.get(key) ?? {
      rawNames: [],
      rowCount: 0,
      totalAmount: 0,
    };
    if (!entry.rawNames.includes(r.supplier)) entry.rawNames.push(r.supplier);
    entry.rowCount += 1;
    entry.totalAmount += r.amount ?? 0;
    clusterMap.set(key, entry);
  }

  // 2. Для кожного кластеру — пошук matches в обох фірмах.
  const clusters: ClusterPreview[] = [];
  for (const [key, agg] of clusterMap.entries()) {
    const displayName = pickDisplayName(agg.rawNames);
    const inferredType = inferCounterpartyType(displayName);
    const groupMatch = matchExisting(key, displayName, counterpartiesGroup);
    const studioMatch = matchExisting(key, displayName, counterpartiesStudio);
    clusters.push({
      normalizedKey: key,
      displayName,
      inferredType,
      rawNames: agg.rawNames,
      rowCount: agg.rowCount,
      totalAmount: Math.round(agg.totalAmount * 100) / 100,
      groupMatch,
      studioMatch,
    });
  }
  clusters.sort((a, b) => b.rowCount - a.rowCount);

  // 3. Invoice previews + project matching.
  const invoices: InvoicePreview[] = [];
  let matchedToProject = 0;
  for (const r of rows) {
    const supplierKey = normalizeSupplierKey(r.supplier);
    const firmId: FirmId = DEFAULT_INVOICE_FIRM;
    const projects = firmId === "metrum-group" ? projectsByFirm.group : projectsByFirm.studio;
    const m = matchProject(r.destination, projects);
    if (m.projectId) matchedToProject++;
    invoices.push({
      rowNumber: r.rowNumber,
      supplierKey,
      supplierRaw: r.supplier,
      invoiceNumber: r.invoiceNumber,
      destination: r.destination,
      matchedProjectId: m.projectId,
      matchedProjectConfidence: m.confidence,
      amount: r.amount,
      deliveryDate: r.deliveryDate ? r.deliveryDate.toISOString() : null,
      paymentDate: r.paymentDate ? r.paymentDate.toISOString() : null,
      isPaid: r.isPaid,
      firmIdAssigned: firmId,
      issues: r.issues,
    });
  }

  // 4. Totals.
  let paidCount = 0,
    paidSum = 0,
    debtCount = 0,
    debtSum = 0;
  for (const r of rows) {
    if (r.isPaid) {
      paidCount++;
      paidSum += r.amount ?? 0;
    } else {
      debtCount++;
      debtSum += r.amount ?? 0;
    }
  }
  const newInGroup = clusters.filter((c) => !c.groupMatch).length;
  const newInStudio = clusters.filter((c) => !c.studioMatch).length;

  return {
    clusters,
    invoices,
    totals: {
      paidCount,
      paidSum: Math.round(paidSum * 100) / 100,
      debtCount,
      debtSum: Math.round(debtSum * 100) / 100,
      totalRows: rows.length,
      newCounterpartiesInGroup: newInGroup,
      newCounterpartiesInStudio: newInStudio,
      matchedToProject,
    },
  };
}
