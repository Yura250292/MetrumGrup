export const BOT_AI_MODEL = process.env.BOT_AI_MODEL ?? 'gemini-3.0-flash';

export const BOT_AI_FALLBACK_CHAIN = [
  BOT_AI_MODEL,
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
];

export const HISTORY_MESSAGE_LIMIT = 20;
export const SESSION_TTL_HOURS = 24;
export const MAX_TOOL_CALLS_PER_TURN = 4;
export const STREAM_EDIT_INTERVAL_MS = 700;
