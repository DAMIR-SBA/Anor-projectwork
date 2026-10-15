import { redirect } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { openSupport } from "@/server/services/chat";

export default async function SellerSupportChat({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { user } = await requireSeller("/seller/chats/support");
  const id = await openSupport(user.id, "SELLER_SUPPORT");
  redirect({ href: `/seller/chats?c=${id}`, locale });
}
