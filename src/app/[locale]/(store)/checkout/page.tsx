import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { quoteCheckout } from "@/server/services/checkout";
import { AppError } from "@/server/action";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { PageHeader } from "@/components/ui/display";
import { FormError } from "@/components/ui/form";
import { platformSettings } from "@/server/services/platform";
import { pickText } from "@/lib/platform";
import { INVOICE_BANK_DAYS } from "@/lib/b2b";

export const metadata = { robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ cart?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/checkout");
  const t = await getTranslations("checkout");
  const cartId = (await searchParams).cart ?? null;
  let q;
  try {
    q = await quoteCheckout(user, { cartId, deliveryMethod: "COURIER", addressId: null, pickupPointId: null, bonus: 0 }, locale);
  } catch (err) {
    if (err instanceof AppError) redirect({ href: "/cart", locale });
    throw err;
  }
  const [addresses, points, cards, wallet, platform, business] = await Promise.all([
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    db.pickupPoint.findMany({ where: { isActive: true }, orderBy: [{ city: "asc" }, { name: "asc" }] }),
    db.savedCard.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.wallet.findUnique({ where: { userId: user.id } }),
    platformSettings(),
    db.businessProfile.findFirst({ where: { userId: user.id, verifiedAt: { not: null } }, select: { companyName: true } }),
  ]);
  const paused = platform.ordersPaused.enabled ? pickText(platform.ordersPaused.messageUz, platform.ordersPaused.messageRu, locale) || t("paused") : null;
  return (
    <div className="container-page py-5">
      <PageHeader title={t("title")} />
      {paused && (
        <div className="mb-4">
          <FormError message={paused} />
        </div>
      )}
      <CheckoutView
        cartId={cartId}
        lines={q!.lines.map((l) => ({ variantId: l.variantId, title: l.title, variantTitle: l.variantTitle, image: l.image, quantity: l.quantity, unitPrice: l.unitPrice }))}
        initial={{ totals: q!.totals, groups: q!.groups.map((g) => ({ shopId: g.shopId, shopName: g.shopName, eta: g.eta, fulfillment: g.fulfillment, count: g.lines.length })), expressAllowed: q!.expressAllowed, plans: q!.plans }}
        addresses={addresses}
        pickupPoints={points.map((p) => ({ id: p.id, name: p.name, city: p.city, district: p.district, address: p.address, lat: p.lat, lng: p.lng, hours: p.hours as Record<string, string>, storageDays: p.storageDays, hasFitting: p.hasFitting }))}
        cards={cards.map((c) => ({ id: c.id, brand: c.brand, last4: c.last4, provider: c.provider }))}
        walletBalance={wallet?.balance ?? 0}
        bonusBalance={user.bonusBalance}
        nasiyaAvailable={Math.max(0, user.nasiyaLimit - user.nasiyaUsed)}
        user={{ name: user.name, phone: user.phone }}
        business={business ? { companyName: business.companyName, invoiceDays: INVOICE_BANK_DAYS } : null}
      />
    </div>
  );
}
