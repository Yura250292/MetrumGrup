-- CreateTable
CREATE TABLE "comment_read_states" (
    "id" TEXT NOT NULL,
    "entityType" "CommentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_read_states_entityType_entityId_userId_key" ON "comment_read_states"("entityType", "entityId", "userId");

-- CreateIndex
CREATE INDEX "comment_read_states_userId_idx" ON "comment_read_states"("userId");

-- AddForeignKey
ALTER TABLE "comment_read_states" ADD CONSTRAINT "comment_read_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
