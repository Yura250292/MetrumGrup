-- AlterTable
ALTER TABLE "folders" ADD COLUMN "mirroredFromId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "folders_mirroredFromId_key" ON "folders"("mirroredFromId");

-- AddForeignKey
ALTER TABLE "folders"
  ADD CONSTRAINT "folders_mirroredFromId_fkey"
  FOREIGN KEY ("mirroredFromId") REFERENCES "folders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
