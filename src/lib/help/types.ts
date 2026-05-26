import type { Role } from "@prisma/client";

export type HelpFaqItem = {
  question: string;
  answer: string;
};

export type HelpTourStep = {
  selector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
};

export type HelpTour = {
  id: string;
  title: string;
  description: string;
  version: number;
  steps: HelpTourStep[];
};

export type HelpJob = {
  text: string;
  requiresFinance?: boolean;
};

export type HelpAction = {
  label: string;
  href?: string;
  action?: "start-tour" | "open-modal";
  tourId?: string;
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
  actions?: HelpAction[];
  tours?: HelpTour[];
  intro?: PageHelpIntro;
};

export type HelpAnalyticsEvent =
  | "help_opened"
  | "help_intro_dismissed"
  | "help_tour_started"
  | "help_tour_completed"
  | "help_faq_opened"
  | "help_action_clicked";

export type HelpAnalyticsPayload = {
  route?: string;
  tourId?: string;
  role?: Role | string | null;
};
