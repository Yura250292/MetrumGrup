import { lazy, type ComponentType } from "react";
import type { RendererProps } from "./types";

export type RegistryEntry = {
  /** Lazy-loaded renderer. Module-level static — щоб задовольнити
   *  react-hooks/static-components (не створюємо компонент під час render). */
  Renderer: ComponentType<RendererProps>;
  /** Якщо є повна сторінка — Header покаже "↗ Open as page". */
  pageHref?: (id: string) => string;
  /** Fallback для breadcrumb (поки renderer не повідомив свій title). */
  defaultBreadcrumb: string;
};

const TaskDrawerContentLazy = lazy(() =>
  import("./renderers/TaskDrawerContent").then((m) => ({
    default: m.TaskDrawerContent,
  })),
);

const ProjectDrawerContentLazy = lazy(() =>
  import("./renderers/ProjectDrawerContent").then((m) => ({
    default: m.ProjectDrawerContent,
  })),
);

const UserDrawerContentLazy = lazy(() =>
  import("./renderers/UserDrawerContent").then((m) => ({
    default: m.UserDrawerContent,
  })),
);

const IncomingDocumentDrawerContentLazy = lazy(() =>
  import("./renderers/IncomingDocumentDrawerContent").then((m) => ({
    default: m.IncomingDocumentDrawerContent,
  })),
);

export const DRAWER_REGISTRY: Record<string, RegistryEntry> = {
  task: {
    Renderer: TaskDrawerContentLazy,
    defaultBreadcrumb: "Задача",
  },
  project: {
    Renderer: ProjectDrawerContentLazy,
    pageHref: (id) => `/admin-v2/projects/${id}`,
    defaultBreadcrumb: "Проєкт",
  },
  user: {
    Renderer: UserDrawerContentLazy,
    pageHref: (id) => `/admin-v2/team/${id}`,
    defaultBreadcrumb: "Користувач",
  },
  incomingDocument: {
    Renderer: IncomingDocumentDrawerContentLazy,
    pageHref: (id) => `/admin-v2/documents/${id}`,
    defaultBreadcrumb: "Документ",
  },
  // Інші модулі (counterparty, costCode, changeOrder, equipment, rfi,
  // incident, ...) — додаються у task-ах 01-15 з roadmap-2026.
};

export function getRegistryEntry(type: string): RegistryEntry | undefined {
  return DRAWER_REGISTRY[type];
}
