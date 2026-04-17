import type { ProfileData } from "./types";

const CRITERIA: { key: string; check: (p: ProfileData) => boolean }[] = [
  { key: "firstName", check: (p) => !!p.firstName },
  { key: "lastName", check: (p) => !!p.lastName },
  { key: "avatar", check: (p) => !!p.avatar },
  { key: "jobTitle", check: (p) => !!p.jobTitle },
  { key: "bio", check: (p) => !!p.bio },
  { key: "timezone", check: (p) => !!p.timezone },
  { key: "notifications", check: (p) => !!p.notificationPrefsJson },
];

export function computeCompleteness(profile: ProfileData): number {
  const passed = CRITERIA.filter((c) => c.check(profile)).length;
  return Math.round((passed / CRITERIA.length) * 100);
}
