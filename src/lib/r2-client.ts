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
  estimateId?: string
): Promise<UploadedFile> {
  // Генеруємо унікальний ключ
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const prefix = estimateId ? `estimates/${estimateId}` : 'temp';
  const key = `${prefix}/${timestamp}-${randomId}-${file.name}`;

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
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  await r2Client.send(command);

  // Використовуємо публічний URL (обходимо CORS проблеми)
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
  estimateId?: string
): Promise<UploadedFile[]> {
  console.log(`📦 Uploading ${files.length} files to R2...`);

  const uploadPromises = files.map(file => uploadFileToR2(file, estimateId));
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
  const key = `${prefix}/${timestamp}-${randomId}-${fileName}`;

  console.log(`🔑 Creating presigned URL for: ${key}`);

  // Створюємо presigned URL для PUT запиту
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    Metadata: {
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
    },
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 3600, // 1 година
  });

  // Публічний URL для читання після завантаження
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  console.log(`   ✅ Presigned URL created for: ${key}`);

  return {
    uploadUrl,
    key,
    publicUrl,
  };
}
