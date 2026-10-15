import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Users } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { requireUser } from "@/server/auth/guards";
import { loadCartView, resolveGroupCart } from "@/server/services/cart";
import { CartView } from "@/components/cart/cart-view";
import { GroupCartBanner } from "@/components/cart/group-banner";
import { PageHeader } from "@/components/ui/display";
import { env } from "@/server/env";
import { db } from "@/server/db";

export default async function GroupCartPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  await requireUser(`/cart/group/${code}`);
  const user = (await getCurrentUser())!;
  const cart = await resolveGroupCart(code);
  if (!cart) notFound();
  const t = await getTranslations("cart");
  const owner = cart.ownerId ? await db.user.findUnique({ where: { id: cart.ownerId }, select: { name: true, login: true } }) : null;
  const view = await loadCartView(cart.id, user, locale);
  return (
    <div className="container-page py-5">
      <PageHeader title={<span className="flex items-center gap-2"><Users className="h-7 w-7 text-primary" /> {t("groupCart")}</span>} description={owner ? `${owner.name ?? owner.login}` : undefined} />
      <GroupCartBanner code={cart.shareCode!} link={`${env().APP_URL}/cart/group/${cart.shareCode}`} />
      <CartView initial={view} signedIn isOwner={cart.ownerId === user.id} appUrl={env().APP_URL} />
    </div>
  );
}
