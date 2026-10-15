import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { ChatPage } from "@/components/chat/chat-page";

export const metadata = { robots: { index: false } };

export default async function ChatThreadPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/chat/${id}`);
  return (
    <div className="container-page py-3 md:py-5">
      <div className="card h-[calc(100dvh-152px)] min-h-[480px] overflow-hidden p-0 md:h-[calc(100dvh-150px)]">
        <ChatPage userId={user.id} viewer="buyer" conversationId={id} />
      </div>
    </div>
  );
}
