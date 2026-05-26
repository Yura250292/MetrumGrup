import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const COMPUTED_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : process.env.R2_ENDPOINT;

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: COMPUTED_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return cachedClient;
}

export const FOREMAN_BUCKET = process.env.R2_BUCKET_NAME || "";

export async function getForemanPutUrl(params: {
  userId: string;
  originalName: string;
  mimeType: string;
}): Promise<{ key: string; putUrl: string }> {
  return getR2PutUrl({
    userId: params.userId,
    originalName: params.originalName,
    mimeType: params.mimeType,
    prefix: "foreman",
    source: "foreman-report",
  });
}

/**
 * Універсальний пресайн для R2 PUT. Викликається з різних модулів
 * (foreman, admin stages AI). Префікс контролює namespace ключа в бакеті.
 */
export async function getR2PutUrl(params: {
  userId: string;
  originalName: string;
  mimeType: string;
  prefix: string;
  source: string;
}): Promise<{ key: string; putUrl: string }> {
  const timestamp = Date.now();
  const sanitized = params.originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `${params.prefix}/${params.userId}/${timestamp}_${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: FOREMAN_BUCKET,
    Key: key,
    ContentType: params.mimeType,
    Metadata: {
      uploadedBy: params.userId,
      source: params.source,
      uploadedAt: new Date().toISOString(),
    },
  });

  const putUrl = await getSignedUrl(client(), command, { expiresIn: 3600 });
  return { key, putUrl };
}

/**
 * Завантажити вміст файлу з R2 у memory buffer (для AI парсерів).
 * Використовується серверним кодом для image classification / OCR.
 */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: FOREMAN_BUCKET, Key: key });
  const response = await client().send(command);
  if (!response.Body) {
    throw new Error(`R2 object empty: ${key}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getForemanGetUrl(key: string, expiresIn = 600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: FOREMAN_BUCKET, Key: key });
  return getSignedUrl(client(), command, { expiresIn });
}
