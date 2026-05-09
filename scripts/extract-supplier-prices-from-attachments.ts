/**
 * Backfill: витягнути постачальників і ціни з історичних attachments
 * (FinanceEntryAttachment + ForemanReportAttachment) через AI-парсер.
 *
 * Сценарій:
 *   1. Знаходимо FinanceEntry без counterpartyId (type=EXPENSE, costType=MATERIAL).
 *   2. Беремо перший attachment (зазвичай чек/накладна).
 *   3. Скачуємо з R2.
 *   4. Image → classifyExpenseImage; PDF → ocrReceiptStructured.
 *   5. Якщо AI повернув supplier/merchantName:
 *        - resolveSupplier → existing Counterparty? Якщо ні — створюємо нового з role=SUPPLIER.
 *        - Заповнюємо FinanceEntry.counterpartyId.
 *        - upsertSupplierMaterial з unitPrice (якщо є).
 *
 * Опції:
 *   --dry-run            не пише в БД, лише друкує що би зробив
 *   --limit N            обмежити кількість оброблюваних FinanceEntry (default 10)
 *   --firm-id ID         обмежити фірмою (default metrum-studio)
 *   --concurrency N      паралельність (default 3, max 8)
 *
 * Run:
 *   npx tsx scripts/extract-supplier-prices-from-attachments.ts --dry-run --limit 10
 *   npx tsx scripts/extract-supplier-prices-from-attachments.ts --limit 50 --concurrency 5
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { classifyExpenseImage } from "@/lib/ai/classify-expense-image";
import { ocrReceiptStructured } from "@/lib/ocr/receipt-ocr";
import { resolveSupplier } from "@/lib/foreman/resolve-supplier";
import { upsertSupplierMaterial } from "@/lib/foreman/upsert-supplier-material";

const prisma = new PrismaClient();

type Args = {
  dryRun: boolean;
  limit: number;
  firmId: string;
  concurrency: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    dryRun: false,
    limit: 10,
    firmId: "metrum-studio",
    concurrency: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Math.max(1, Number(argv[++i] ?? 10));
    else if (a === "--firm-id") args.firmId = argv[++i] ?? args.firmId;
    else if (a === "--concurrency")
      args.concurrency = Math.min(8, Math.max(1, Number(argv[++i] ?? 3)));
  }
  return args;
}

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const r2Endpoint = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : process.env.R2_ENDPOINT;
const BUCKET = process.env.R2_BUCKET_NAME || "";

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return s3;
}

/**
 * Безпечна нормалізація merchantName з AI-output:
 * - витягуємо ЄДРПОУ/РНОКПП з тексту якщо AI не виокремив (regex 8-10 цифр поряд з маркерами)
 * - обрізаємо назву до першого розриву (адреса/телефон/ІПН) — щоб не зберігати простирадло
 * - нормалізуємо префікси юрформ
 */
function normalizeMerchant(args: {
  name: string | null;
  taxId: string | null;
}): { name: string | null; taxId: string | null } {
  let name = args.name?.trim() ?? null;
  let taxId = args.taxId?.trim() ?? null;

  if (!name) return { name: null, taxId };

  // 1. Витягти ЄДРПОУ/РНОКПП з тексту назви якщо AI його туди вписав.
  if (!taxId) {
    const m = name.match(
      /(?:ІПН|РНОКПП|ЄДРПОУ|Код[\s:]*ЄДРПОУ|Код)[:\s]*(\d{8,10})/i,
    );
    if (m) taxId = m[1];
  }
  if (taxId) taxId = taxId.replace(/\D+/g, "");
  if (taxId && (taxId.length < 8 || taxId.length > 10)) taxId = null;

  // 2. Зрізати все після першого "ІПН/РНОКПП/тел/адрес/буд/вул/обл/коми".
  name = name.replace(
    /[,;]?\s*(?:ІПН|РНОКПП|ДРФО|ЄДРПОУ|тел[.: ]|телефон|адреса|вул\.|буд\.|м\.|обл\.|с\.).*$/i,
    "",
  );
  // 3. Скоротити форми.
  name = name
    .replace(/Фізичн[аоу]?\s*особа\s*[-–—]?\s*підприємець/gi, "ФОП")
    .replace(/Товариство\s+з\s+обмеженою\s+відповідальністю/gi, "ТОВ")
    .replace(/Приватне\s+підприємство/gi, "ПП")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;]+|[\s,.:;]+$/g, "")
    .trim();

  if (name.length > 100) name = name.slice(0, 100).trim();
  if (name.length < 2) name = null;

  return { name, taxId };
}

