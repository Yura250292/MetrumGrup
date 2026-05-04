import { redirect } from "next/navigation";

/**
 * Старий form-editor для етапів видалено: вся функціональність (інлайн-редагування,
 * додавання етапів/груп, drawer з матеріалами/історією/нотатками) тепер живе
 * у `<StagesSection>` на overview-табі проєкту.
 *
 * Цей роут redirect-ить на overview, щоб збережені закладки/посилання продовжували працювати.
 */
export default async function LegacyStagesEditorRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin-v2/projects/${id}?tab=overview`);
}
