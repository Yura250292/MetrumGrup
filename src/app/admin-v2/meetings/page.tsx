"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Mic,
  Plus,
  Loader2,
  AlertCircle,
  FolderOpen,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Home,
  Trash2,
  FolderInput,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MoveToFolderDialog } from "@/components/folders/MoveToFolderDialog";
import {
  formatDuration,
  STATUS_LABELS,
  type MeetingListItem,
} from "./_components/types";

type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  itemCount: number;
  childFolderCount: number;
  children: FolderNode[];
};

type FlatFolder = {
  id: string;
  name: string;
  parentId: string | null;
  itemCount: number;
  childFolderCount: number;
};

export default function MeetingsListPage() {
  const [folders, setFolders] = useState<FlatFolder[]>([]);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveTarget, setMoveTarget] = useState<MeetingListItem | null>(null);
  const [moving, setMoving] = useState(false);

  async function refreshFolders() {
    setLoadingFolders(true);
    try {
      const res = await fetch("/api/admin/folders/tree?domain=MEETING");
      if (!res.ok) throw new Error("Не вдалося завантажити папки");
      const data = await res.json();
      // tree endpoint returns minimal fields; fetch counts via list endpoint per parent isn't ideal
      // Instead re-fetch root listing for itemCount of root folders, then we'll load children counts lazily
      const flat: FlatFolder[] = (data.folders ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        itemCount: 0,
        childFolderCount: 0,
      }));
      setFolders(flat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoadingFolders(false);
    }
  }

  async function refreshMeetings(folderId: string | null) {
    setLoadingMeetings(true);
    try {
      const folderParam = folderId ?? "root";
      const res = await fetch(
        `/api/admin/meetings?folderId=${encodeURIComponent(folderParam)}`,
      );
      if (!res.ok) throw new Error("Не вдалося завантажити наради");
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoadingMeetings(false);
    }
  }

  useEffect(() => {
    refreshFolders();
  }, []);

  useEffect(() => {
    refreshMeetings(currentFolderId);
  }, [currentFolderId]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(folders, currentFolderId),
    [folders, currentFolderId],
  );

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MEETING",
          name,
          parentId: currentFolderId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося створити папку");
      }
      setNewFolderName("");
      setCreatingFolder(false);
      if (currentFolderId) {
        setExpanded((p) => ({ ...p, [currentFolderId]: true }));
      }
      await refreshFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function renameFolder(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося перейменувати");
      }
      setRenamingId(null);
      setRenameValue("");
      await refreshFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function deleteFolder(id: string) {
    if (
      !confirm(
        "Видалити папку? Наради всередині залишаться, але втратять прив'язку до папки.",
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/folders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося видалити папку");
      }
      if (currentFolderId === id) setCurrentFolderId(null);
      await Promise.all([refreshFolders(), refreshMeetings(currentFolderId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    }
  }

  async function moveMeeting(targetFolderId: string | null) {
    if (!moveTarget) return;
    setMoving(true);
    try {
      const res = await fetch("/api/admin/folders/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MEETING",
          itemIds: [moveTarget.id],
          targetFolderId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалося перемістити нараду");
      }
      setMoveTarget(null);
      await refreshMeetings(currentFolderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="flex items-center gap-2 text-2xl font-bold"
            style={{ color: T.textPrimary }}
          >
            <Mic size={24} style={{ color: T.accentPrimary }} />
            Наради
          </h1>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            Запис, транскрипція та AI-підсумки ділових зустрічей
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{
              background: T.panelElevated,
              color: T.textPrimary,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <FolderPlus size={16} /> Папка
          </button>
          <Link
            href={`/admin-v2/meetings/new${currentFolderId ? `?folderId=${currentFolderId}` : ""}`}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: T.accentPrimary }}
          >
            <Plus size={16} /> Нова нарада
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Sidebar — folder tree */}
        <aside
          className="rounded-xl p-3"
          style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <button
            onClick={() => setCurrentFolderId(null)}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition"
            style={{
              background:
                currentFolderId === null ? T.accentPrimarySoft : "transparent",
              color:
                currentFolderId === null ? T.accentPrimary : T.textPrimary,
            }}
          >
            <Home size={14} /> Усі наради
          </button>

          {loadingFolders ? (
            <div className="flex justify-center py-4">
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: T.textMuted }}
              />
            </div>
          ) : tree.length === 0 ? (
            <p
              className="px-2 py-2 text-xs"
              style={{ color: T.textMuted }}
            >
              Поки що немає папок
            </p>
          ) : (
            <FolderTree
              nodes={tree}
              currentFolderId={currentFolderId}
              expanded={expanded}
              setExpanded={setExpanded}
              onSelect={setCurrentFolderId}
              onRename={(id, name) => {
                setRenamingId(id);
                setRenameValue(name);
              }}
              onDelete={deleteFolder}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={renameFolder}
              cancelRename={() => {
                setRenamingId(null);
                setRenameValue("");
              }}
            />
          )}

          {creatingFolder && (
            <div
              className="mt-2 flex items-center gap-1 rounded-lg p-1"
              style={{ background: T.panelElevated }}
            >
              <Folder size={14} style={{ color: T.textMuted }} />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="Назва папки…"
                className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                style={{ color: T.textPrimary }}
              />
              <button
                onClick={createFolder}
                className="rounded p-1"
                style={{ color: T.success }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }}
                className="rounded p-1"
                style={{ color: T.textMuted }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </aside>

        {/* Main — breadcrumbs + meetings list */}
        <section className="min-w-0">
          {breadcrumbs.length > 0 && (
            <div
              className="mb-3 flex flex-wrap items-center gap-1 text-xs"
              style={{ color: T.textMuted }}
            >
              <button
                onClick={() => setCurrentFolderId(null)}
                className="hover:underline"
              >
                Усі наради
              </button>
              {breadcrumbs.map((b) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight size={12} />
                  <button
                    onClick={() => setCurrentFolderId(b.id)}
                    className="hover:underline"
                    style={{
                      color:
                        b.id === currentFolderId
                          ? T.textPrimary
                          : T.textMuted,
                      fontWeight: b.id === currentFolderId ? 600 : 400,
                    }}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <div
              className="mb-3 flex items-center gap-2 rounded-xl p-3 text-sm"
              style={{ background: T.dangerSoft, color: T.danger }}
            >
              <AlertCircle size={16} />
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto"
                style={{ color: T.danger }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {loadingMeetings ? (
            <div
              className="flex items-center justify-center rounded-xl p-12"
              style={{
                background: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <Loader2
                size={24}
                className="animate-spin"
                style={{ color: T.textMuted }}
              />
            </div>
          ) : meetings.length === 0 ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{
                background: T.panel,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <Mic
                size={40}
                className="mx-auto mb-3"
                style={{ color: T.textMuted }}
              />
              <p
                className="text-sm font-medium"
                style={{ color: T.textPrimary }}
              >
                {currentFolderId
                  ? "У цій папці ще немає нарад"
                  : "Ще немає жодної наради"}
              </p>
              <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
                Натисніть «Нова нарада», щоб записати
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {meetings.map((m, idx) => (
                <div
                  key={m.id}
                  className={`group premium-card flex items-center gap-4 rounded-xl p-4 transition hover:brightness-[0.98] ${idx < 20 ? "data-table-row-enter" : ""}`}
                  style={{
                    background: T.panel,
                    border: `1px solid ${T.borderSoft}`,
                    ...(idx < 20 ? { animationDelay: `${idx * 50}ms` } : {}),
                  }}
                >
                  <Link
                    href={`/admin-v2/meetings/${m.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: T.accentPrimarySoft,
                        color: T.accentPrimary,
                      }}
                    >
                      <Mic size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: T.textPrimary }}
                      >
                        {m.title}
                      </p>
                      <div
                        className="mt-0.5 flex flex-wrap items-center gap-3 text-xs"
                        style={{ color: T.textMuted }}
                      >
                        <span className="flex items-center gap-1">
                          <FolderOpen size={12} /> {m.project.title}
                        </span>
                        <span>
                          {new Date(m.recordedAt).toLocaleString("uk-UA")}
                        </span>
                        {m.audioDurationMs ? (
                          <span>{formatDuration(m.audioDurationMs)}</span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background:
                          m.status === "READY"
                            ? T.successSoft
                            : m.status === "FAILED"
                              ? T.dangerSoft
                              : T.panelElevated,
                        color:
                          m.status === "READY"
                            ? T.success
                            : m.status === "FAILED"
                              ? T.danger
                              : T.textSecondary,
                      }}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setMoveTarget(m);
                    }}
                    title="Перемістити в папку"
                    className="flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition group-hover:opacity-100"
                    style={{
                      background: T.panelElevated,
                      color: T.textSecondary,
                    }}
                  >
                    <FolderInput size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <MoveToFolderDialog
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        onMove={moveMeeting}
        domain="MEETING"
        currentFolderId={currentFolderId}
        loading={moving}
        itemCount={1}
      />
    </div>
  );
}

function buildTree(flat: FlatFolder[]): FolderNode[] {
  const byParent = new Map<string | null, FlatFolder[]>();
  for (const f of flat) {
    const arr = byParent.get(f.parentId) ?? [];
    arr.push(f);
    byParent.set(f.parentId, arr);
  }
  function build(parentId: string | null): FolderNode[] {
    return (byParent.get(parentId) ?? []).map((f) => ({
      ...f,
      children: build(f.id),
    }));
  }
  return build(null);
}

function buildBreadcrumbs(
  flat: FlatFolder[],
  folderId: string | null,
): { id: string; name: string }[] {
  if (!folderId) return [];
  const byId = new Map(flat.map((f) => [f.id, f]));
  const out: { id: string; name: string }[] = [];
  let cur: string | null = folderId;
  let guard = 0;
  while (cur && guard++ < 50) {
    const f = byId.get(cur);
    if (!f) break;
    out.unshift({ id: f.id, name: f.name });
    cur = f.parentId;
  }
  return out;
}

type TreeProps = {
  nodes: FolderNode[];
  currentFolderId: string | null;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSelect: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: (id: string) => void;
  cancelRename: () => void;
  depth?: number;
};

function FolderTree({
  nodes,
  currentFolderId,
  expanded,
  setExpanded,
  onSelect,
  onRename,
  onDelete,
  renamingId,
  renameValue,
  setRenameValue,
  commitRename,
  cancelRename,
  depth = 0,
}: TreeProps) {
  return (
    <div className="flex flex-col">
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0;
        const isOpen = expanded[n.id] ?? false;
        const selected = n.id === currentFolderId;
        const renaming = renamingId === n.id;
        return (
          <div key={n.id}>
            <div
              className="group flex items-center gap-1 rounded-lg pr-1 transition"
              style={{
                background: selected ? T.accentPrimarySoft : "transparent",
              }}
            >
              <button
                onClick={() =>
                  hasChildren &&
                  setExpanded((p) => ({ ...p, [n.id]: !isOpen }))
                }
                className="flex h-6 w-6 items-center justify-center"
                style={{
                  color: T.textMuted,
                  visibility: hasChildren ? "visible" : "hidden",
                  marginLeft: depth * 12,
                }}
              >
                {isOpen ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>
              {renaming ? (
                <div className="flex flex-1 items-center gap-1">
                  <Folder size={14} style={{ color: T.textMuted }} />
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(n.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                    style={{ color: T.textPrimary }}
                  />
                  <button
                    onClick={() => commitRename(n.id)}
                    className="rounded p-1"
                    style={{ color: T.success }}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={cancelRename}
                    className="rounded p-1"
                    style={{ color: T.textMuted }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelect(n.id)}
                    className="flex flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
                    style={{
                      color: selected ? T.accentPrimary : T.textPrimary,
                    }}
                  >
                    <Folder size={14} />
                    <span className="truncate">{n.name}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(n.id, n.name);
                    }}
                    title="Перейменувати"
                    className="rounded p-1 opacity-0 transition group-hover:opacity-100"
                    style={{ color: T.textMuted }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(n.id);
                    }}
                    title="Видалити"
                    className="rounded p-1 opacity-0 transition group-hover:opacity-100"
                    style={{ color: T.danger }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
            {isOpen && hasChildren && (
              <FolderTree
                nodes={n.children}
                currentFolderId={currentFolderId}
                expanded={expanded}
                setExpanded={setExpanded}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                renamingId={renamingId}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                commitRename={commitRename}
                cancelRename={cancelRename}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
