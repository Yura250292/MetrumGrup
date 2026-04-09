"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { useStaffUsers, type StaffUser } from "@/hooks/useChat";
import { MentionPicker } from "./MentionPicker";

/**
 * Reusable composer with @-mention picker.
 * Body is sent in raw form; mentions are stored as <@userId> tokens.
 * `displayMap` is built from picker selections so the textarea can show
 * "@Name" while the underlying text is "<@id>".
 */
export function CommentComposer({
  onSubmit,
  isPending,
  placeholder = "Введіть коментар... (@ — згадати, Enter — надіслати)",
}: {
  onSubmit: (body: string) => Promise<void> | void;
  isPending?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [mentionState, setMentionState] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
  }>({ open: false, query: "", startIndex: -1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: users } = useStaffUsers();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const caret = e.target.selectionStart ?? newValue.length;
    // Find the closest "@" before caret that starts a mention token
    const upToCaret = newValue.slice(0, caret);
    const atIndex = upToCaret.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionState({ open: false, query: "", startIndex: -1 });
      return;
    }
    // Mention triggers only if "@" is at start or preceded by whitespace
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

  const handleSend = async () => {
    if (mentionState.open) return;
    const trimmed = value.trim();
    if (!trimmed || isPending) return;
    try {
      await onSubmit(trimmed);
      setValue("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState.open) {
      // Mention picker handles its own keys
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex items-end gap-2">
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
        disabled={!value.trim() || isPending}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Надіслати (Enter)"
      >
        <Send className="h-4 w-4" />
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
  );
}
