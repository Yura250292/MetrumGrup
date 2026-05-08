export type MeetingStatus =
  | "DRAFT"
  | "UPLOADED"
  | "TRANSCRIBING"
  | "TRANSCRIBED"
  | "SUMMARIZING"
  | "READY"
  | "FAILED";

export type MeetingPriorityLevel = "HIGH" | "MEDIUM" | "LOW";

export type MeetingTask = {
  title: string;
  assignee: string | null;
  dueDate: string | null;
  priority?: MeetingPriorityLevel | null;
  context?: string | null;
  successCriteria?: string | null;
};

export type MeetingPriority = {
  title: string;
  level: MeetingPriorityLevel;
  reason?: string | null;
};

export type MeetingStructured = {
  suggestedTitle?: string;
  summary: string;
  context?: string | null;
  goals?: string[];
  keyPoints: string[];
  decisions: string[];
  priorities?: MeetingPriority[];
  tasks: MeetingTask[];
  risks?: string[];
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
  folderId: string | null;
  createdBy: { id: string; name: string };
  folder?: { id: string; name: string } | null;
};

export type MeetingEntity = {
  entity_type?: string | null;
  text?: string | null;
  start?: number | null;
  end?: number | null;
};

export type MeetingChapter = {
  headline?: string | null;
  summary?: string | null;
  gist?: string | null;
  start?: number | null;
  end?: number | null;
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
  speakerCount: number | null;
  entities: MeetingEntity[] | null;
  chapters: MeetingChapter[] | null;
  transcribeProvider: string | null;
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
