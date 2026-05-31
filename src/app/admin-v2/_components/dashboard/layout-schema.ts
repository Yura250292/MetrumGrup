import { z } from "zod";

export const WIDGET_SIZES = ["1x1", "2x1", "2x2", "3x1", "4x1", "4x2"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_TYPES = [
  // Existing widgets (migrated from WIDGET_DEFS)
  "hero",
  "ai-summary",
  "attention",
  "kpi-business",
  "kpi-tasks",
  "finance-pulse",
  "stages",
  "team",
  "activity",
  "projects-risk",
  "utility",
  "ai-widget",
  // New widgets
  "finance-quick",
  "chats",
  "my-tasks",
  "meetings",
  "pivot-quick",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const widgetInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(WIDGET_TYPES),
  size: z.enum(WIDGET_SIZES),
  order: z.number().int().nonnegative(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type WidgetInstance = z.infer<typeof widgetInstanceSchema>;

const layoutBodySchema = z.object({
  widgets: z.array(widgetInstanceSchema).max(40),
});

export const dashboardLayoutSchema = z.object({
  version: z.literal(1),
  desktop: layoutBodySchema,
  mobile: layoutBodySchema.optional(),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;
