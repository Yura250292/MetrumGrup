/**
 * Map a Notification's relatedEntity + relatedId to an in-app URL.
 * Used by the bell dropdown and notifications page to deep-link
 * to the source of the change.
 *
 * For Task notifications, relatedId stores "projectId:taskId" so we can
 * link directly to the project tasks tab (the drawer opens on click).
 */
export function relatedEntityLink(n: {
  relatedEntity: string | null;
  relatedId: string | null;
}): string {
  if (!n.relatedEntity || !n.relatedId) return "/dashboard/notifications";
  switch (n.relatedEntity) {
    case "Project":
    case "PROJECT":
      return `/admin/projects/${n.relatedId}`;
    case "Estimate":
    case "ESTIMATE":
      return `/admin/estimates/${n.relatedId}`;
    case "Task":
    case "TASK": {
      // relatedId format: "projectId:taskId"
      const sep = n.relatedId.indexOf(":");
      if (sep > 0) {
        const projectId = n.relatedId.slice(0, sep);
        const taskId = n.relatedId.slice(sep + 1);
        return `/admin-v2/projects/${projectId}?tab=tasks&task=${taskId}`;
      }
      return "/dashboard/notifications";
    }
    case "PhotoReport":
      // PhotoReport relatedId stores the projectId — see notifyProjectMembers
      // callsite in /api/admin/projects/[id]/photos.
      return `/admin/projects/${n.relatedId}`;
    case "Comment":
      return `/admin/projects/${n.relatedId}`;
    case "ProjectFile":
      return `/admin/projects/${n.relatedId}`;
    case "FinanceEntry":
      return `/admin-v2/financing?pendingId=${n.relatedId}`;
    case "Conversation":
    case "CONVERSATION":
      return `/admin-v2/chat?conversation=${n.relatedId}`;
    default:
      return "/dashboard/notifications";
  }
}
