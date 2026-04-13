/**
 * Cloudflare R2 Storage Client
 * Використовується для завантаження великих файлів (обхід 413 Payload Too Large)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 credentials (з .env)
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'metrum';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

// R2 endpoint
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// S3 Client для R2 (R2 сумісний з S3 API)
// IMPORTANT: forcePathStyle: true потрібно щоб уникнути TLS помилок
// (бакет як subdomain не покривається SSL сертифікатом *.r2.cloudflarestorage.com)
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

/**
 * S3/R2 metadata headers (x-amz-meta-*) дозволяють лише ASCII.
 * Кирилиця, пробіли з діакритикою тощо ламають запит із помилкою
 * "Invalid character in header content". encodeURIComponent робить
 * рядок безпечним для HTTP-заголовків.
 */
function safeMetaValue(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Transliterate Ukrainian Cyrillic to ASCII for R2 keys.
 * R2 public URLs have encoding mismatches with UTF-8 keys,
 * causing 404 for files like "Гірник.png". ASCII keys avoid this.
 * The original filename is stored separately in DB `name` field.
 */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye",
  ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
  ю: "yu", я: "ya",
  А: "A", Б: "B", В: "V", Г: "H", Ґ: "G", Д: "D", Е: "E", Є: "Ye",
  Ж: "Zh", З: "Z", И: "Y", І: "I", Ї: "Yi", Й: "Y", К: "K", Л: "L",
  М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U",
  Ф: "F", Х: "Kh", Ц: "Ts", Ч: "Ch", Ш: "Sh", Щ: "Shch", Ь: "",
  Ю: "Yu", Я: "Ya",
};

function safeKeyFileName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";
  const base = name.slice(0, dotIdx >= 0 ? dotIdx : undefined);

  // Transliterate Cyrillic, then strip remaining non-ASCII
  const transliterated = base
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("");
  const ascii = transliterated
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return (ascii || "file") + ext;
}

export interface UploadedFile {
  key: string;          // R2 ключ файлу
  url: string;          // Підписана URL для завантаження (дійсна 1 годину)
  originalName: string; // Оригінальна назва файлу
  size: number;         // Розмір у байтах
  mimeType: string;     // MIME тип
}

/**
 * Завантажує файл в R2 і повертає підписану URL
 */
export async function uploadFileToR2(
  file: File,
  scope?: string
): Promise<UploadedFile> {
  // Генеруємо унікальний ключ.
  // Якщо scope вже містить '/', використовуємо як є (наприклад "projects/abc");
  // інакше (legacy виклик з estimateId) — обгортаємо в estimates/<id>.
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const prefix = !scope
    ? 'temp'
    : scope.includes('/')
      ? scope.replace(/\/+$/, '')
      : `estimates/${scope}`;
  const key = `${prefix}/${timestamp}-${randomId}-${safeKeyFileName(file.name)}`;

  console.log(`📤 Uploading to R2: ${key} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  // Конвертуємо File в Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Завантажуємо в R2
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: file.type,
    Metadata: {
      originalName: safeMetaValue(file.name),
      uploadedAt: new Date().toISOString(),
    },
  });

  await r2Client.send(command);

  // Keys are now ASCII-safe (Cyrillic transliterated), so no encoding needed.
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  console.log(`   ✅ Uploaded: ${key}`);

  return {
    key,
    url: publicUrl,
    originalName: file.name,
    size: file.size,
    mimeType: file.type,
  };
}

/**
 * Завантажує масив файлів в R2
 */
export async function uploadFilesToR2(
  files: File[],
  scope?: string
): Promise<UploadedFile[]> {
  console.log(`📦 Uploading ${files.length} files to R2...`);

  const uploadPromises = files.map(file => uploadFileToR2(file, scope));
  const results = await Promise.all(uploadPromises);

  const totalSize = results.reduce((sum, f) => sum + f.size, 0);
  console.log(`✅ Uploaded ${results.length} files (${(totalSize / 1024 / 1024).toFixed(2)} MB total)`);

  return results;
}

/**
 * Завантажує файл з R2
 */
export async function downloadFileFromR2(key: string): Promise<Buffer> {
  console.log(`📥 Downloading from R2: ${key}`);

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);

  // Конвертуємо stream в Buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Видаляє файл з R2
 */
export async function deleteFileFromR2(key: string): Promise<void> {
  console.log(`🗑️  Deleting from R2: ${key}`);

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
  console.log(`   ✅ Deleted: ${key}`);
}

/**
 * Видаляє масив файлів з R2
 */
export async function deleteFilesFromR2(keys: string[]): Promise<void> {
  console.log(`🗑️  Deleting ${keys.length} files from R2...`);

  const deletePromises = keys.map(key => deleteFileFromR2(key));
  await Promise.all(deletePromises);

  console.log(`✅ Deleted ${keys.length} files`);
}

/**
 * Перевіряє чи є R2 налаштований
 */
export function isR2Configured(): boolean {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET_NAME);
}

/**
 * Використовувати R2, якщо налаштовані env-vars.
 * Server-side proxy upload (через наш API route) обходить CORS browser→R2.
 */
export function shouldUseR2(): boolean {
  return isR2Configured();
}

/**
 * Генерує presigned URL для прямого завантаження з браузера в R2
 * (обхід Vercel 4.5MB ліміту).
 *
 * @param fileName  Оригінальна назва файлу (зберігається в кінці ключа)
 * @param fileType  MIME тип
 * @param scope     Або рядок з готовим префіксом (наприклад "projects/abc"),
 *                  або estimateId для зворотньої сумісності з v2-генератором.
 */
export async function createPresignedUploadUrl(
  fileName: string,
  fileType: string,
  scope?: string
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  // Генеруємо унікальний ключ.
  // Якщо префікс уже містить '/', використовуємо його як є; інакше
  // (legacy виклик з самим estimateId) — обгортаємо в estimates/<id>.
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const prefix = !scope
    ? 'temp'
    : scope.includes('/')
      ? scope.replace(/\/+$/, '')
      : `estimates/${scope}`;
  const key = `${prefix}/${timestamp}-${randomId}-${safeKeyFileName(fileName)}`;

  console.log(`🔑 Creating presigned URL for: ${key}`);

  // Створюємо presigned URL для PUT запиту
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    Metadata: {
      originalName: safeMetaValue(fileName),
      uploadedAt: new Date().toISOString(),
    },
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 3600, // 1 година
  });

  // Keys are now ASCII-safe, no encoding needed.
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  console.log(`   ✅ Presigned URL created for: ${key}`);

  return {
    uploadUrl,
    key,
    publicUrl,
  };
}
