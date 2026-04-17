"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send, Paperclip, X, FileIcon, ImageIcon, Loader2 } from "lucide-react";
import { useStaffUsers, type StaffUser } from "@/hooks/useChat";
import { MentionPicker } from "./MentionPicker";

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
}: {
  onSubmit: (body: string, attachments?: UploadedAttachment[]) => Promise<void> | void;
  isPending?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionState, setMentionState] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
  }>({ open: false, query: "", startIndex: -1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: users } = useStaffUsers();

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
    const presignedRes = await fetch("/api/admin/comments/upload-presigned", {
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
