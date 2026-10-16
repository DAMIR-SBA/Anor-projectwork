import { notFound } from "next/navigation";
import { campaignOpenFor } from "@/lib/campaign";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { cardsByIds } from "@/server/services/catalog";
import { ProductGrid } from "@/components/product/product-grid";
import { Countdown, CopyButton } from "@/components/ui/interactive";
import { loc } from "@/lib/localized";

type Block = { type: "hero" | "countdown" | "products" | "text" | "coupons"; textUz?: string; textRu?: string; codes?: string[] };

/** Campaign landing page rendered from admin-built blocks. Plus members get early access. */
export default async function CampaignPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const c = await db.campaign.findUnique({ where: { slug }, include: { products: { where: { status: "APPROVED" }, select: { productId: true } } } });
  if (!c || c.status === "DRAFT") notFound();
  const t = await getTranslations("home");
  const user = await getCurrentUser();
  const open = campaignOpenFor(c, !!user?.isPlus);
  const cards = open ? await cardsByIds(c.products.map((p) => p.productId), locale) : [];
  const blocks = (c.blocks as Block[] | null) ?? [{ type: "hero" }, { type: "countdown" }, { type: "products" }];
  return (
    <div className="container-page space-y-5 py-5">
      {blocks.map((b, i) => {
        if (b.type === "hero")
          return (
            <header key={i} className="rounded-[20px] p-8 text-white md:p-12" style={{ background: c.themeColor }}>
              <h1 className="text-3xl font-extrabold md:text-5xl">{loc(c, "name", locale)}</h1>
              {loc(c, "description", locale) && <p className="mt-3 max-w-2xl text-lg text-white/90">{loc(c, "description", locale)}</p>}
            </header>
          );
        if (b.type === "countdown")
          return (
            <div key={i} className="card flex items-center justify-between p-4">
              <span className="font-bold">{open ? t("endsIn") : "⏳"}</span>
              <Countdown to={(open ? c.endsAt : c.startsAt).toISOString()} labels={{ d: "d" }} className="text-2xl font-extrabold text-brand-ink" />
            </div>
          );
        if (b.type === "text") return <p key={i} className="card p-5 text-[15px]">{locale === "ru" ? b.textRu : b.textUz}</p>;
        if (b.type === "coupons")
          return (
            <div key={i} className="flex flex-wrap gap-2">
              {(b.codes ?? []).map((code) => (
                <div key={code} className="flex items-center gap-2 rounded-[14px] border-2 border-dashed border-primary bg-surface px-4 py-2 font-mono text-lg font-bold">
                  {code} <CopyButton value={code} />
                </div>
              ))}
            </div>
          );
        return <ProductGrid key={i} items={cards} />;
      })}
    </div>
  );
}
