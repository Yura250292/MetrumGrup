/**
 * One-off restore: відновлює Counterparty (постачальники) + FinanceEntry
 * з файлу "2026 станом на 21.05.26.xlsx" після інциденту 2026-05-22 (БД стерта).
 *
 * - firmId = null для всіх записів (спільні постачальники між Group/Studio)
 * - createdById = Юрій Федишин (ufedishin@gmail.com)
 * - Counterparty.roles = [SUPPLIER]
 * - FinanceEntry: type=EXPENSE kind=FACT
 *     оплачено → status=PAID  + paidAt
 *     неоплачено → status=APPROVED (відкритий борг)
 * - Об'єкт ("Куди везли") → description
 * - Дедуп Counterparty за нормалізованою назвою
 * - Дедуп FinanceEntry за (counterpartyId, invoiceNumber, amount, occurredAt)
 *
 * Запуск:
 *   npx tsx scripts/restore-suppliers-from-xlsx-may2026.ts            # dry-run
 *   npx tsx scripts/restore-suppliers-from-xlsx-may2026.ts --apply    # запис у БД
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FILE = '/Users/admin/Downloads/Telegram Desktop/2026 станом на 21.05.26.xlsx';
const CREATOR_EMAIL = 'ufedishin@gmail.com';
const APPLY = process.argv.includes('--apply');

function normalizeSupplier(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  // strip всі види лапок
  s = s.replace(/["«»"„'']/g, '');
  // strip prefix-форми юросіб
  s = s.replace(/^(тзов|тов|пп|пат|ат|дп|фоп)\.?\s*/i, '');
  // нормалізуємо регістр
  s = s.toLowerCase();
  // ПРАЙД / ПРАИД, Євпромета / Євромета — НЕ зливаємо: різні написання можуть бути різні юрособи
  return s;
}

type Row = {
  rowIdx: number;
  supplier: string;
  invoice: string;
  project: string;
  amount: number;
  occurredAt: Date;
  paidAt: Date | null;
};

