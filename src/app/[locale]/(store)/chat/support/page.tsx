import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { openSupport } from "@/server/services/chat";

/** The always-available "Help" chat. */
export default async function SupportChat({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser("/chat/support");
  const id = await openSupport(user.id, "SUPPORT");
  redirect({ href: `/chat/${id}`, locale });
}
