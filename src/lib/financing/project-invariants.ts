/**
 * Інваріанти, які мають перевірятися перед тим, як FinanceEntry привʼязується
 * до проєкту (на write-path: POST у /api/admin/financing і PATCH projectId
 * у /api/admin/financing/[id]).
 *
 * Дзеркальні до того, що `syncProjectBudgetEntry` і `syncStageAutoFinanceEntries`
 * уже ігнорують test-проєкти на write side, і до того, що мульти-фірмова
 * модель (Phase 4.27) вимагає `firmId` для всіх бойових сутностей.
 *
 * Функція синхронна і не торкається БД — її викликають з handler-ів після
 * того, як проєкт уже вичитано.
 */
export type ProjectForFinanceCheck = {
  firmId: string | null;
  isTestProject: boolean;
};

export type FinanceProjectInvariantOk = { ok: true; firmId: string };
export type FinanceProjectInvariantFail = {
  ok: false;
  status: number;
  error: string;
};
export type FinanceProjectInvariantResult =
  | FinanceProjectInvariantOk
  | FinanceProjectInvariantFail;

export function validateProjectForFinanceWrite(
  project: ProjectForFinanceCheck | null,
  opts: {
    /** firmId існуючого FinanceEntry — якщо передано, перевіряємо same-firm. */
    existingEntryFirmId?: string | null;
    /** Текст помилки для test-проєкту (різний для create/relink). */
    testProjectError?: string;
  } = {},
): FinanceProjectInvariantResult {
  if (!project) {
    return { ok: false, status: 400, error: "Проєкт не існує" };
  }
  if (project.isTestProject) {
    return {
      ok: false,
      status: 400,
      error:
        opts.testProjectError ??
        "Не можна створювати фінансовий запис для тестового проєкту",
    };
  }
  if (!project.firmId) {
    return {
      ok: false,
      status: 400,
      error:
        "Проєкт без фірми — звʼязати фірму перед створенням фінансового запису",
    };
  }
  if (
    opts.existingEntryFirmId &&
    project.firmId !== opts.existingEntryFirmId
  ) {
    return {
      ok: false,
      status: 400,
      error: "Проєкт належить іншій фірмі",
    };
  }
  return { ok: true, firmId: project.firmId };
}
