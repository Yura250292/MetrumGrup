/**
 * Canonical /admin-v2/tasks route. Re-exports the v2 page component
 * (the heavy implementation) but declares route-segment config
 * (`dynamic`) inline — Next.js only allows static const exports for
 * segment config, never re-exports.
 *
 * The /tasks-v2 alias stays valid for backwards compatibility with
 * links shared during the preview phase.
 */
export { default } from "../tasks-v2/page";
export const dynamic = "force-dynamic";
