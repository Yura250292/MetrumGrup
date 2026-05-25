// Side-effect import: завантаження цього модуля реєструє усіх job-handler'ів
// у глобальному реєстрі src/lib/jobs/queue.ts. Імпортувати з API-роутів
// перш ніж викликати `enqueue` (in-memory backend вимагає, щоб handler
// був присутній у момент enqueue).

export { documentExtractionJob } from "./document-extraction";
