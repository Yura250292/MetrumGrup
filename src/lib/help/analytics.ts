import type { HelpAnalyticsEvent, HelpAnalyticsPayload } from "./types";

export function trackHelpEvent(
  _event: HelpAnalyticsEvent,
  _payload?: HelpAnalyticsPayload,
): void {
  // Stub: жодної центральної телеметрії у проєкті немає (станом на 2026-05).
  // Коли з'явиться (PostHog/Plausible/custom) — підмінити цю функцію.
}
