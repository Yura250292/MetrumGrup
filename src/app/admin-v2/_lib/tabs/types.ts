export type TabId = string;

export interface Tab {
  id: TabId;
  path: string;
  title: string;
  iconKey?: string;
  pinned?: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: TabId | null;
}

export const TAB_CAP = 12;
export const STORAGE_VERSION = 1;
export const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
