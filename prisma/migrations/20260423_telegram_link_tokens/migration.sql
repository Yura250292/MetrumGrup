-- CreateTable
CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_link_tokens_token_key" ON "telegram_link_tokens"("token");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_userId_idx" ON "telegram_link_tokens"("userId");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_expiresAt_idx" ON "telegram_link_tokens"("expiresAt");
