import type { Role } from "@prisma/client";

export type HelpFaqItem = {
  question: string;
  answer: string;
};

export type HelpJob = {
  text: string;
  requiresFinance?: boolean;
};

export type PageHelpIntro = {
  enabled: boolean;
  dismissKey: string;
  version: number;
};

export type PageHelpConfig = {
  route: string;
  title: string;
  summary: string;
  audience?: Role[];
  jobsToBeDone: HelpJob[];
  firstSteps: string[];
  faq?: HelpFaqItem[];
  intro?: PageHelpIntro;
};

export type HelpAnalyticsEvent =
  | "help_opened"
  | "help_intro_dismissed"
  | "help_faq_opened";

export type HelpAnalyticsPayload = {
  route?: string;
  role?: Role | string | null;
};
