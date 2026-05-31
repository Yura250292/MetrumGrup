import { redirect } from "next/navigation";

/**
 * Legacy preview URL. Канонічна сторінка тепер /admin-v2/projects/[id]
 * (вона рендерить ProjectDetailCanonicalBody з тим самим v2-дизайном).
 *
 * Тримаємо цей route як redirect, щоб старі закладки/посилання не ламались.
 */
export default async function LegacyV2Redirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin-v2/projects/${id}`);
}
