/**
 * Палітра картки профілю співробітника — 1:1 із затвердженим макетом
 * (`employee_profile.html`). Scoped саме до картки; решта admin-v2 живе на
 * `T.*`-токенах, тут — строгий дизайн-набір замовника.
 *
 *  Правила: межі 0.5px, значення полів НЕ жирні (400), жирне лише KPI-числа,
 *  без тіней (крім focus-ring), без градієнтів.
 */
export const P = {
  bg: "#ffffff", // основний фон
  bg2: "#f7f8fa", // вторинний фон (нотатки, KPI)
  border: "#e4e7ec", // межі 0.5px
  border2: "#d1d5db", // межі інпутів
  text: "#111827", // основний текст
  text2: "#6b7280", // вторинний текст
  label: "#9ca3af", // мітки полів
  blue: "#185FA5", // акцент / посилання / активний таб
  blueDk: "#0C447C", // hover синьої кнопки / текст аватара
  blueLt: "#E6F1FB", // фон аватара / badge основний
  radius: 8,
  radiusSm: 5,
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

  // Статус-badge
  activeBg: "#EAF3DE",
  activeFg: "#27500A",
  plannedBg: "#E6F1FB",
  plannedFg: "#0C447C",

  // Edit-bar
  editBarBg: "#FFF8EC",
  editBarFg: "#633806",
  editBarBorder: "#FAC775",

  // Danger (звільнити / видалити)
  dangerFg: "#A32D2D",
} as const;

/** Кольори рольових badge у вкладці «Доступ» — у тонах макета. */
export const PROFILE_ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "#EEEDFE", fg: "#3C3489" },
  OWNER: { bg: "#EEEDFE", fg: "#3C3489" },
  MANAGER: { bg: "#EEEDFE", fg: "#3C3489" },
  FINANCIER: { bg: "#E1F5EE", fg: "#085041" },
  HR: { bg: "#E6F1FB", fg: "#0C447C" },
  ENGINEER: { bg: "#E1F5EE", fg: "#085041" },
  FOREMAN: { bg: "#FAEEDA", fg: "#633806" },
  USER: { bg: "#f1f3f5", fg: "#6b7280" },
  CLIENT: { bg: "#f1f3f5", fg: "#6b7280" },
};
