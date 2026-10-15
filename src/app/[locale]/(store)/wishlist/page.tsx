import { getTranslations, setRequestLocale } from "next-intl/server";
import { Heart } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cardsByIds } from "@/server/services/catalog";
import { ProductGrid } from "@/components/product/product-grid";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { WishlistShare } from "@/components/cart/wishlist-share";
import { env } from "@/server/env";

export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/wishlist");
  const t = await getTranslations("wishlist");
  const wl = await db.wishlist.findUniqueOrThrow({ where: { userId: user.id }, include: { items: { orderBy: { createdAt: "desc" }, select: { productId: true } } } });
  const items = await cardsByIds(wl.items.map((i) => i.productId), locale);
  return (
    <div className="container-page py-5">
      <PageHeader title={t("title")} />
      {items.length ? (
        <>
          <WishlistShare isPublic={wl.isPublic} link={`${env().APP_URL}/wishlist/s/${wl.shareToken}`} />
          <ProductGrid items={items} />
        </>
      ) : (
        <EmptyState className="card" icon={<Heart className="h-8 w-8" />} title={t("empty")} description={t("emptyText")} />
      )}
    </div>
  );
}
