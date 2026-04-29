-- Stage 1.1 of full firm isolation: scope Counterparty per firm.
-- Existing counterparties belong to Metrum Group (historical default).

ALTER TABLE "counterparties" ADD COLUMN "firmId" TEXT;

UPDATE "counterparties" SET "firmId" = 'metrum-group' WHERE "firmId" IS NULL;

CREATE INDEX "counterparties_firmId_idx" ON "counterparties"("firmId");

ALTER TABLE "counterparties"
  ADD CONSTRAINT "counterparties_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "firms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
