"use client";

import Link from "next/link";
import { Folder, MoreHorizontal, Pencil, Trash2, FolderInput } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrency } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import type { FolderItem } from "@/hooks/useFolders";

type Props = {
  folder: FolderItem;
  href: string;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  showFinanceIndicators?: boolean;
};

export function FolderCard({
  folder,
  href,
  onRename,
  onDelete,
  showFinanceIndicators,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== folder.name) {
      onRename?.(folder.id, editName.trim());
    }
    setEditing(false);
  };

  const accentColor = folder.color || T.accentPrimary;
  const totalItems = folder.itemCount + folder.childFolderCount;

  return (
    <div className="relative group">
      <Link
        href={href}
        className="flex flex-col gap-2 rounded-xl p-4 transition hover:brightness-[0.97] active:scale-[0.99]"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
        onClick={(e) => {
          if (editing || menuOpen) e.preventDefault();
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
            style={{ backgroundColor: accentColor + "18", color: accentColor }}
          >
            <Folder size={20} />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setEditName(folder.name);
                    setEditing(false);
                  }
                }}
                className="w-full rounded px-1 py-0.5 text-[14px] font-semibold outline-none"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textPrimary,
                  border: `1px solid ${T.accentPrimary}`,
                }}
                onClick={(e) => e.preventDefault()}
              />
            ) : (
              <span
                className="text-[14px] font-semibold truncate block"
                style={{ color: T.textPrimary }}
              >
                {folder.name}
              </span>
            )}
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              {totalItems} {totalItems === 1 ? "елемент" : "елементів"}
            </span>
          </div>
        </div>

        {showFinanceIndicators && folder.finance && (
          <div className="flex items-center gap-2 mt-1">
            <span
              className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.successSoft, color: T.success }}
            >
              {formatCurrency(folder.finance.income)}
            </span>
            <span
              className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {formatCurrency(folder.finance.expense)}
            </span>
            <span
              className="flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
            >
              {formatCurrency(folder.finance.balance)}
            </span>
          </div>
        )}
      </Link>

      {/* Context menu button */}
      {(onRename || onDelete) && (
        <div className="absolute top-2 right-2" ref={menuRef}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: T.panelElevated, color: T.textMuted }}
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-44 rounded-xl py-1 shadow-xl z-10"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:opacity-80"
                  style={{ color: T.textPrimary }}
                >
                  <Pencil size={14} /> Перейменувати
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(folder.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:opacity-80"
                  style={{ color: T.danger }}
                >
                  <Trash2 size={14} /> Видалити
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
