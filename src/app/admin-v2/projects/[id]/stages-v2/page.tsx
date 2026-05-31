import { redirect } from "next/navigation";

/**
 * Legacy URL — стейджі тепер inline як ?tab=stages у канонічній сторінці.
 * Зберігаємо як redirect, щоб не ламати старі закладки/посилання
 * (напр. з email-notifications, audit-logs).
 */
export default async function StagesV2LegacyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin-v2/projects/${id}?tab=stages`);
}
