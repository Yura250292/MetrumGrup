/**
 * Відновлення нарад з R2 після втрати БД (інцидент 2026-05-22).
 * Фаза 1: створює Meeting-записи з прив'язаним аудіо.
 * Транскрипти/резюме генеруються окремо (recover-meeting-transcripts.ts).
 *
 * Запуск: npx tsx scripts/recover-meetings-from-r2.ts
 * Idempotent: пропускає наради, що вже існують (за id).
 */
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const BUCKET = process.env.R2_BUCKET_NAME || "metrum";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const MIME: Record<string, string> = {
  ".webm": "audio/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/** Витягує читабельну назву з імені файлу R2 (`{ts}-{rand}-{name}.ext`). */
function titleFromKey(fileName: string, date: Date): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  // прибрати префікс `{timestamp}-{randomId}-`
  const parts = base.split("-");
  const rest = parts.length > 2 ? parts.slice(2).join("-") : base;
  const cleaned = rest.replace(/[-_]+/g, " ").trim();
  const d = date.toLocaleDateString("uk-UA");
  if (!cleaned || /^recording/i.test(cleaned)) return `Нарада ${d}`;
  return cleaned;
}

async function main() {
  console.log("=== Відновлення нарад з R2 ===\n");

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Не знайдено SUPER_ADMIN користувача (потрібен для createdById)");
  console.log(`createdBy: ${admin.email}\n`);

  // Зібрати всі обʼєкти під meetings/
  const objects: Array<{ key: string; size: number; date: Date }> = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "meetings/", ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key && o.Key !== "meetings/") {
        objects.push({ key: o.Key, size: o.Size ?? 0, date: o.LastModified ?? new Date() });
      }
    }
    token = res.NextContinuationToken;
  } while (token);

  // Згрупувати за meetingId (= 2-й сегмент шляху meetings/{id}/...)
  const byMeeting = new Map<string, { key: string; size: number; date: Date }>();
  for (const o of objects) {
    const seg = o.key.split("/");
    if (seg.length < 3) continue;
    const meetingId = seg[1];
    // якщо кілька файлів на нараду — беремо найбільший (основний аудіозапис)
    const prev = byMeeting.get(meetingId);
    if (!prev || o.size > prev.size) byMeeting.set(meetingId, o);
  }
  console.log(`Знайдено ${byMeeting.size} нарад у R2\n`);

  let created = 0;
  let skipped = 0;
  for (const [meetingId, audio] of byMeeting) {
    const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (existing) {
      skipped++;
      continue;
    }
    const fileName = audio.key.split("/").pop() ?? "";
    const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    const title = titleFromKey(fileName, audio.date);

    await prisma.meeting.create({
      data: {
        id: meetingId, // зберігаємо оригінальний id з шляху R2
        title,
        status: "DRAFT",
        createdById: admin.id,
        firmId: "metrum-group",
        audioR2Key: audio.key,
        audioUrl: `${R2_PUBLIC_URL}/${audio.key}`,
        audioMimeType: MIME[ext] ?? "audio/webm",
        audioSizeBytes: audio.size,
        recordedAt: audio.date,
        createdAt: audio.date,
      },
    });
    created++;
    console.log(`  + ${title}  (${(audio.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(`\nСтворено: ${created}, пропущено (вже є): ${skipped}`);
  console.log("\nНаступний крок: npx tsx scripts/recover-meeting-transcripts.ts");
}

main()
  .catch((e) => {
    console.error("ПОМИЛКА:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
