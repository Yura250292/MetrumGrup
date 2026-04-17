import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * CSS variable overrides applied to wrappers around legacy shadcn-based
 * components (Card, Button, Badge, Input, etc) so they render with v2
 * light theme tokens mapped to CSS custom properties.
 *
 * Usage:
 *   <div className="admin-light" style={DARK_VARS}>
 *     <LegacyComponentThatUsesShadcnCard />
 *   </div>
 */
export const DARK_VARS: React.CSSProperties = {
  "--color-background": T.background,
  "--color-foreground": T.textPrimary,
  "--color-muted": T.panelSoft,
  "--color-muted-foreground": T.textMuted,
  "--color-border": T.borderSoft,
  "--color-card": T.panel,
  "--color-card-foreground": T.textPrimary,
  "--color-primary": T.accentPrimary,
  "--color-primary-foreground": "#FFFFFF",
} as React.CSSProperties;
