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

export type MeetingSpeaker = {
  label: string;
  guessedName: string | null;
  role: string | null;
  evidence: string;
};

export type MeetingProposedSolution = {
  problem: string;
  suggestion: string;
  rationale: string;
  relatedTo: string | null;
};

export type MeetingActionStep = {
  step: number;
  title: string;
  detail: string;
  owner: string | null;
};

export type MeetingGlossaryTerm = {
  term: string;
  definition: string;
  contextInMeeting: string | null;
};

export type MeetingStructured = {
  suggestedTitle?: string;
  summary: string;
  context?: string | null;
  speakers?: MeetingSpeaker[];
  goals?: string[];
  keyPoints: string[];
  decisions: string[];
  priorities?: MeetingPriority[];
  tasks: MeetingTask[];
  risks?: string[];
  proposedSolutions?: MeetingProposedSolution[];
  actionPlan?: MeetingActionStep[];
  nextSteps: string[];
  openQuestions: string[];
  glossary?: MeetingGlossaryTerm[];
};

export type MeetingAttachmentKind =
  | "image"
  | "pdf"
  | "spreadsheet"
  | "document"
  | "other";

export type MeetingAttachment = {
  id: string;
  r2Key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: MeetingAttachmentKind;
  createdAt: string;
};

export type MeetingListItem = {
  id: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  audioUrl: string | null;
  audioDurationMs: number | null;
  noteText: string | null;
  summary: string | null;
  recordedAt: string;
  createdAt: string;
  folderId: string | null;
  createdBy: { id: string; name: string };
  folder?: { id: string; name: string } | null;
  _count?: { attachments: number };
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
  noteRefined: string | null;
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
  attachments: MeetingAttachment[];
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
