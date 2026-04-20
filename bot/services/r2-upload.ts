import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '../../src/lib/r2-client';

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'metrum';

/**
 * Download a file from Telegram and upload it to R2
 */
export async function uploadTelegramFileToR2(
  telegramFileUrl: string,
  r2Key: string,
  mimeType: string
): Promise<{ key: string; size: number } | null> {
  try {
    const response = await fetch(telegramFileUrl);
    if (!response.ok) {
      console.error('[r2-upload] Failed to download from Telegram:', response.statusText);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    return { key: r2Key, size: buffer.length };
  } catch (error) {
    console.error('[r2-upload] Error uploading to R2:', error);
    return null;
  }
}
