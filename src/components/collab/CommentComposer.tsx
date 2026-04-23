"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Send, Paperclip, X, FileIcon, Loader2, Sparkles, Check } from "lucide-react";
import { useStaffUsers, type StaffUser } from "@/hooks/useChat";
import { MentionPicker } from "./MentionPicker";

export type AiComposeMode =
  | "grammar"
  | "formal"
  | "friendly"
  | "emoji"
  | "shorter"
  | "longer";

const AI_MODES: { key: AiComposeMode; label: string; hint: string }[] = [
  { key: "grammar", label: "Виправити граматику", hint: "Орфографія, пунктуація, узгодження" },
  { key: "emoji", label: "Додати емодзі", hint: "2–4 доречні емодзі" },
  { key: "formal", label: "Офіційний тон", hint: "Для колег і клієнтів" },
  { key: "friendly", label: "Дружній тон", hint: "Теплий, живий" },
  { key: "shorter", label: "Коротше", hint: "Прибрати воду" },
  { key: "longer", label: "Розширити", hint: "Більше деталей і контексту" },
];

type PendingFile = {
  file: File;
  preview?: string;
};

type UploadedAttachment = {
  name: string;
  url: string;
  r2Key?: string;
  size: number;
  mimeType: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reusable composer with @-mention picker and file attachments.
 * Body is sent in raw form; mentions are stored as <@userId> tokens.
 */
export function CommentComposer({
  onSubmit,
  isPending,
  placeholder = "Введіть коментар... (@ — згадати, Enter — надіслати)",
  uploadEndpoint = "/api/admin/comments/upload-presigned",
  aiComposeEndpoint,
}: {
  onSubmit: (body: string, attachments?: UploadedAttachment[]) => Promise<void> | void;
  isPending?: boolean;
  placeholder?: string;
  uploadEndpoint?: string;
  /**
   * If set, enables a ✨ AI-compose button that sends `{ text, mode }` to this
   * endpoint and replaces the draft with the returned `{ text }`.
   */
  aiComposeEndpoint?: string;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionState, setMentionState] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
  }>({ open: false, query: "", startIndex: -1 });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiPending, setAiPending] = useState<AiComposeMode | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const { data: users } = useStaffUsers();

  useEffect(() => {
    if (!aiMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setAiMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [aiMenuOpen]);

  const runAiCompose = async (mode: AiComposeMode) => {
    if (!aiComposeEndpoint) return;
    const text = value.trim();
    if (!text) {
      setAiError("Спочатку введіть текст");
      return;
    }
    try {
      setAiPending(mode);
      setAiError(null);
      const res = await fetch(aiComposeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалось обробити текст");
      }
      const { text: newText } = (await res.json()) as { text: string };
      setValue(newText);
      setAiMenuOpen(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Помилка AI");
    } finally {
      setAiPending(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const caret = e.target.selectionStart ?? newValue.length;
    const upToCaret = newValue.slice(0, caret);
    const atIndex = upToCaret.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionState({ open: false, query: "", startIndex: -1 });
      return;
    }
    const charBefore = atIndex === 0 ? " " : upToCaret[atIndex - 1];
    if (!/\s/.test(charBefore)) {
      setMentionState({ open: false, query: "", startIndex: -1 });
      return;
    }
    const fragment = upToCaret.slice(atIndex + 1);
    if (/\s/.test(fragment)) {
      setMentionState({ open: false, query: "", startIndex: -1 });
      return;
    }
    setMentionState({ open: true, query: fragment, startIndex: atIndex });
  };

  const handlePickMention = (user: StaffUser) => {
    if (mentionState.startIndex < 0) return;
    const before = value.slice(0, mentionState.startIndex);
    const after = value.slice(
      mentionState.startIndex + 1 + mentionState.query.length
    );
    const inserted = `<@${user.id}> `;
    const newValue = `${before}${inserted}${after}`;
    setValue(newValue);
    setMentionState({ open: false, query: "", startIndex: -1 });
    setTimeout(() => {
      textareaRef.current?.focus();
      const caret = before.length + inserted.length;
      textareaRef.current?.setSelectionRange(caret, caret);
    }, 0);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked) return;
    const newFiles: PendingFile[] = [];
    for (let i = 0; i < picked.length; i++) {
      const f = picked[i];
      const pf: PendingFile = { file: f };
      if (f.type.startsWith("image/")) {
        pf.preview = URL.createObjectURL(f);
      }
      newFiles.push(pf);
    }
    setFiles((prev) => [...prev, ...newFiles].slice(0, 10));
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadFiles = async (pending: PendingFile[]): Promise<UploadedAttachment[]> => {
    if (pending.length === 0) return [];

    // Get presigned URLs
    const presignedRes = await fetch(uploadEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: pending.map((p) => ({
          name: p.file.name,
          type: p.file.type,
          size: p.file.size,
        })),
      }),
    });
    if (!presignedRes.ok) {
      const err = await presignedRes.json().catch(() => ({}));
      throw new Error(err.error || "Не вдалось отримати URL для завантаження");
    }
    const { uploads } = await presignedRes.json();

    // Upload to R2 in parallel
    await Promise.all(
      pending.map(async (p, i) => {
        const res = await fetch(uploads[i].uploadUrl, {
          method: "PUT",
          body: p.file,
          headers: { "Content-Type": p.file.type },
        });
        if (!res.ok) throw new Error(`Помилка завантаження: ${p.file.name}`);
      }),
    );

    return uploads.map((u: { name: string; publicUrl: string; r2Key: string; size: number; mimeType: string }) => ({
      name: u.name,
      url: u.publicUrl,
      r2Key: u.r2Key,
      size: u.size,
      mimeType: u.mimeType,
    }));
  };

  const handleSend = async () => {
    if (mentionState.open) return;
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || isPending || uploading) return;
    try {
      setUploading(true);
      const attachments = await uploadFiles(files);
      await onSubmit(trimmed, attachments.length > 0 ? attachments : undefined);
      setValue("");
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState.open) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const busy = isPending || uploading;

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative flex items-center gap-1.5 rounded-lg border admin-dark:border-white/10 admin-light:border-gray-200 admin-dark:bg-gray-800/60 admin-light:bg-gray-50 px-2 py-1.5 text-xs"
            >
              {f.preview ? (
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <FileIcon className="h-4 w-4 admin-dark:text-gray-400 admin-light:text-gray-500" />
              )}
              <span className="max-w-[120px] truncate admin-dark:text-gray-300 admin-light:text-gray-700">
                {f.file.name}
              </span>
              <span className="admin-dark:text-gray-500 admin-light:text-gray-400">
                {formatSize(f.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-red-500/20"
              >
                <X className="h-3 w-3 admin-dark:text-gray-400 admin-light:text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilePick}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.dwg,.dxf"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || files.length >= 10}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg admin-dark:text-gray-400 admin-light:text-gray-500 hover:admin-dark:bg-white/5 hover:admin-light:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Прикріпити файл"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {aiComposeEndpoint && (
          <div className="relative" ref={aiMenuRef}>
            <button
              type="button"
              onClick={() => setAiMenuOpen((v) => !v)}
              disabled={busy || aiPending !== null}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg admin-dark:text-gray-400 admin-light:text-gray-500 hover:admin-dark:bg-white/5 hover:admin-light:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="AI покращити текст"
            >
              {aiPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </button>
            {aiMenuOpen && (
              <div
                className="absolute bottom-full mb-2 left-0 z-50 w-64 rounded-xl admin-dark:bg-gray-900 admin-light:bg-white shadow-xl border admin-dark:border-white/10 admin-light:border-gray-200 overflow-hidden"
              >
                <div className="px-3 py-2 border-b admin-dark:border-white/10 admin-light:border-gray-200 text-[11px] font-semibold tracking-wider uppercase admin-dark:text-gray-400 admin-light:text-gray-500">
                  AI — покращити текст
                </div>
                {aiError && (
                  <div className="px-3 py-2 text-xs text-red-500 border-b admin-dark:border-white/10 admin-light:border-gray-200">
                    {aiError}
                  </div>
                )}
                {AI_MODES.map((m) => {
                  const running = aiPending === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => runAiCompose(m.key)}
                      disabled={aiPending !== null}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:admin-dark:bg-white/5 hover:admin-light:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                        {running ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 opacity-0" />
                        )}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium admin-dark:text-gray-200 admin-light:text-gray-800">
                          {m.label}
                        </span>
                        <span className="text-[11px] admin-dark:text-gray-500 admin-light:text-gray-500">
                          {m.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          maxLength={4000}
          className="flex-1 resize-none rounded-lg border admin-dark:border-white/10 admin-dark:bg-gray-900/40 admin-dark:text-white admin-light:border-gray-200 admin-light:bg-white admin-light:text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-40"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={(!value.trim() && files.length === 0) || busy}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Надіслати (Enter)"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
        {mentionState.open && users && (
          <MentionPicker
            query={mentionState.query}
            users={users}
            onPick={handlePickMention}
            onCancel={() =>
              setMentionState({ open: false, query: "", startIndex: -1 })
            }
          />
        )}
      </div>
    </div>
  );
}
