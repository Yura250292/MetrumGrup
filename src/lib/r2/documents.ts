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

export const DOCUMENTS_BUCKET = process.env.R2_BUCKET_NAME || "";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
}

function monthFolder(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Стандартний шлях у bucket для вхідних документів:
 *   incoming-documents/{firmId}/{YYYY-MM}/{timestamp}_{sanitized}
 */
export function buildDocumentKey(firmId: string, originalName: string): string {
  return `incoming-documents/${firmId}/${monthFolder()}/${Date.now()}_${sanitize(originalName)}`;
}

export async function uploadDocumentToR2(params: {
  firmId: string;
  originalName: string;
  mimeType: string;
  body: Buffer;
}): Promise<{ key: string }> {
  const key = buildDocumentKey(params.firmId, params.originalName);
  const command = new PutObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    Body: params.body,
    ContentType: params.mimeType,
    Metadata: {
      firmId: params.firmId,
      source: "document-inbox",
      uploadedAt: new Date().toISOString(),
    },
  });
  await client().send(command);
  return { key };
}

export async function downloadDocumentFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: key });
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

export async function getDocumentGetUrl(key: string, expiresIn = 600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: key });
  return getSignedUrl(client(), command, { expiresIn });
}
