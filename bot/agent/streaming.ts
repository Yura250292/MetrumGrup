import type { BotContext } from '../types';
import { STREAM_EDIT_INTERVAL_MS } from './models';

const TELEGRAM_TEXT_LIMIT = 4000;

export class StreamingEditor {
  private lastEditAt = 0;
  private lastText = '';
  private pendingTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: BotContext,
    private readonly messageId: number,
  ) {}

  async push(text: string): Promise<void> {
    const trimmed =
      text.length > TELEGRAM_TEXT_LIMIT
        ? text.slice(0, TELEGRAM_TEXT_LIMIT - 20) + '…'
        : text;
    if (trimmed === this.lastText) return;

    const now = Date.now();
    const elapsed = now - this.lastEditAt;

    if (elapsed >= STREAM_EDIT_INTERVAL_MS) {
      await this.flushNow(trimmed);
      return;
    }

    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    const wait = STREAM_EDIT_INTERVAL_MS - elapsed;
    this.pendingTimer = setTimeout(() => {
      void this.flushNow(trimmed);
    }, wait);
  }

  async finalize(text: string): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    await this.flushNow(text);
  }

  private async flushNow(text: string): Promise<void> {
    if (text === this.lastText) return;
    // Спершу пробуємо як HTML (AI генерує <b>/<i>/<a> через промпт).
    // Якщо chunk містить незакритий тег (часто на середині стріму) —
    // Telegram повертає "can't parse entities"; тоді шлемо як plain text,
    // щоб юзер бачив прогрес. На finalize() AI закриває всі теги.
    try {
      await this.ctx.telegram.editMessageText(
        this.ctx.chat!.id,
        this.messageId,
        undefined,
        text || '…',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
      this.lastText = text;
      this.lastEditAt = Date.now();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('message is not modified')) return;
      if (!msg.includes("can't parse entities")) {
        console.error('Streaming edit (HTML) failed:', msg);
      }
    }
    // Fallback: plain text без розмітки.
    try {
      await this.ctx.telegram.editMessageText(
        this.ctx.chat!.id,
        this.messageId,
        undefined,
        text || '…',
      );
      this.lastText = text;
      this.lastEditAt = Date.now();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('message is not modified')) {
        console.error('Streaming edit (plain) failed:', msg);
      }
    }
  }
}
