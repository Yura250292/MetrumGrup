"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FolderPlus, Lock, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { useFolders } from "@/hooks/useFolders";
import type { FolderItem } from "@/hooks/useFolders";
import { FolderCard } from "./FolderCard";

type Props = {
  folder: FolderItem;
  basePath: string;
  defaultOpen?: boolean;
  onCreateChildFolder: (parentId: string) => void;
  onCreateEntry: (folderId: string) => void;
  onRenameChild: (id: string, name: string) => void;
  onDeleteChild: (id: string) => void;
  /** Extra content rendered inside the expanded body (e.g. template constructor) */
  extraContent?: React.ReactNode;
  /** Override default FolderCard grid for children (e.g. render as nested blocks) */
  renderChildren?: (children: FolderItem[]) => React.ReactNode;
  /** Hide the default action buttons at bottom */
  hideActions?: boolean;
};

const STORAGE_PREFIX = "financing:block-open:";

export function ExpandableBlockCard({
  folder,
  basePath,
  defaultOpen = false,
  onCreateChildFolder,
  onCreateEntry,
  onRenameChild,
  onDeleteChild,
  extraContent,
  renderChildren,
  hideActions,
}: Props) {
  const storageKey = STORAGE_PREFIX + folder.id;
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") setOpen(true);
      else if (stored === "0") setOpen(false);
    } catch {}
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {}
  }, [open, hydrated, storageKey]);

  const { data: children = [], isLoading } = useFolders("FINANCE", folder.id);

  const accentColor = folder.color || T.accentPrimary;
  const fin = folder.finance;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 transition hover:brightness-[0.97]"
        aria-expanded={open}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: accentColor + "18", color: accentColor }}
        >
          <ChevronDown
            size={18}
            style={{
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 160ms ease",
            }}
          />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-start gap-1.5">
            <span
              className={`font-bold leading-tight break-words line-clamp-2 ${
                folder.name.length > 22 ? "text-[13px] sm:text-[14px]" : "text-[14px] sm:text-[15px]"
              }`}
              style={{ color: T.textPrimary }}
            >
              {folder.name}
            </span>
            <Lock
              size={12}
              style={{ color: T.textMuted, flexShrink: 0, marginTop: 3 }}
            />
          </div>
          <span className="text-[10px] sm:text-[11px]" style={{ color: T.textMuted }}>
            {folder.childFolderCount}{" "}
            {folder.childFolderCount === 1 ? "папка" : "папок"} ·{" "}
            {folder.itemCount} {folder.itemCount === 1 ? "запис" : "записів"}
          </span>
        </div>
        {fin && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <span
              className="text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.successSoft, color: T.success }}
            >
              {formatCurrencyCompact(fin.income)}
            </span>
            <span
              className="text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {formatCurrencyCompact(fin.expense)}
            </span>
            <span
              className="text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {formatCurrencyCompact(fin.balance)}
            </span>
          </div>
        )}
      </button>

      {open && (
        <div
          className="flex flex-col gap-3 p-4"
          style={{ borderTop: `1px solid ${T.borderSoft}` }}
        >
          {isLoading ? (
            <div className="text-[12px]" style={{ color: T.textMuted }}>
              Завантаження…
            </div>
          ) : children.length > 0 ? (
            renderChildren ? (
              renderChildren(children)
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {children.map((child) => (
                  <FolderCard
                    key={child.id}
                    folder={child}
                    href={`${basePath}?folderId=${child.id}`}
                    showFinanceIndicators
                    onRename={onRenameChild}
                    onDelete={onDeleteChild}
                  />
                ))}
              </div>
            )
          ) : (
            <div
              className="text-[12px] rounded-xl px-3 py-6 text-center"
              style={{
                color: T.textMuted,
                backgroundColor: T.panelSoft,
                border: `1px dashed ${T.borderSoft}`,
              }}
            >
              У цьому блоку ще немає папок.
            </div>
          )}

          {extraContent}

          {!hideActions && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCreateChildFolder(folder.id)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-[0.97]"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textPrimary,
                border: `1px solid ${T.borderStrong}`,
              }}
            >
              <FolderPlus size={13} /> Додати папку
            </button>
            <button
              onClick={() => onCreateEntry(folder.id)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: T.accentPrimary }}
            >
              <Plus size={13} /> Додати запис
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
