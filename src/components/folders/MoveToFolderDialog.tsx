"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Folder, FolderInput, Home } from "lucide-react";
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
  /** When moving a folder, exclude itself + all descendants to prevent cycles. */
  excludeSubtreeOf?: string;
  title?: string;
};

export function MoveToFolderDialog({
  open,
  onClose,
  onMove,
  domain,
  currentFolderId,
  loading,
  itemCount,
  excludeSubtreeOf,
  title,
}: Props) {
  const [tree, setTree] = useState<FolderTreeItem[]>([]);
  const [selected, setSelected] = useState<string | null>("__root__");
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingTree(true);
    setSelected("__root__");
    // Single API call for all folders
    fetch(`/api/admin/folders/tree?domain=${domain}`)
      .then((r) => r.ok ? r.json() : { folders: [] })
      .then(({ folders }) => {
        setTree(buildTree(folders));
        setLoadingTree(false);
      })
      .catch(() => setLoadingTree(false));
  }, [open, domain]);

  if (!open || typeof document === "undefined") return null;

  const handleMove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetId = selected === "__root__" ? null : selected;
    onMove(targetId);
  };

  const dialog = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", zIndex: 10000 }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl max-h-[70vh] flex flex-col"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderInput size={18} style={{ color: T.accentPrimary }} />
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              {title ?? `Перемістити (${itemCount})`}
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: T.textMuted, backgroundColor: T.panelElevated }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 mb-4">
          {/* Root option */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected("__root__");
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-left transition"
            style={{
              backgroundColor:
                selected === "__root__" ? T.accentPrimarySoft : "transparent",
              color: selected === "__root__" ? T.accentPrimary : T.textPrimary,
              border:
                selected === "__root__"
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
            (() => {
              const excluded = excludeSubtreeOf
                ? collectSubtreeIds(tree, excludeSubtreeOf)
                : new Set<string>();
              return tree
                .filter((f) => f.id !== currentFolderId && !excluded.has(f.id));
            })()
              .map((f) => (
                <button
                  key={f.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelected(f.id);
                  }}
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
          onClick={handleMove}
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

  // Portal to body to escape any parent <Link> or scroll context
  return createPortal(dialog, document.body);
}

function buildTree(
  flat: { id: string; name: string; parentId: string | null }[],
): FolderTreeItem[] {
  const result: FolderTreeItem[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of flat.filter((x) => x.parentId === parentId)) {
      result.push({ id: f.id, name: f.name, parentId: f.parentId, depth });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

function collectSubtreeIds(tree: FolderTreeItem[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of tree) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        added = true;
      }
    }
  }
  return out;
}
