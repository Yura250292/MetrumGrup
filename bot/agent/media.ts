import type { BotContext } from '../types';
import { uploadTelegramFileToR2 } from '../services/r2-upload';

/** Uploads a Telegram file (photo/document) to R2 and returns R2 key + mime. */
export async function uploadToR2(
  ctx: BotContext,
  fileId: string,
  options: { fallbackName: string; fallbackMime: string },
): Promise<{ r2Key: string; mimeType: string; name: string; size: number } | null> {
  try {
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const path = fileUrl.pathname;
    const inferredName = path.split('/').pop() || options.fallbackName;
    const userId = ctx.from?.id ?? 'unknown';
    const r2Key = `foreman/tg-${userId}/${Date.now()}-${inferredName}`;
    const result = await uploadTelegramFileToR2(
      fileUrl.href,
      r2Key,
      options.fallbackMime,
    );
    if (!result) return null;
    return {
      r2Key: result.key,
      mimeType: options.fallbackMime,
      name: inferredName,
      size: result.size,
    };
  } catch (err) {
    console.error('[bot-agent/media] uploadToR2 failed:', err);
    return null;
  }
}

export async function transcribeVoiceSafe(
  ctx: BotContext,
  fileId: string,
  duration: number,
): Promise<string | null> {
  try {
    const { processVoiceMessage } = await import('../services/audio');
    const result = await processVoiceMessage(ctx.telegram, fileId, duration);
    return result.success && result.text ? result.text : null;
  } catch (err) {
    console.error('[bot-agent/media] transcribeVoice failed:', err);
    return null;
  }
}
