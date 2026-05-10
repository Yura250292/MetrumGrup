-- Live AI Agent для нарад. Зберігаємо інсайти і cost-лог окремо від
-- основного meeting.structured (фінальний AI-summary post-factum).

CREATE TABLE "live_meeting_insights" (
    "id"                TEXT     PRIMARY KEY,
    "meetingId"         TEXT     NOT NULL,
    "category"          TEXT     NOT NULL,
    "priority"          TEXT     NOT NULL,
    "title"             TEXT     NOT NULL,
    "summary"           TEXT     NOT NULL,
    "suggestedQuestion" TEXT,
    "actionItem"        TEXT,
    "confidence"        DOUBLE PRECISION,
    "isPinned"          BOOLEAN  NOT NULL DEFAULT false,
    "isHidden"          BOOLEAN  NOT NULL DEFAULT false,
    "sourceStartMs"     INTEGER,
    "sourceEndMs"       INTEGER,
    "rawAiResponse"     JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_meeting_insights_meetingId_fkey"
        FOREIGN KEY ("meetingId")
        REFERENCES "meetings"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "live_meeting_insights_meetingId_createdAt_idx"
    ON "live_meeting_insights"("meetingId", "createdAt");

CREATE INDEX "live_meeting_insights_meetingId_isPinned_idx"
    ON "live_meeting_insights"("meetingId", "isPinned");

CREATE TABLE "live_agent_cost_logs" (
    "id"               TEXT     PRIMARY KEY,
    "meetingId"        TEXT     NOT NULL,
    "provider"         TEXT     NOT NULL,
    "model"            TEXT     NOT NULL,
    "inputTokens"      INTEGER,
    "outputTokens"     INTEGER,
    "estimatedCostUsd" DECIMAL(10, 6),
    "latencyMs"        INTEGER,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_agent_cost_logs_meetingId_fkey"
        FOREIGN KEY ("meetingId")
        REFERENCES "meetings"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "live_agent_cost_logs_meetingId_createdAt_idx"
    ON "live_agent_cost_logs"("meetingId", "createdAt");
