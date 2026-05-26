import type { Role } from "@prisma/client";
import { matchRoute } from "./matchRoute";
import type { PageHelpConfig, HelpJob, HelpFaqItem } from "./types";

// Inlined to avoid pulling auth-utils' next-auth/prisma deps into Jest.
// Mirrors canViewFinance() — see src/lib/auth-utils.ts.
function canSeeFinance(role: Role | string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

export type ResolvedPageHelp = Omit<PageHelpConfig, "jobsToBeDone" | "faq"> & {
  jobsToBeDone: HelpJob[];
  faq: HelpFaqItem[];
  isFallback: boolean;
};

export const GENERIC_FALLBACK: PageHelpConfig = {
  route: "*",
  title: "Допомога",
  summary: "Контекстна допомога для цієї сторінки готується.",
  jobsToBeDone: [],
  firstSteps: [],
  faq: [],
};

/**
 * Resolves the help config to render for a pathname + active role.
 * - Returns null if user role is not in audience (registry intentionally hides this page).
 * - Returns fallback if no registry entry matches at all.
 * - Filters out finance-only jobs/FAQ for non-finance roles.
 */
export function selectPageHelp(
  pathname: string,
  role: Role | string | null | undefined,
  registry: Record<string, PageHelpConfig>,
): ResolvedPageHelp | null {
  const matched = matchRoute(pathname, registry);
  if (!matched) {
    return { ...GENERIC_FALLBACK, faq: [], isFallback: true };
  }

  if (matched.audience && matched.audience.length > 0) {
    if (!role || !matched.audience.includes(role as Role)) return null;
  }

  const canFinance = canSeeFinance(role);
  const jobs = matched.jobsToBeDone.filter((j) => !j.requiresFinance || canFinance);
  const faq = (matched.faq ?? []).filter(() => true);

  return {
    ...matched,
    jobsToBeDone: jobs,
    faq,
    isFallback: false,
  };
}
