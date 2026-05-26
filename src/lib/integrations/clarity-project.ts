/**
 * clarity-project.info integration — Ukrainian open-data registry of legal
 * entities (ЄДРПОУ + tax status + founders). Used for SRM compliance checks.
 *
 * Налаштування:
 *   - CLARITY_PROJECT_API_KEY у env. Без ключа функція повертає null + warning.
 *   - Free tier ~100 req/day. Cache 24h обовʼязковий (через
 *     CounterpartyComplianceCheck.success=true як кеш-сховище).
 *   - Fallback: opendatabot.ua (другий публічний реєстр). Викликається якщо
 *     clarity-project дав 5xx / timeout.
 *
 * Soft-fail: будь-яка помилка → return null + лог. Не кидаємо exception, щоб
 * не блокувати створення/редагування контрагентів.
 */

import { isValidEdrpou, normalizeTaxId } from "@/lib/validators/edrpou";

export type ClarityTaxStatus =
  | "ACTIVE"
  | "PROBLEM"
  | "SUSPENDED"
  | "BANKRUPT"
  | "LIQUIDATED"
  | "UNKNOWN";

export type ClarityLegalForm =
  | "FOP"
  | "TOV"
  | "PE"
  | "PJSC"
  | "PRJSC"
  | "STATE"
  | "OTHER";

export interface EdrpouLookupResult {
  edrpou: string;
  name: string;
  legalForm?: ClarityLegalForm;
  taxStatus: ClarityTaxStatus;
  address?: string;
  founders?: Array<{ name: string; share: number }>;
  source: "clarity-project" | "opendatabot";
  raw: unknown;
}

const CLARITY_BASE = "https://clarity-project.info/api/edr/edrpou";
const OPENDATABOT_BASE = "https://opendatabot.com/api/v3/company";
const HTTP_TIMEOUT_MS = 10_000;

function mapClarityStatus(raw: unknown): ClarityTaxStatus {
  if (!raw || typeof raw !== "string") return "UNKNOWN";
  const s = raw.toLowerCase();
  if (s.includes("припинено") || s.includes("ліквідовано")) return "LIQUIDATED";
  if (s.includes("банкрут")) return "BANKRUPT";
  if (s.includes("призупинено")) return "SUSPENDED";
  if (s.includes("проблем") || s.includes("борг")) return "PROBLEM";
  if (s.includes("зареєстровано") || s.includes("діюч") || s.includes("active")) {
    return "ACTIVE";
  }
  return "UNKNOWN";
}

function mapLegalForm(name: string | undefined | null): ClarityLegalForm | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase();
  if (upper.startsWith("ФОП ") || upper.startsWith("ФО-П")) return "FOP";
  if (upper.startsWith("ТОВ ") || upper.includes("ТОВАРИСТВО З ОБМЕЖЕНОЮ"))
    return "TOV";
  if (upper.startsWith("ПП ") || upper.includes("ПРИВАТНЕ ПІДПРИЄМСТВО"))
    return "PE";
  if (upper.startsWith("ПрАТ ") || upper.includes("ПРИВАТНЕ АКЦІОНЕРНЕ"))
    return "PRJSC";
  if (upper.startsWith("ПАТ ") || upper.includes("ПУБЛІЧНЕ АКЦІОНЕРНЕ"))
    return "PJSC";
  if (upper.includes("ДЕРЖАВНЕ") || upper.startsWith("ДП ")) return "STATE";
  return "OTHER";
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
}

async function tryClarityProject(
  edrpou: string,
  apiKey: string,
): Promise<EdrpouLookupResult | null> {
  try {
    const res = await fetchWithTimeout(
      `${CLARITY_BASE}/${encodeURIComponent(edrpou)}?api_key=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn(`[clarity-project] http ${res.status} for ${edrpou}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const name = (data.name as string) || (data.short_name as string) || "";
    return {
      edrpou,
      name,
      legalForm: mapLegalForm(name),
      taxStatus: mapClarityStatus(data.status),
      address: (data.address as string) || undefined,
      founders: Array.isArray(data.founders)
        ? (data.founders as Array<{ name: string; share: number }>)
        : undefined,
      source: "clarity-project",
      raw: data,
    };
  } catch (err) {
    console.warn("[clarity-project] fetch failed", err);
    return null;
  }
}

async function tryOpendatabot(edrpou: string): Promise<EdrpouLookupResult | null> {
  const apiKey = process.env.OPENDATABOT_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetchWithTimeout(
      `${OPENDATABOT_BASE}/${encodeURIComponent(edrpou)}?apiKey=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn(`[opendatabot] http ${res.status} for ${edrpou}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const name = (data.full_name as string) || (data.name as string) || "";
    return {
      edrpou,
      name,
      legalForm: mapLegalForm(name),
      taxStatus: mapClarityStatus(data.status),
      address: (data.address as string) || undefined,
      source: "opendatabot",
      raw: data,
    };
  } catch (err) {
    console.warn("[opendatabot] fetch failed", err);
    return null;
  }
}

/**
 * Перевіряє ЄДРПОУ у відкритих джерелах. Послідовно: clarity-project →
 * opendatabot fallback. Soft-fail: повертає null якщо обидва недоступні.
 *
 * Кешування здійснюється на рівні caller'а через CounterpartyComplianceCheck
 * (читання останнього success-запису за 24h).
 */
export async function lookupEdrpou(
  edrpouInput: string,
): Promise<EdrpouLookupResult | null> {
  const edrpou = normalizeTaxId(edrpouInput);
  if (!isValidEdrpou(edrpou)) {
    console.warn(`[clarity-project] invalid EDRPOU: ${edrpouInput}`);
    return null;
  }

  const apiKey = process.env.CLARITY_PROJECT_API_KEY;
  if (apiKey) {
    const result = await tryClarityProject(edrpou, apiKey);
    if (result) return result;
  } else {
    console.warn("[clarity-project] CLARITY_PROJECT_API_KEY not configured");
  }

  return tryOpendatabot(edrpou);
}
