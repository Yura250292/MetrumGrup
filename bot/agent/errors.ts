export class AgentError extends Error {
  readonly code: string;
  readonly userMessage: string;

  constructor(code: string, userMessage: string, cause?: unknown) {
    super(`${code}: ${userMessage}`);
    this.code = code;
    this.userMessage = userMessage;
    if (cause instanceof Error) this.stack = cause.stack;
  }
}

export class RateLimitError extends AgentError {
  constructor(retryAfterSec: number) {
    super(
      'RATE_LIMIT',
      `⏱ Забагато запитів. Спробуйте через ${retryAfterSec} с.`,
    );
  }
}

export class RbacError extends AgentError {
  constructor(toolName: string) {
    super('RBAC_DENIED', `🚫 У вас немає доступу до дії "${toolName}".`);
  }
}

export class ModelUnavailableError extends AgentError {
  constructor() {
    super(
      'MODEL_UNAVAILABLE',
      '🤖 AI зараз недоступний. Спробуйте /menu або повторіть пізніше.',
    );
  }
}
