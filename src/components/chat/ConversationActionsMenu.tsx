"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  MoreVertical,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  useArchiveConversation,
  useConversation,
  useDeleteConversation,
  type ChatConversation,
} from "@/hooks/useChat";
import { ManageParticipantsDialog } from "./ManageParticipantsDialog";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type ConversationLite = Pick<ChatConversation, "id" | "type" | "isArchived">;

export function ConversationActionsMenu({
  conversation,
}: {
  conversation: ConversationLite;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const archive = useArchiveConversation();
  const remove = useDeleteConversation();
  const { data: full } = useConversation(conversation.id);

  const [open, setOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantsMode, setParticipantsMode] = useState<"add" | "remove">("add");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isGroup = conversation.type === "GROUP";
  const canManageParticipants = isGroup;
  const archived = Boolean(conversation.isArchived);
  const busy = archive.isPending || remove.isPending;

  const handleArchive = () => {
    setOpen(false);
    archive.mutate(
      { conversationId: conversation.id, archived: !archived },
      {
        onError: (err) =>
          alert(err instanceof Error ? err.message : "Не вдалось"),
      },
    );
  };

  const handleDelete = () => {
    setOpen(false);
    if (
      !confirm(
        "Видалити цю розмову назавжди разом з усіма повідомленнями? Цю дію неможливо скасувати.",
      )
    ) {
      return;
    }
    remove.mutate(conversation.id, {
      onSuccess: () => router.push("/admin-v2/chat"),
      onError: (err) =>
        alert(err instanceof Error ? err.message : "Не вдалось видалити"),
    });
  };

  const openParticipants = (mode: "add" | "remove") => {
    setOpen(false);
    setParticipantsMode(mode);
    setParticipantsOpen(true);
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Дії"
        aria-label="Дії з розмовою"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center rounded-lg p-1.5 transition active:scale-95 disabled:opacity-60"
        style={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreVertical className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-lg shadow-lg z-30"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {canManageParticipants && (
            <>
              <MenuItem
                icon={<UserPlus className="h-4 w-4" />}
                label="Додати учасника"
                onClick={() => openParticipants("add")}
              />
              <MenuItem
                icon={<UserMinus className="h-4 w-4" />}
                label="Видалити учасника"
                onClick={() => openParticipants("remove")}
                disabled={(full?.participants.length ?? 0) <= 1}
              />
              <Divider />
            </>
          )}
          <MenuItem
            icon={
              archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )
            }
            label={archived ? "Розархівувати" : "Архівувати (сховати)"}
            onClick={handleArchive}
          />
          {isSuperAdmin && (
            <>
              <Divider />
              <MenuItem
                icon={<Trash2 className="h-4 w-4" />}
                label="Видалити розмову"
                onClick={handleDelete}
                danger
              />
            </>
          )}
        </div>
      )}
      {canManageParticipants && (
        <ManageParticipantsDialog
          conversationId={conversation.id}
          open={participantsOpen}
          initialMode={participantsMode}
          onOpenChange={setParticipantsOpen}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition disabled:opacity-50 hover:opacity-90"
      style={{ color: danger ? T.danger : T.textPrimary }}
    >
      <span style={{ color: danger ? T.danger : T.textSecondary }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="h-px" style={{ backgroundColor: T.borderSoft }} />;
}
