"use client";

import { useSendMessage } from "@/hooks/useChat";
import { CommentComposer } from "@/components/collab/CommentComposer";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const sendMessage = useSendMessage(conversationId);

  return (
    <div
      className="border-t px-4 py-3"
      style={{ borderColor: T.borderSoft }}
    >
      <CommentComposer
        onSubmit={async (body) => {
          await sendMessage.mutateAsync(body);
        }}
        isPending={sendMessage.isPending}
        placeholder="Введіть повідомлення... (@ — згадати, Enter — надіслати)"
      />
      {sendMessage.isError && (
        <p className="mt-1 text-xs text-red-500">
          Не вдалося надіслати: {(sendMessage.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
