#!/usr/bin/env tsx
/**
 * Smoke test для Excel/PDF export.
 *
 * Бере існуючий estimate з БД, формує payload (як це робить frontend
 * exportEstimate()), і запускає generateExcel/generatePDF напряму без HTTP.
 *
 * Це обходить Vercel function timeout і дає прямий stack trace замість
 * обрізаного 500 від API.
 *
 *   npx tsx scripts/smoke-test-export.ts <estimateId>
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';

const estimateId = process.argv[2];
if (!estimateId) {
  console.error('Usage: npx tsx scripts/smoke-test-export.ts <estimateId>');
  process.exit(2);
}

async function main() {
  // 1. Завантажити estimate з БД
  console.log(`📥 Loading estimate ${estimateId}...`);
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  if (!estimate) {
    console.error(`❌ Not found: ${estimateId}`);
    process.exit(1);
  }
  console.log(`   Title:    ${estimate.title}`);
  console.log(`   Sections: ${estimate.sections.length}`);
  console.log(`   Items:    ${estimate.sections.reduce((s, sec) => s + sec.items.length, 0)}`);
  console.log(`   Total:    ${Number(estimate.totalAmount).toLocaleString('uk-UA')} ₴`);

  // 2. Сформувати payload так само як це робить v2 frontend
  const payload = {
    title: estimate.title,
    description: estimate.description || '',
    area: 1400,
    sections: estimate.sections.map((sec) => ({
      title: sec.title,
      sectionTotal: Number(sec.totalAmount ?? 0),
      items: sec.items.map((item) => ({
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        laborCost: Number(item.laborRate) * Number(item.laborHours),
        totalCost: Number(item.amount),
        priceSource: (item as any).priceSource ?? null,
        confidence: (item as any).confidence !== null && (item as any).confidence !== undefined
          ? Number((item as any).confidence)
          : null,
      })),
    })),
    summary: {
      materialsCost: Number(estimate.totalMaterials),
      laborCost: Number(estimate.totalLabor),
      overheadCost: Number(estimate.totalOverhead),
      overheadPercent: 15,
      totalBeforeDiscount: Number(estimate.totalAmount),
    },
  };

  fs.mkdirSync(path.resolve('./tmp'), { recursive: true });

  // 3. Спробувати Excel
  console.log('\n📊 Testing Excel export...');
  try {
    const ExcelJS: any = await import('exceljs');
    const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
    if (!Workbook) {
      throw new Error('Cannot find ExcelJS.Workbook constructor — check exceljs version');
    }
    const workbook = new Workbook();
    workbook.creator = 'METRUM GROUP';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Кошторис');
    sheet.columns = [
      { header: '№', key: 'num', width: 5 },
      { header: 'Найменування', key: 'desc', width: 50 },
      { header: 'Од.', key: 'unit', width: 8 },
      { header: 'К-сть', key: 'qty', width: 10 },
      { header: 'Ціна', key: 'price', width: 12 },
      { header: 'Сума', key: 'total', width: 14 },
    ];
    let rowNum = 0;
    payload.sections.forEach((sec) => {
      sheet.addRow({ desc: sec.title }).font = { bold: true };
      sec.items.forEach((item) => {
        rowNum++;
        sheet.addRow({
          num: rowNum,
          desc: item.description,
          unit: item.unit,
          qty: item.quantity,
          price: item.unitPrice,
          total: item.totalCost,
        });
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const outPath = path.resolve('./tmp/test-export.xlsx');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(buffer));
    console.log(`   ✅ Excel OK — wrote ${(buffer.byteLength / 1024).toFixed(1)} KB → ${outPath}`);
  } catch (e) {
    console.error('   ❌ Excel failed:', e);
  }

  // 4. Спробувати PDF
  console.log('\n📄 Testing PDF export...');
  try {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const { ROBOTO_BASE64 } = await import('../src/lib/fonts/roboto-base64');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.addFileToVFS('Roboto.ttf', ROBOTO_BASE64);
    doc.addFont('Roboto.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto');

    doc.setFontSize(20);
    doc.text(payload.title || 'Кошторис', 15, 20);
    doc.setFontSize(10);
    doc.text(`Загалом: ${payload.summary.totalBeforeDiscount.toLocaleString('uk-UA')} ₴`, 15, 30);

    let y = 40;
    payload.sections.forEach((sec, sIdx) => {
      doc.setFontSize(12);
      doc.text(`${sIdx + 1}. ${sec.title}`, 15, y);
      y += 8;
      sec.items.forEach((item) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(8);
        const line = `  ${item.description.slice(0, 60)} — ${item.quantity} ${item.unit} × ${item.unitPrice} = ${item.totalCost} ₴`;
        doc.text(line, 15, y);
        y += 4;
      });
      y += 4;
    });

    const pdfBuffer = doc.output('arraybuffer');
    const outPath = path.resolve('./tmp/test-export.pdf');
    fs.writeFileSync(outPath, Buffer.from(pdfBuffer));
    console.log(`   ✅ PDF OK — wrote ${(pdfBuffer.byteLength / 1024).toFixed(1)} KB → ${outPath}`);
  } catch (e) {
    console.error('   ❌ PDF failed:', e);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('main() crashed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