async function downloadR2(key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const resp = await getS3().send(cmd);
  if (!resp.Body) throw new Error("empty body");
  const chunks: Buffer[] = [];
  for await (const ch of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(ch));
  }
  return Buffer.concat(chunks);
}

type Stats = {
  processed: number;
  skippedNoAttach: number;
  skippedNoSupplier: number;
  skippedR2Error: number;
  matched: number;
  createdCounterparty: number;
  linkedFE: number;
  upsertedMaterials: number;
};

async function processOne(
  fe: {
    id: string;
    title: string;
    amount: Prisma.Decimal;
    firmId: string | null;
    occurredAt: Date;
    attachments: Array<{ id: string; r2Key: string; mimeType: string; originalName: string }>;
  },
  args: Args,
  stats: Stats,
) {
  if (fe.attachments.length === 0) {
    stats.skippedNoAttach++;
    return;
  }

  const att = fe.attachments[0]; // перший — зазвичай чек/накладна

  let buf: Buffer;
  try {
    buf = await downloadR2(att.r2Key);
  } catch (e) {
    stats.skippedR2Error++;
    console.warn(`  [${fe.id}] R2 download failed (${att.r2Key}): ${(e as Error).message}`);
    return;
  }

  let supplierName: string | null = null;
  let supplierTaxId: string | null = null;
  let unitPrice: number | null = null;

  if (att.mimeType.startsWith("image/")) {
    try {
      const cls = await classifyExpenseImage(buf, att.mimeType);
      supplierName = cls.merchantName;
      supplierTaxId = cls.merchantTaxId;
      // Беремо unitPrice першого item-у який в назві найбільш збігається з title FE.
      // Простіше — беремо першу позитивну ціну.
      const itemWithPrice = cls.items.find((i) => i.unitPrice && i.unitPrice > 0);
      unitPrice = itemWithPrice?.unitPrice ?? null;
    } catch (e) {
      console.warn(`  [${fe.id}] image classify failed: ${(e as Error).message}`);
    }
  } else if (att.mimeType === "application/pdf") {
    try {
      const ocr = await ocrReceiptStructured(buf, att.mimeType);
      supplierName = ocr.parsed.supplier;
      const itemWithPrice = ocr.parsed.items.find((i) => i.unitPrice > 0);
      unitPrice = itemWithPrice?.unitPrice ?? null;
    } catch (e) {
      console.warn(`  [${fe.id}] PDF OCR failed: ${(e as Error).message}`);
    }
  } else {
    // Excel / інше — пропускаємо. Можна розширити пізніше.
    stats.skippedNoSupplier++;
    return;
  }

  if (!supplierName) {
    stats.skippedNoSupplier++;
    return;
  }

  // Нормалізуємо AI-output: обрізаємо адреси/реквізити, витягуємо ЄДРПОУ.
  const norm = normalizeMerchant({ name: supplierName, taxId: supplierTaxId });
  supplierName = norm.name;
  supplierTaxId = norm.taxId;

  if (!supplierName) {
    stats.skippedNoSupplier++;
    return;
  }

  console.log(
    `  [${fe.id}] "${fe.title.slice(0, 40)}" → "${supplierName}"${
      supplierTaxId ? ` (${supplierTaxId})` : ""
    }${unitPrice ? `, unitPrice=${unitPrice}` : ""}`,
  );

  if (args.dryRun) return;

  // Resolve або створити Counterparty.
  const resolved = await resolveSupplier({
    firmId: fe.firmId,
    guess: supplierName,
    edrpouHint: supplierTaxId,
  });

  let counterpartyId = resolved.counterpartyId;
  if (!counterpartyId) {
    const created = await prisma.counterparty.create({
      data: {
        name: supplierName.trim(),
        type: "LEGAL",
        roles: ["SUPPLIER"],
        edrpou: supplierTaxId?.replace(/\D+/g, "") || null,
        isActive: true,
        firmId: fe.firmId ?? undefined,
      },
    });
    counterpartyId = created.id;
    stats.createdCounterparty++;
    console.log(`    → створено Counterparty ${created.id}`);
  } else {
    stats.matched++;
  }

  // Прив'язати FE до постачальника.
  await prisma.financeEntry.update({
    where: { id: fe.id },
    data: { counterpartyId },
  });
  stats.linkedFE++;

  // Якщо є unitPrice — оновити довідник матеріалів.
  if (unitPrice && unitPrice > 0 && fe.firmId) {
    await prisma.$transaction(async (tx) => {
      await upsertSupplierMaterial(tx, {
        counterpartyId: counterpartyId!,
        firmId: fe.firmId!,
        title: fe.title,
        unit: null,
        unitPrice,
        occurredAt: fe.occurredAt,
        sourceReportId: fe.id, // використовуємо FE id як source-id (audit)
        sourceItemId: fe.id,
      });
    });
    stats.upsertedMaterials++;
  }
}

