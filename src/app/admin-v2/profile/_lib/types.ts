export type NotificationChannel = "inApp" | "email" | "push";

export type NotificationCategory =
  | "taskAssignment"
  | "taskStatusChange"
  | "taskComment"
  | "mention"
  | "deadlineToday"
  | "overdueTask"
  | "chatMessage"
  | "projectChange"
  | "systemEvent"
  | "financeReview";

export type NotificationPrefs = {
  channels: Record<NotificationChannel, boolean>;
  categories: Record<NotificationCategory, Record<NotificationChannel, boolean>>;
  quietHours?: { enabled: boolean; start: string; end: string };
  weekendQuiet?: boolean;
  mode?: "all" | "important" | "silent";
};

export type WorkPrefs = {
  showTimerPill?: boolean;
  autoOpenActiveTasks?: boolean;
  defaultProjectId?: string;
};

export type ProductivityPrefs = {
  workingDays: number[];
  workStartTime: string;
  workEndTime: string;
  dailyHourNorm: number;
  timerAutoStop: boolean;
  timerLongRunningReminder: boolean;
  timerLongRunningMinutes: number;
  timerConfirmStop: boolean;
  showTimeInMyTasks: boolean;
  remindNoTimeLog: boolean;
  remindEndOfDay: boolean;
};

export type ProfileData = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  jobTitle: string | null;
  role: string;
  timezone: string;
  locale: string;
  dateFormat: string;
  weekStartsOn: number;
  defaultTaskView: string;
  defaultLandingPage: string;
  notificationPrefsJson: NotificationPrefs | null;
  workPrefsJson: WorkPrefs | null;
  productivityPrefsJson: ProductivityPrefs | null;
  teams: { id: string; name: string; departmentName?: string }[];
  projectRoles: { projectId: string; projectTitle: string; role: string }[];
  profileCompleteness: number;
};

export type ProfileSection =
  | "basic"
  | "avatar"
  | "about"
  | "role"
  | "notifications"
  | "quickChat"
  | "workSettings"
  | "productivity"
  | "security";
