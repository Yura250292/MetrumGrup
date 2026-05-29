/**
 * Canonical /admin-v2/tasks route. Re-exports the v2 implementation
 * so a single canonical URL can be used in nav + bookmarks without
 * duplicating the page. The /tasks-v2 alias stays valid for backwards
 * compatibility with links shared during the preview phase.
 */
export { default, dynamic } from "../tasks-v2/page";
