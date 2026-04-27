"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FolderPlus, Lock, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { formatCurrencyCompact } from "@/lib/utils";
import { useFolders } from "@/hooks/useFolders";
import type { FolderItem } from "@/hooks/useFolders";
import { FolderCard } from "./FolderCard";
import { motion, AnimatePresence } from "framer-motion";

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
              transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
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

      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="body"
          initial={{
            opacity: 0,
            height: 0,
            y: -12,
            filter: "blur(8px)",
          }}
          animate={{
            opacity: 1,
            height: "auto",
            y: 0,
            filter: "blur(0px)",
          }}
          exit={{
            opacity: 0,
            height: 0,
            y: -8,
            filter: "blur(6px)",
          }}
          transition={{
            height: { type: "spring", stiffness: 180, damping: 28, mass: 0.95 },
            opacity: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
            y: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
            filter: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
          }}
          style={{
            overflow: "hidden",
            borderTop: `1px solid ${T.borderSoft}`,
          }}
        >
        <div className="flex flex-col gap-3 p-4">
          {isLoading ? (
            <div className="text-[12px]" style={{ color: T.textMuted }}>
              Завантаження…
            </div>
          ) : children.length > 0 ? (
            renderChildren ? (
              renderChildren(children)
            ) : (
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: 0.06,
                      delayChildren: 0.18,
                    },
                  },
                }}
              >
                {children.map((child) => (
                  <motion.div
                    key={child.id}
                    layout
                    variants={{
                      hidden: {
                        opacity: 0,
                        y: 24,
                        scale: 0.88,
                        filter: "blur(6px)",
                      },
                      visible: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          type: "spring",
                          stiffness: 200,
                          damping: 24,
                          mass: 0.9,
                        },
                      },
                    }}
                    whileHover={{
                      y: -3,
                      scale: 1.018,
                      transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                    }}
                  >
                    <FolderCard
                      folder={child}
                      href={`${basePath}?folderId=${child.id}`}
                      showFinanceIndicators
                      onRename={onRenameChild}
                      onDelete={onDeleteChild}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="text-[12px] rounded-xl px-3 py-6 text-center"
              style={{
                color: T.textMuted,
                backgroundColor: T.panelSoft,
                border: `1px dashed ${T.borderSoft}`,
              }}
            >
              У цьому блоку ще немає папок.
            </motion.div>
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
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
