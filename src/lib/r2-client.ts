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
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'metrum-estimates';

// R2 endpoint
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// S3 Client для R2 (R2 сумісний з S3 API)
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
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

  // Генеруємо підписану URL (дійсна 1 годину)
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(r2Client, getCommand, {
    expiresIn: 3600, // 1 година
  });

  console.log(`   ✅ Uploaded: ${key}`);

  return {
    key,
    url: signedUrl,
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
 * Використовувати R2 тільки на продакшені
 */
export function shouldUseR2(): boolean {
  // На localhost - не використовуємо R2 (працюємо напряму)
  // На продакшені - використовуємо R2
  const isProduction = process.env.NODE_ENV === 'production' ||
                       process.env.VERCEL_ENV === 'production';

  return isProduction && isR2Configured();
}

/**
 * Генерує presigned URL для прямого завантаження з браузера в R2
 * (обхід Vercel 4.5MB ліміту)
 */
export async function createPresignedUploadUrl(
  fileName: string,
  fileType: string,
  estimateId?: string
): Promise<{ uploadUrl: string; key: string }> {
  // Генеруємо унікальний ключ
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const prefix = estimateId ? `estimates/${estimateId}` : 'temp';
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

  console.log(`   ✅ Presigned URL created for: ${key}`);

  return {
    uploadUrl,
    key,
  };
}
