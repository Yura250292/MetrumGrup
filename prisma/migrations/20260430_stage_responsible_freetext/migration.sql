-- Free-text відповідальний у стейджах. responsibleUserId (FK на User)
-- лишається для існуючих залежностей; додаємо responsibleName, куди
-- падає imʼя як рядок, коли «відповідальний» не зареєстрований у системі
-- (підрядник, виконроб, прізвище без логіну).
--
-- Логіка: FK має пріоритет → якщо є userId, name з User. Інакше беремо
-- responsibleName. Якщо вписане імʼя збігається з name існуючого юзера —
-- бекенд автоматично проставляє userId і чистить text, щоб уникнути дублів.

ALTER TABLE "project_stage_records" ADD COLUMN "responsibleName" TEXT;
