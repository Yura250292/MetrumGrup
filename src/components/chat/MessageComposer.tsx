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
        onSubmit={async (body, attachments) => {
          await sendMessage.mutateAsync({
            body,
            attachments: attachments?.map((a) => ({
              name: a.name,
              url: a.url,
              r2Key: a.r2Key,
              size: a.size,
              mimeType: a.mimeType,
            })),
          });
        }}
        isPending={sendMessage.isPending}
        placeholder="Введіть повідомлення... (@ — згадати, Enter — надіслати)"
        uploadEndpoint="/api/admin/chat/upload-url"
      />
      {sendMessage.isError && (
        <p className="mt-1 text-xs text-red-500">
          Не вдалося надіслати: {(sendMessage.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
