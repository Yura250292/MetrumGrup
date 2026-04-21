export type MeetingStatus =
  | "DRAFT"
  | "UPLOADED"
  | "TRANSCRIBING"
  | "TRANSCRIBED"
  | "SUMMARIZING"
  | "READY"
  | "FAILED";

export type MeetingTask = {
  title: string;
  assignee: string | null;
  dueDate: string | null;
};

export type MeetingStructured = {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  tasks: MeetingTask[];
  nextSteps: string[];
  openQuestions: string[];
};

export type MeetingListItem = {
  id: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  audioUrl: string | null;
  audioDurationMs: number | null;
  summary: string | null;
  recordedAt: string;
  createdAt: string;
  project: { id: string; title: string; slug: string };
  createdBy: { id: string; name: string };
};

export type Meeting = MeetingListItem & {
  transcript: string | null;
  structured: MeetingStructured | null;
  audioR2Key: string | null;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  aiModelUsed: string | null;
  aiTokensUsed: number | null;
  processingError: string | null;
};

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  DRAFT: "Чернетка",
  UPLOADED: "Аудіо завантажено",
  TRANSCRIBING: "Розпізнаємо мовлення…",
  TRANSCRIBED: "Транскрипт готовий",
  SUMMARIZING: "Формуємо підсумок…",
  READY: "Готово",
  FAILED: "Помилка",
};

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
