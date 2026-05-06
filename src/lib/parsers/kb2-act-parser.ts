/**
 * Парсер для актів КБ-2в (АКТ ПРО ПРИЙМАННЯ ВИКОНАНИХ РОБІТ).
 *
 * Структура файлу:
 *   - Шапка: Замовник / Підрядник / Об'єкт (рядки 0-9)
 *   - "Розділ: КВ. #N" — назва квартири
 *   - "Робота" — секція робіт
 *   - Заголовки: №, Найменування робіт
 *   - Group rows: col 0 = "1", "2" (число без крапки), col 1 = група (CAPS)
 *   - Item rows: col 0 = "1.1", "10.2" (число.число), col 1 = title,
 *                col 6 = unit, col 7 = qty, col 8 = unitPrice, col 9 = amount
 *   - "Разом по групі:" / "Разом:" — підсумки (skip)
 *   - "Матеріали" — секція матеріалів (та сама структура)
 *   - "Всього за актом: ..." — total (skip)
 *
 * Використовується у foreman parse pipeline як fallback коли
 * parseExcelEstimate (звичайний кошторис) повертає 0 items.
 */

import * as XLSX from "xlsx";
import type { CostType } from "@prisma/client";
import type { ForemanDraftItem } from "@/lib/foreman/merge-items";

const ITEM_NUMBER_RE = /^\d+\.\d+(\.\d+)?$/; // 1.1, 1.2, 10.10, 1.1.1

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s+/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function isSectionHeader(text: string): "LABOR" | "MATERIAL" | null {
  const t = text.trim().toLowerCase();
  if (/^(робот[аи]|роботи з|роботи)$/i.test(text.trim())) return "LABOR";
  if (t === "матеріали" || t.startsWith("матеріали ")) return "MATERIAL";
  return null;
}

export function parseKB2ActExcel(buffer: ArrayBuffer | Buffer): ForemanDraftItem[] {
  const ab =
    buffer instanceof ArrayBuffer
      ? buffer
      : (buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(ab, { type: "array" });
  } catch (e) {
    console.warn("[parseKB2Act] read failed:", e);
    return [];
  }

  const items: ForemanDraftItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    let currentSection: "LABOR" | "MATERIAL" = "LABOR"; // default — більшість файлів = акт робіт

    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;

      const col0 = String(row[0] ?? "").trim();
      const col1 = String(row[1] ?? "").trim();

      // Section switch
      const sectionHit = isSectionHeader(col0);
      if (sectionHit) {
        currentSection = sectionHit;
        continue;
      }

      // Skip totals
      if (/^(разом|всього|підсумок)/i.test(col0)) continue;

      // Item rows have number like "1.1" in col 0
      if (!ITEM_NUMBER_RE.test(col0)) continue;
      if (!col1) continue;

      // Try multiple column layouts because КБ-2в files vary:
      //   layout A: col 6=unit, 7=qty, 8=unitPrice, 9=amount
      //   layout B: col 5=unit, 6=qty, 7=unitPrice, 8=amount
      const candidates = [
        { unit: row[6], qty: row[7], price: row[8], amount: row[9] },
        { unit: row[5], qty: row[6], price: row[7], amount: row[8] },
      ];

      let chosen: { unit: unknown; qty: unknown; price: unknown; amount: unknown } | null = null;
      for (const c of candidates) {
        const a = toNumber(c.amount);
        if (a !== null && a > 0) {
          chosen = c;
          break;
        }
      }
      if (!chosen) continue;

      const amount = toNumber(chosen.amount);
      if (amount === null || amount <= 0) continue;

      const qty = toNumber(chosen.qty);
      const unitPrice = toNumber(chosen.price);
      const unit = String(chosen.unit ?? "").trim() || null;

      items.push({
        costType: currentSection as CostType,
        title: col1,
        unit,
        quantity: qty,
        unitPrice,
        amount,
        currency: "UAH",
        confidence: 0.85,
      });
    }
  }

  return items;
}
