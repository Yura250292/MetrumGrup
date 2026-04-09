"use client";

import { useSendMessage } from "@/hooks/useChat";
import { CommentComposer } from "@/components/collab/CommentComposer";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const sendMessage = useSendMessage(conversationId);

  return (
    <div className="border-t admin-dark:border-white/10 admin-light:border-gray-200 px-4 py-3">
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
