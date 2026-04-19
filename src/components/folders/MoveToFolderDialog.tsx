"use client";

import { useState, useEffect } from "react";
import { X, Folder, FolderInput, ChevronRight, Home } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FolderDomain } from "@prisma/client";

type FolderTreeItem = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  domain: FolderDomain;
  currentFolderId?: string | null;
  loading?: boolean;
  itemCount: number;
};

export function MoveToFolderDialog({
  open,
  onClose,
  onMove,
  domain,
  currentFolderId,
  loading,
  itemCount,
}: Props) {
  const [tree, setTree] = useState<FolderTreeItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingTree(true);
    setSelected(null);
    // Load flat folder list and reconstruct tree client-side
    loadTree(domain).then((t) => {
      setTree(t);
      setLoadingTree(false);
    });
  }, [open, domain]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl max-h-[70vh] flex flex-col"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderInput size={18} style={{ color: T.accentPrimary }} />
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Перемістити ({itemCount})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 mb-4">
          {/* Root option */}
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-left transition"
            style={{
              backgroundColor:
                selected === null ? T.accentPrimarySoft : "transparent",
              color: selected === null ? T.accentPrimary : T.textPrimary,
              border:
                selected === null
                  ? `1px solid ${T.accentPrimary}30`
                  : "1px solid transparent",
            }}
          >
            <Home size={14} />
            Корінь (без папки)
          </button>

          {loadingTree ? (
            <p
              className="text-[12px] text-center py-4"
              style={{ color: T.textMuted }}
            >
              Завантаження...
            </p>
          ) : (
            tree
              .filter((f) => f.id !== currentFolderId)
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-left transition"
                  style={{
                    paddingLeft: `${12 + f.depth * 20}px`,
                    backgroundColor:
                      selected === f.id ? T.accentPrimarySoft : "transparent",
                    color: selected === f.id ? T.accentPrimary : T.textPrimary,
                    border:
                      selected === f.id
                        ? `1px solid ${T.accentPrimary}30`
                        : "1px solid transparent",
                  }}
                >
                  <Folder size={14} />
                  {f.name}
                </button>
              ))
          )}

          {!loadingTree && tree.length === 0 && (
            <p
              className="text-[12px] text-center py-4"
              style={{ color: T.textMuted }}
            >
              Немає папок. Спочатку створіть папку.
            </p>
          )}
        </div>

        <button
          onClick={() => onMove(selected)}
          disabled={loading}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
          }}
        >
          {loading ? "Переміщення..." : "Перемістити"}
        </button>
      </div>
    </div>
  );
}

async function loadTree(domain: FolderDomain): Promise<FolderTreeItem[]> {
  // Load all folders for this domain, level by level
  const all: { id: string; name: string; parentId: string | null }[] = [];

  async function loadLevel(parentId: string | null) {
    const p = parentId ?? "root";
    const res = await fetch(
      `/api/admin/folders?domain=${domain}&parentId=${p}`,
    );
    if (!res.ok) return;
    const { folders } = await res.json();
    for (const f of folders) {
      all.push({ id: f.id, name: f.name, parentId: f.parentId });
      if (f.childFolderCount > 0) {
        await loadLevel(f.id);
      }
    }
  }

  await loadLevel(null);

  // Build with depths
  const result: FolderTreeItem[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of all.filter((x) => x.parentId === parentId)) {
      result.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}