function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.result instanceof Date) return v.result;
  const s = String(v).trim();
  if (!s || s === ' ') return null;
  // ExcelJS у нас рендерить дати як Date object у v.value напряму, тому fallback рідкісний
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  console.log(`\n=== ${APPLY ? '🚀 APPLY' : '🔍 DRY-RUN'} ===\n`);

  const creator = await prisma.user.findUnique({ where: { email: CREATOR_EMAIL } });
  if (!creator) throw new Error(`User ${CREATOR_EMAIL} not found`);
  console.log(`Author: ${creator.name} (${creator.id})`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];

  const rows: Row[] = [];
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const supplier = String(row.getCell(1).value ?? '').replace(/\s+/g, ' ').trim();
    const invoice = String(row.getCell(2).value ?? '').trim();
    const project = String(row.getCell(3).value ?? '').trim();
    const sumRaw = row.getCell(4).value;
    const delivery = parseDate(row.getCell(5).value);
    const paid = parseDate(row.getCell(6).value);

    const amount = typeof sumRaw === 'number'
      ? sumRaw
      : parseFloat(String(sumRaw ?? '').replace(',', '.')) || 0;

    if (!supplier && !amount) continue;
    if (!supplier) { console.warn(`  ⚠ row ${r}: пустий постачальник, пропуск`); continue; }
    if (amount <= 0) { console.warn(`  ⚠ row ${r}: amount<=0, пропуск`); continue; }

    rows.push({
      rowIdx: r,
      supplier,
      invoice,
      project,
      amount,
      occurredAt: delivery ?? paid ?? new Date('2026-01-01'),
      paidAt: paid,
    });
  }
  console.log(`Parsed ${rows.length} data rows from XLSX\n`);

  // 1) Унікальні постачальники
  const supplierByKey = new Map<string, { canonicalName: string; samples: Set<string> }>();
  for (const row of rows) {
    const key = normalizeSupplier(row.supplier);
    const cur = supplierByKey.get(key) || { canonicalName: row.supplier, samples: new Set() };
    cur.samples.add(row.supplier);
    // canonicalName = найдовша версія (зазвичай повна юросновна назва)
    if (row.supplier.length > cur.canonicalName.length) cur.canonicalName = row.supplier;
    supplierByKey.set(key, cur);
  }
  console.log(`Unique suppliers (after normalization): ${supplierByKey.size}`);
  for (const [key, info] of supplierByKey) {
    if (info.samples.size > 1) {
      console.log(`  merged: "${info.canonicalName}"  ← {${[...info.samples].join(' | ')}}`);
    }
  }

  // 2) Upsert Counterparty
  const cpIdByKey = new Map<string, string>();
  console.log(`\n${APPLY ? 'Creating' : 'Would create'} ${supplierByKey.size} Counterparty rows...`);
  let cpCreated = 0, cpSkipped = 0;
  for (const [key, info] of supplierByKey) {
    if (APPLY) {
      const existing = await prisma.counterparty.findFirst({
        where: { name: info.canonicalName, firmId: null },
      });
      if (existing) {
        cpIdByKey.set(key, existing.id);
        cpSkipped++;
      } else {
        const cp = await prisma.counterparty.create({
          data: {
            name: info.canonicalName,
            type: info.canonicalName.match(/^фоп/i) ? 'FOP' : 'LEGAL',
            roles: ['SUPPLIER'],
            firmId: null,
            isActive: true,
          },
        });
        cpIdByKey.set(key, cp.id);
        cpCreated++;
      }
    } else {
      cpIdByKey.set(key, `<would-create:${key}>`);
      cpCreated++;
    }
  }
  console.log(`  ${cpCreated} new, ${cpSkipped} already existed`);

  // 3) FinanceEntry для кожного рядка
  let feCreated = 0, feSkipped = 0, paidCnt = 0, unpaidCnt = 0;
  let paidAmt = 0, unpaidAmt = 0;
  console.log(`\n${APPLY ? 'Creating' : 'Would create'} FinanceEntry rows...`);
  for (const row of rows) {
    const cpId = cpIdByKey.get(normalizeSupplier(row.supplier))!;
    const isPaid = row.paidAt != null;
    if (isPaid) { paidCnt++; paidAmt += row.amount; } else { unpaidCnt++; unpaidAmt += row.amount; }

    const titleSupplier = row.supplier.slice(0, 80);
    const titleInvoice = row.invoice ? ` — ${row.invoice.slice(0, 60)}` : '';
    const title = `${titleSupplier}${titleInvoice}`.slice(0, 200);

    if (APPLY) {
      // дедуп: той самий counterparty + invoice + amount
      const dupWhere = {
        counterpartyId: cpId,
        amount: row.amount,
        ...(row.invoice ? { invoiceNumber: row.invoice } : { title }),
      };
      const existing = await prisma.financeEntry.findFirst({ where: dupWhere });
      if (existing) { feSkipped++; continue; }

      await prisma.financeEntry.create({
        data: {
          occurredAt: row.occurredAt,
          kind: 'FACT',
          type: 'EXPENSE',
          amount: row.amount,
          currency: 'UAH',
          category: 'Матеріали',
          title,
          description: row.project || null,
          counterparty: row.supplier,
          counterpartyId: cpId,
          status: isPaid ? 'PAID' : 'APPROVED',
          paidAt: row.paidAt,
          approvedAt: isPaid ? row.paidAt : row.occurredAt,
          approvedById: creator.id,
          invoiceNumber: row.invoice || null,
          source: 'MANUAL',
          createdById: creator.id,
          firmId: null,
        },
      });
      feCreated++;
    } else {
      feCreated++;
    }
  }
  console.log(`  ${feCreated} new, ${feSkipped} dedup-skipped`);
  console.log(`    paid: ${paidCnt}× / ${paidAmt.toFixed(2)} грн`);
  console.log(`    unpaid (open debt): ${unpaidCnt}× / ${unpaidAmt.toFixed(2)} грн`);

  if (!APPLY) {
    console.log(`\n💡 Dry-run завершено. Запусти з --apply щоб записати в БД.`);
  } else {
    console.log(`\n✅ Готово.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
