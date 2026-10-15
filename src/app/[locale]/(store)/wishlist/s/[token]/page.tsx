import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { cardsByIds } from "@/server/services/catalog";
import { ProductGrid } from "@/components/product/product-grid";
import { PageHeader } from "@/components/ui/display";

export const metadata = { robots: { index: false } };

export default async function SharedWishlist({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const wl = await db.wishlist.findUnique({ where: { shareToken: token }, include: { user: { select: { name: true, login: true } }, items: { select: { productId: true } } } });
  if (!wl || !wl.isPublic) notFound();
  const t = await getTranslations("wishlist");
  const items = await cardsByIds(wl.items.map((i) => i.productId), locale);
  return (
    <div className="container-page py-5">
      <PageHeader title={t("sharedTitle", { name: wl.user.name?.split(" ")[0] ?? wl.user.login })} />
      <ProductGrid items={items} />
    </div>
  );
}
