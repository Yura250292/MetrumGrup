// Design tokens — CSS custom properties for theme-aware surfaces/text,
// hex values for accent colors (which need alpha concatenation like color+"22").
export const T = {
  // Surfaces — switch via CSS vars
  background:      "var(--t-bg)",
  panel:           "var(--t-panel)",
  panelElevated:   "var(--t-panel-el)",
  panelSoft:       "var(--t-panel-soft)",

  // Borders — switch via CSS vars
  borderSoft:      "var(--t-border)",
  borderStrong:    "var(--t-border-strong)",

  // Text — switch via CSS vars
  textPrimary:     "var(--t-text-1)",
  textSecondary:   "var(--t-text-2)",
  textMuted:       "var(--t-text-3)",

  // Soft backgrounds — switch via CSS vars
  accentPrimarySoft:   "var(--t-accent-soft)",
  accentSecondarySoft: "var(--t-accent2-soft)",
  successSoft:         "var(--t-success-soft)",
  warningSoft:         "var(--t-warning-soft)",
  dangerSoft:          "var(--t-danger-soft)",
  tealSoft:            "var(--t-teal-soft)",
  indigoSoft:          "var(--t-indigo-soft)",
  amberSoft:           "var(--t-amber-soft)",
  roseSoft:            "var(--t-rose-soft)",
  skySoft:             "var(--t-sky-soft)",
  emeraldSoft:         "var(--t-emerald-soft)",
  violetSoft:          "var(--t-violet-soft)",

  // Accent colors — hex values (used in alpha concat: color+"22")
  borderAccent:    "#3B5BFF",
  accentPrimary:   "#3B5BFF",
  accentSecondary: "#7C5CFF",
  success:         "#16A34A",
  warning:         "#EA580C",
  danger:          "#DC2626",
  teal:            "#0D9488",
  indigo:          "#4F46E5",
  amber:           "#D97706",
  rose:            "#E11D48",
  sky:             "#0284C7",
  emerald:         "#059669",
  violet:          "#7C3AED",
} as const;
