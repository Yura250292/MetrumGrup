-- Live AI Agent extensions: pre-meeting briefing cache, live glossary terms,
-- suggested response variants на інсайті.

ALTER TABLE "meetings"
    ADD COLUMN "liveBriefing"             TEXT,
    ADD COLUMN "liveBriefingGeneratedAt"  TIMESTAMP(3);

ALTER TABLE "live_meeting_insights"
    ADD COLUMN "suggestedResponses" JSONB;

CREATE TABLE "live_meeting_terms" (
    "id"               TEXT     PRIMARY KEY,
    "meetingId"        TEXT     NOT NULL,
    "term"             TEXT     NOT NULL,
    "definition"       TEXT     NOT NULL,
    "contextInMeeting" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_meeting_terms_meetingId_fkey"
        FOREIGN KEY ("meetingId")
        REFERENCES "meetings"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "live_meeting_terms_meetingId_term_key"
    ON "live_meeting_terms"("meetingId", "term");

CREATE INDEX "live_meeting_terms_meetingId_createdAt_idx"
    ON "live_meeting_terms"("meetingId", "createdAt");
