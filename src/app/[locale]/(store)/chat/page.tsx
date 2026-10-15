import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { ChatPage } from "@/components/chat/chat-page";

export async function generateMetadata() {
  return { title: (await getTranslations("chat"))("title"), robots: { index: false } };
}

export default async function ChatIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/chat");
  return (
    <div className="container-page py-3 md:py-5">
      <div className="card h-[calc(100dvh-152px)] min-h-[480px] overflow-hidden p-0 md:h-[calc(100dvh-150px)]">
        <ChatPage userId={user.id} viewer="buyer" />
      </div>
    </div>
  );
}
