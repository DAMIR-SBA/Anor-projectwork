import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/display";

/** Placeholder until the reviews phase: rating summary and list render here. */
export async function ProductReviewsSection({ productId }: { productId: string; productSlug: string }) {
  const t = await getTranslations("product");
  return (
    <Card id="reviews" className="p-5" data-product={productId}>
      <h2 className="text-xl font-extrabold">{t("reviews")}</h2>
    </Card>
  );
}
