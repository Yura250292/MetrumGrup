-- Meetings: збагачені сигнали з AssemblyAI Universal (synergy з GPT-4o).
-- Додаємо опціональні JSON-колонки для діаризації, entities, chapters
-- + лічильник спікерів і прапорець провайдера.

ALTER TABLE "meetings"
    ADD COLUMN "speakerCount"        INTEGER,
    ADD COLUMN "utterances"          JSONB,
    ADD COLUMN "entities"            JSONB,
    ADD COLUMN "chapters"            JSONB,
    ADD COLUMN "transcribeProvider"  TEXT;
