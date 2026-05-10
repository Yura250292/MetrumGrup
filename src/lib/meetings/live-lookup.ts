import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Live RAG over власної БД — коли в розмові згадують назву проєкту,
 * контрагента, обʼєкта, документа, агент шукає у БД і віддає клієнту
 * картки «Я знаю про це» з фактами які користувач може одразу процитувати.
 *
 * Не використовує AI — просто структуровані SQL-запити (швидко і дешево).
 * Якщо у БД нічого нема — повертає порожній масив, агент мовчить.
 */

export type LookupKind =
  | "project"
  | "counterparty"
  | "meeting"
  | "foreman_report"
  | "task"
  | "material";

export type LookupMatch = {
  kind: LookupKind;
  id: string;
  title: string;
  /** Короткий снапшот фактів — 1-3 рядки. Не маркап, plain text. */
  snippet: string;
  /** Куди вести «Деталі» в UI. */
  url: string;
  /** Опц. метадані для подальшої фільтрації / відображення. */
  meta?: Record<string, string | number | null>;
};

const PROJECT_LIMIT = 3;
const COUNTERPARTY_LIMIT = 3;
const MEETING_LIMIT = 3;
const FOREMAN_REPORT_LIMIT = 3;

/**
 * Універсальний lookup за вільним текстом. Кожен entity-type каже які
 * таблиці пріоритетні, але ми все одно перевіряємо ВСІ — щоб не
 * пропустити «Будхата» якщо AI помилився з типом.
 */
export async function lookupEntity(opts: {
  text: string;
  /** Якщо є — обмежуємо firm-scope. Інакше шукаємо скрізь що видно юзеру. */
  firmId?: string | null;
  /** Поточна нарада — щоб не повертати її саму у matches. */
  excludeMeetingId?: string;
}): Promise<{ query: string; matches: LookupMatch[] }> {
  const q = opts.text.trim();
  if (q.length < 3) return { query: q, matches: [] };

  const firmFilter = opts.firmId
    ? { firmId: opts.firmId }
    : undefined;

  // Паралельні запити — економимо latency.
  const [projects, counterparties, meetings, foremanReports] =
    await Promise.all([
      prisma.project.findMany({
        where: {
          ...(firmFilter ?? {}),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          address: true,
          status: true,
          currentStage: true,
          startDate: true,
          totalBudget: true,
          totalPaid: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: PROJECT_LIMIT,
      }),
      prisma.counterparty.findMany({
        where: {
          ...(firmFilter ?? {}),
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { edrpou: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          edrpou: true,
          phone: true,
          email: true,
          isActive: true,
        },
        take: COUNTERPARTY_LIMIT,
      }),
      prisma.meeting.findMany({
        where: {
          ...(firmFilter ?? {}),
          ...(opts.excludeMeetingId
            ? { id: { not: opts.excludeMeetingId } }
            : {}),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { transcript: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          summary: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: "desc" },
        take: MEETING_LIMIT,
      }),
      prisma.foremanReport.findMany({
        where: {
          ...(firmFilter ?? {}),
          rawText: { contains: q, mode: "insensitive" },
        },
        select: {
          id: true,
          status: true,
          occurredAt: true,
          rawText: true,
          project: { select: { title: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: FOREMAN_REPORT_LIMIT,
      }),
    ]);

  const matches: LookupMatch[] = [];

  for (const p of projects) {
    const stage = p.currentStage ? `етап: ${p.currentStage}` : null;
    const status = p.status ? `статус: ${p.status}` : null;
    const budget =
      p.totalBudget && Number(p.totalBudget) > 0
        ? `бюджет ${formatMoney(p.totalBudget)}`
        : null;
    const paid =
      p.totalPaid && Number(p.totalPaid) > 0
        ? `оплачено ${formatMoney(p.totalPaid)}`
        : null;
    const updated = p.updatedAt
      ? `оновлено ${formatDate(p.updatedAt)}`
      : null;
    const snippetParts = [
      p.address,
      status,
      stage,
      budget,
      paid,
      updated,
    ].filter(Boolean) as string[];
    matches.push({
      kind: "project",
      id: p.id,
      title: p.title,
      snippet: snippetParts.join(" · "),
      url: `/admin-v2/projects/${p.slug ?? p.id}`,
    });
  }

  for (const c of counterparties) {
    const parts = [
      c.type,
      c.edrpou ? `ЄДРПОУ ${c.edrpou}` : null,
      c.phone,
      c.email,
      c.isActive ? null : "неактивний",
    ].filter(Boolean) as string[];
    matches.push({
      kind: "counterparty",
      id: c.id,
      title: c.name,
      snippet: parts.join(" · ") || "Без додаткових даних",
      url: `/admin-v2/counterparties/${c.id}`,
    });
  }

  for (const m of meetings) {
    const date = m.recordedAt ? formatDate(m.recordedAt) : "";
    const summarySlice = (m.summary ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 220);
    matches.push({
      kind: "meeting",
      id: m.id,
      title: m.title,
      snippet: `${date}${summarySlice ? " · " + summarySlice : ""}`.trim(),
      url: `/admin-v2/meetings/${m.id}`,
    });
  }

  for (const r of foremanReports) {
    const titleParts = [
      "Звіт виконроба",
      r.occurredAt ? formatDate(r.occurredAt) : null,
      r.project?.title ? `· ${r.project.title}` : null,
    ].filter(Boolean) as string[];
    const rawSlice = (r.rawText ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    const snippetParts = [r.status, rawSlice].filter(Boolean) as string[];
    matches.push({
      kind: "foreman_report",
      id: r.id,
      title: titleParts.join(" "),
      snippet: snippetParts.join(" · "),
      url: `/admin-v2/foreman-reports/${r.id}`,
    });
  }

  return { query: q, matches };
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} М грн`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} тис грн`;
  return `${n.toFixed(0)} грн`;
}
