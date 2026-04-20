import { Context as TelegrafContext } from 'telegraf';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PendingReceipt {
  step: 'awaiting_file' | 'awaiting_amount' | 'awaiting_title' | 'awaiting_confirmation';
  folderId: string | null;
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  amount?: number;
  title?: string;
  counterparty?: string;
  ocrText?: string;
}

// Extend Telegraf Context with our custom state
export interface BotContext extends TelegrafContext {
  session?: {
    isAdmin?: boolean;
    awaitingPassword?: boolean;
    conversationHistory?: ConversationMessage[];
    pendingReceipt?: PendingReceipt;
  };
}
