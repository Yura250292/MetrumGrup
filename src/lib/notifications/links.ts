/**
 * Map a Notification's relatedEntity + relatedId to an in-app URL.
 * Used by the bell dropdown and notifications page to deep-link
 * to the source of the change.
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
    case "PhotoReport":
      // PhotoReport relatedId stores the projectId — see notifyProjectMembers
      // callsite in /api/admin/projects/[id]/photos.
      return `/admin/projects/${n.relatedId}`;
    case "Comment":
      return `/admin/projects/${n.relatedId}`;
    case "ProjectFile":
      return `/admin/projects/${n.relatedId}`;
    default:
      return "/dashboard/notifications";
  }
}
