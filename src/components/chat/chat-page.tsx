import { notFound } from "next/navigation";
import { AppError } from "@/server/action";
import { listConversations, markRead, openThread } from "@/server/services/chat";
import { ChatApp } from "./chat-app";

/** Server wrapper shared by /chat, /chat/[id] and /seller/chats. */
export async function ChatPage({ userId, viewer, conversationId }: { userId: string; viewer: "buyer" | "seller"; conversationId?: string | null }) {
  const list = await listConversations(userId, { shopOnly: viewer === "seller" });
  let thread = null;
  if (conversationId) {
    try {
      thread = await openThread({ userId }, conversationId);
      await markRead(userId, conversationId);
    } catch (err) {
      if (err instanceof AppError) notFound();
      throw err;
    }
  }
  return (
    <ChatApp
      me={{ id: userId }}
      viewer={viewer}
      initialList={list.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c))}
      initialThread={thread}
      basePath={viewer === "seller" ? "/seller/chats" : "/chat"}
      supportHref={viewer === "seller" ? "/seller/chats/support" : "/chat/support"}
    />
  );
}
