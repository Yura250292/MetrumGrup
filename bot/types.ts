import { Context as TelegrafContext } from 'telegraf';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Extend Telegraf Context with our custom state
export interface BotContext extends TelegrafContext {
  session?: {
    isAdmin?: boolean;
    awaitingPassword?: boolean;
    conversationHistory?: ConversationMessage[];
  };
}
