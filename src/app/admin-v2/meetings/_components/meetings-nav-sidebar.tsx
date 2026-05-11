"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Folder,
  FolderPlus,
  Home,
  ChevronDown,
  ChevronRight,
  Mic,
  Loader2,
  Plus,
  Check,
  X,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

// ────────────────────────────────────────────────────────────────────────
// Папки нарад — навігаційний сайдбар. Використовується на /new і /[id]
// щоб користувач не втрачав контекст дерева коли записує/переглядає нараду.
// Клік по папці → push до /admin-v2/meetings?folder=<id> (список фільтрується).
// Підтримує створення вкладених папок per-row.
// ────────────────────────────────────────────────────────────────────────

type FlatFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

type Node = FlatFolder & { children: Node[] };

export function MeetingsNavSidebar({
  highlightFolderId,
}: {
  highlightFolderId?: string | null;
}) {
  const router = useRouter();
  const [folders, setFolders] = useState<FlatFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creatingParentId, setCreatingParentId] = useState<
    string | null | "root"
  >(null);
  const [newName, setNewName] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/folders/tree?domain=MEETING");
      if (!res.ok) return;
      const data = await res.json();
      const flat: FlatFolder[] = (data.folders ?? []).map(
        (f: FlatFolder) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
        }),
      );
      setFolders(flat);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Розгортаємо ланцюг батьків для виділеної папки.
  useEffect(() => {
    if (!highlightFolderId) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const toOpen: string[] = [];
    let cur = byId.get(highlightFolderId);
    while (cur?.parentId) {
      toOpen.push(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    if (toOpen.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of toOpen) next[id] = true;
      return next;
    });
  }, [highlightFolderId, folders]);

  const tree = useMemo(() => buildTree(folders), [folders]);

  async function createFolder(parentId: string | null) {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/admin/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "MEETING", name, parentId }),
    });
    if (!res.ok) return;
    setNewName("");
    setCreatingParentId(null);
    if (parentId) setExpanded((p) => ({ ...p, [parentId]: true }));
    await refresh();
  }

  function gotoFolder(folderId: string | null) {
    router.push(
      folderId
        ? `/admin-v2/meetings?folder=${folderId}`
        : "/admin-v2/meetings",
    );
  }

  return (
    <aside
      className="rounded-xl p-3"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
        alignSelf: "start",
        position: "sticky",
        top: 16,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          <Mic size={12} /> Папки нарад
        </span>
        <button
          onClick={() => {
            setCreatingParentId("root");
            setNewName("");
          }}
          title="Додати папку у корінь"
          className="rounded p-1 transition hover:brightness-110"
          style={{
            background: T.panelElevated,
            color: T.textMuted,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <FolderPlus size={12} />
        </button>
      </div>

      <button
        onClick={() => gotoFolder(null)}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition"
        style={{
          background:
            highlightFolderId == null && false
              ? T.accentPrimarySoft
              : "transparent",
          color: T.textPrimary,
        }}
      >
        <Home size={14} /> Усі наради
      </button>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2
            size={14}
            className="animate-spin"
            style={{ color: T.textMuted }}
          />
        </div>
      ) : tree.length === 0 && creatingParentId !== "root" ? (
        <p className="px-2 py-2 text-xs" style={{ color: T.textMuted }}>
          Поки що немає папок
        </p>
      ) : (
        <NavTree
          nodes={tree}
          expanded={expanded}
          setExpanded={setExpanded}
          onGoto={gotoFolder}
          onCreateChild={(parentId) => {
            setCreatingParentId(parentId);
            setNewName("");
          }}
          creatingParentId={creatingParentId}
          newName={newName}
          setNewName={setNewName}
          commit={createFolder}
          cancel={() => {
            setCreatingParentId(null);
            setNewName("");
          }}
          highlightFolderId={highlightFolderId ?? null}
        />
      )}

      {creatingParentId === "root" && (
        <RootCreateInput
          value={newName}
          onChange={setNewName}
          onCommit={() => createFolder(null)}
          onCancel={() => {
            setCreatingParentId(null);
            setNewName("");
          }}
        />
      )}
    </aside>
  );
}

function buildTree(flat: FlatFolder[]): Node[] {
  const map = new Map<string, Node>();
  for (const f of flat) map.set(f.id, { ...f, children: [] });
  const roots: Node[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "uk"));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function NavTree({
  nodes,
  depth = 0,
  expanded,
  setExpanded,
  onGoto,
  onCreateChild,
  creatingParentId,
  newName,
  setNewName,
  commit,
  cancel,
  highlightFolderId,
}: {
  nodes: Node[];
  depth?: number;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onGoto: (id: string | null) => void;
  onCreateChild: (parentId: string) => void;
  creatingParentId: string | null | "root";
  newName: string;
  setNewName: (v: string) => void;
  commit: (parentId: string | null) => void;
  cancel: () => void;
  highlightFolderId: string | null;
}) {
  return (
    <div className="flex flex-col">
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0;
        const isOpen = expanded[n.id] ?? false;
        const isHighlighted = n.id === highlightFolderId;
        const isCreatingHere = creatingParentId === n.id;
        return (
          <div key={n.id}>
            <div
              className="group flex items-center gap-1 rounded-lg pr-1 transition"
              style={{
                background: isHighlighted ? T.accentPrimarySoft : "transparent",
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
              <button
                onClick={() => onGoto(n.id)}
                className="flex flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
                style={{
                  color: isHighlighted ? T.accentPrimary : T.textPrimary,
                }}
              >
                <Folder size={14} />
                <span className="truncate">{n.name}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((p) => ({ ...p, [n.id]: true }));
                  onCreateChild(n.id);
                }}
                title="Додати підпапку"
                className="rounded p-1 opacity-0 transition group-hover:opacity-100"
                style={{ color: T.textMuted }}
              >
                <Plus size={12} />
              </button>
            </div>

            {isCreatingHere && (
              <ChildCreateInput
                indentPx={(depth + 1) * 12 + 24}
                value={newName}
                onChange={setNewName}
                onCommit={() => commit(n.id)}
                onCancel={cancel}
              />
            )}

            {isOpen && hasChildren && (
              <NavTree
                nodes={n.children}
                depth={depth + 1}
                expanded={expanded}
                setExpanded={setExpanded}
                onGoto={onGoto}
                onCreateChild={onCreateChild}
                creatingParentId={creatingParentId}
                newName={newName}
                setNewName={setNewName}
                commit={commit}
                cancel={cancel}
                highlightFolderId={highlightFolderId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RootCreateInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="mt-2 flex items-center gap-1 rounded-lg p-1"
      style={{ background: T.panelElevated }}
    >
      <Folder size={14} style={{ color: T.textMuted }} />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Назва папки"
        className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        style={{ color: T.textPrimary }}
      />
      <button
        onClick={onCommit}
        className="rounded p-1"
        style={{ color: T.success }}
        title="Створити"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onCancel}
        className="rounded p-1"
        style={{ color: T.textMuted }}
        title="Скасувати"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function ChildCreateInput({
  indentPx,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  indentPx: number;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ background: T.panelElevated, marginLeft: indentPx }}
    >
      <Folder size={12} style={{ color: T.textMuted }} />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Назва підпапки"
        className="flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        style={{ color: T.textPrimary }}
      />
      <button
        onClick={onCommit}
        className="rounded p-1"
        style={{ color: T.success }}
        title="Створити"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onCancel}
        className="rounded p-1"
        style={{ color: T.textMuted }}
        title="Скасувати"
      >
        <X size={12} />
      </button>
    </div>
  );
}
