import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { parseExcelEstimate } from '../src/lib/parsers/excel-estimate-parser';
import { parseKB2ActExcel } from '../src/lib/parsers/kb2-act-parser';

async function main() {
  const path = '/Users/admin/Desktop/АКТ ДО КОШТОРИСУ №9 (03.04.2026-07.04.2026).xls';
  const buf = readFileSync(path);
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log('Sheets:', wb.SheetNames);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as any[][];
  console.log('Total rows:', data.length);
  console.log('--- ПАРСЕР КБ-2в ---');
  const ab2 = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const kb2Items = parseKB2ActExcel(ab2);
  console.log('KB-2 items:', kb2Items.length);
  if (kb2Items.length > 0) {
    let totalLabor = 0, totalMat = 0;
    for (const it of kb2Items) {
      if (it.costType === 'LABOR') totalLabor += it.amount;
      else if (it.costType === 'MATERIAL') totalMat += it.amount;
    }
    console.log('Sum LABOR:', totalLabor.toFixed(2));
    console.log('Sum MATERIAL:', totalMat.toFixed(2));
    console.log('Sum TOTAL:', (totalLabor + totalMat).toFixed(2));
    console.log('First 3:', JSON.stringify(kb2Items.slice(0, 3), null, 2));
    console.log('Last 3:', JSON.stringify(kb2Items.slice(-3), null, 2));
  }
  console.log('--- legacy estimate parser ---');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const result = await parseExcelEstimate(ab);
  console.log('success:', result.success);
  console.log('items count:', result.items.length);
  console.log('errors:', result.errors);
  console.log('metadata:', result.metadata);
  if (result.items.length > 0) {
    console.log('first 3 items:', JSON.stringify(result.items.slice(0,3), null, 2));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
