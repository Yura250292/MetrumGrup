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
      // relatedId format: "projectId:taskId".
      // Лінкуємо у "Мої задачі" — задачник, який і так гейтить за canViewTasks
      // у середині drawer'а. Не використовуємо /admin-v2/projects/<id>
      // бо для Personal Inbox це показувало б персональний бакет як справжній
      // проєкт із меню Інвентар/Стадії/Кошториси — а Inbox не проєкт.
      const sep = n.relatedId.indexOf(":");
      const taskId = sep > 0 ? n.relatedId.slice(sep + 1) : n.relatedId;
      return `/admin-v2/me?task=${taskId}`;
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
