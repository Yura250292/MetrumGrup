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
        console.error('Streaming edit failed:', msg);
      }
    }
  }
}
