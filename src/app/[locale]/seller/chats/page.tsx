import { setRequestLocale } from "next-intl/server";
import { requireSeller } from "@/server/auth/guards";
import { ChatPage } from "@/components/chat/chat-page";

export default async function SellerChats({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ c?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { c } = await searchParams;
  const { user } = await requireSeller("/seller/chats");
  return (
    <div className="card -m-1 h-[calc(100dvh-112px)] min-h-[480px] overflow-hidden p-0 md:h-[calc(100dvh-128px)] lg:h-[calc(100dvh-144px)]">
      <ChatPage userId={user.id} viewer="seller" conversationId={c ?? null} />
    </div>
  );
}
