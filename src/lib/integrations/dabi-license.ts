/**
 * ДАБІ е-licensing integration. Перевіряє статус ліцензії на будівельну
 * діяльність у Державній архітектурно-будівельній інспекції.
 *
 * URL: https://e-licensing.dabi.gov.ua
 *
 * ДАБІ станом на 2026 НЕ має офіційного JSON API, тому використовується HTML
 * scraper (cheerio). У caller'а має бути попередження "manual update
 * recommended", оскільки парсинг HTML нестабільний при редизайнах сайту.
 *
 * Soft-fail: помилка → null + лог. Кеш — через CounterpartyComplianceCheck.
 */

export type DabiLicenseStatus = "ACTIVE" | "REVOKED" | "SUSPENDED" | "UNKNOWN";

export interface DabiLicenseResult {
  licenseNumber: string;
  holderName: string;
  holderEdrpou?: string;
  issuedAt?: Date;
  validUntil?: Date;
  scope: string[];
  status: DabiLicenseStatus;
  raw: string;
  warning: string;
}

const DABI_BASE = "https://e-licensing.dabi.gov.ua";
const HTTP_TIMEOUT_MS = 15_000;

function parseDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // ДАБІ формати: "01.06.2025" або "2025-06-01".
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (iso) return new Date(`${trimmed}T00:00:00Z`);
  return undefined;
}

function mapStatus(raw: string | undefined): DabiLicenseStatus {
  if (!raw) return "UNKNOWN";
  const s = raw.toLowerCase();
  if (s.includes("анульован") || s.includes("revoked")) return "REVOKED";
  if (s.includes("призупинен") || s.includes("suspended")) return "SUSPENDED";
  if (s.includes("чинн") || s.includes("active") || s.includes("діюч"))
    return "ACTIVE";
  return "UNKNOWN";
}

interface ParsedHtmlFields {
  holderName: string;
  holderEdrpou?: string;
  issuedAt?: Date;
  validUntil?: Date;
  scope: string[];
  status: DabiLicenseStatus;
}

/**
 * Витягує поля з HTML-відповіді ДАБІ. Експортовано для тестування — не
 * викликати напряму у production коді, використовуйте `checkDabiLicense`.
 *
 * Реалізація навмисно proste без cheerio dependency: regex над відомим
 * шаблоном dl/dt/dd. При зміні HTML — оновити паттерни.
 */
export function parseDabiHtml(html: string): ParsedHtmlFields | null {
  const fieldRx = (label: string) =>
    new RegExp(
      `<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>\\s*([^<]+?)\\s*</dd>`,
      "i",
    );
  const get = (label: string): string | undefined => {
    const m = fieldRx(label).exec(html);
    return m ? m[1].trim() : undefined;
  };

  const holderName = get("Найменування") || get("ПІБ");
  if (!holderName) return null;

  const scopeRaw = get("Види робіт") || get("Перелік робіт") || "";
  const scope = scopeRaw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    holderName,
    holderEdrpou: get("ЄДРПОУ") || get("Код"),
    issuedAt: parseDate(get("Дата видачі") || get("Видано")),
    validUntil: parseDate(get("Дійсна до") || get("Термін дії")),
    scope,
    status: mapStatus(get("Статус")),
  };
}

/**
 * Звіряє номер ліцензії з ДАБІ. Повертає null якщо ліцензія не знайдена або
 * парсинг провалився.
 */
export async function checkDabiLicense(
  licenseNumber: string,
): Promise<DabiLicenseResult | null> {
  const trimmed = licenseNumber.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `${DABI_BASE}/search?license=${encodeURIComponent(trimmed)}`,
      {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.warn(`[dabi-license] http ${res.status} for ${trimmed}`);
      return null;
    }
    const html = await res.text();
    const parsed = parseDabiHtml(html);
    if (!parsed) {
      console.warn(`[dabi-license] license not found / parse failed: ${trimmed}`);
      return null;
    }
    return {
      licenseNumber: trimmed,
      ...parsed,
      raw: html,
      warning:
        "ДАБІ не має офіційного API; результат отримано через HTML-scraping і може бути неактуальним. Рекомендована ручна звірка.",
    };
  } catch (err) {
    console.warn("[dabi-license] fetch failed", err);
    return null;
  }
}