async function main() {
  const args = parseArgs();
  console.log("🔄 extract-supplier-prices-from-attachments");
  console.log("  config:", args);

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY не налаштовано");
    process.exit(1);
  }

  // isArchived НЕ фільтруємо: 70% історичних фактів на Studio в архіві,
  // і саме там цінна інформація про постачальників. Привʼязка counterpartyId
  // на архівному FE безпечна — поточний борг рахується тільки з isArchived=false.
  const candidates = await prisma.financeEntry.findMany({
    where: {
      firmId: args.firmId,
      type: "EXPENSE",
      costType: "MATERIAL",
      counterpartyId: null,
      attachments: { some: {} },
    },
    select: {
      id: true,
      title: true,
      amount: true,
      firmId: true,
      occurredAt: true,
      attachments: {
        select: { id: true, r2Key: true, mimeType: true, originalName: true },
        take: 1,
      },
    },
    orderBy: { occurredAt: "desc" },
    take: args.limit,
  });

  console.log(`  candidates: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log("  Нічого обробляти. Усе вже оброблено або немає attachments.");
    return;
  }

  const stats: Stats = {
    processed: 0,
    skippedNoAttach: 0,
    skippedNoSupplier: 0,
    skippedR2Error: 0,
    matched: 0,
    createdCounterparty: 0,
    linkedFE: 0,
    upsertedMaterials: 0,
  };

  // Простий concurrency-limit через batch'и.
  for (let i = 0; i < candidates.length; i += args.concurrency) {
    const batch = candidates.slice(i, i + args.concurrency);
    await Promise.all(
      batch.map(async (fe) => {
        stats.processed++;
        await processOne(fe, args, stats);
      }),
    );
    console.log(`  progress: ${Math.min(i + args.concurrency, candidates.length)}/${candidates.length}`);
  }

  console.log("\n📊 Summary:");
  console.log(`  processed:        ${stats.processed}`);
  console.log(`  matched existing: ${stats.matched}`);
  console.log(`  created new CP:   ${stats.createdCounterparty}`);
  console.log(`  linked FE:        ${stats.linkedFE}`);
  console.log(`  upserted SMtl:    ${stats.upsertedMaterials}`);
  console.log(`  skipped (no supplier): ${stats.skippedNoSupplier}`);
  console.log(`  skipped (R2 err): ${stats.skippedR2Error}`);
  console.log(args.dryRun ? "\n⚠ DRY-RUN — нічого не записано." : "\n✅ Готово.");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
