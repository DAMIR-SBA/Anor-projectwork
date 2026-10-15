import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/server/auth/session";
import { loadCartView, resolveCart } from "@/server/services/cart";
import { CartView } from "@/components/cart/cart-view";
import { PageHeader } from "@/components/ui/display";
import { env } from "@/server/env";
import type { CartView as CartData } from "@/lib/types";

export const metadata = { robots: { index: false } };

const EMPTY: CartData = { id: "", kind: "PERSONAL", shareCode: null, couponCode: null, groups: [], unavailable: [], totals: { itemsCount: 0, listTotal: 0, subtotal: 0, productDiscount: 0, promoDiscount: 0, couponDiscount: 0, couponError: null, freeDelivery: false, total: 0, cashback: 0, monthly: null } };

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cart");
  const user = await getCurrentUser();
  const cart = await resolveCart(user, false);
  const view = cart ? await loadCartView(cart.id, user, await getLocale()) : EMPTY;
  return (
    <div className="container-page py-5">
      <PageHeader title={t("title")} />
      <CartView initial={view} signedIn={!!user} appUrl={env().APP_URL} />
    </div>
  );
}
