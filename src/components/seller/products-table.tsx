"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Archive, Eye, FlaskConical, Pencil, Percent, PlayCircle, Trash2, Warehouse } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { bulkProductsAction } from "@/server/actions/seller-products";
import type { listSellerProducts } from "@/server/services/seller/products";
import { formatUZS } from "@/lib/money";
import { locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof listSellerProducts>>["items"][number];
const TONE = { DRAFT: "neutral", PENDING: "accent", ACTIVE: "success", REJECTED: "danger", ARCHIVED: "dark" } as const;

export function ProductsTable({ rows }: { rows: Row[] }) {
  const t = useTranslations("sellerProducts");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("-10");
  const [stock, setStock] = useState("10");
  const [pending, start] = useTransition();

  const run = (op: Parameters<typeof bulkProductsAction>[0]["op"]) =>
    start(async () => {
      const res = await bulkProductsAction({ ids: [...sel], op });
      if (!res.ok) return toast.error(res.error);
      toast.success(t("bulkDone", { count: Number((res.data as { count: number }).count) }));
      setSel(new Set());
      router.refresh();
    });

  const all = rows.length > 0 && sel.size === rows.length;
  return (
    <div>
      {sel.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-surface/95 p-2.5 text-sm shadow-sm backdrop-blur">
          <span className="font-bold">{t("selected", { count: sel.size })}</span>
          <span className="flex items-center gap-1">
            <Input aria-label={t("pricePercent")} value={percent} onChange={(e) => setPercent(e.target.value)} className="h-8 w-16 text-sm" inputMode="numeric" />
            <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => run({ kind: "pricePercent", percent: Number(percent) || 0 })}>
              <Percent className="h-4 w-4" /> {t("applyPrice")}
            </Button>
          </span>
          <span className="flex items-center gap-1">
            <Input aria-label={t("setStock")} value={stock} onChange={(e) => setStock(e.target.value)} className="h-8 w-16 text-sm" inputMode="numeric" />
            <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => run({ kind: "stock", quantity: Number(stock) || 0 })}>
              <Warehouse className="h-4 w-4" /> {t("setStock")}
            </Button>
          </span>
          <Button size="sm" variant="success" className="h-8" disabled={pending} onClick={() => run({ kind: "status", status: "ACTIVE" })}>
            <PlayCircle className="h-4 w-4" /> {t("activate")}
          </Button>
          <Button size="sm" variant="secondary" className="h-8" disabled={pending} onClick={() => run({ kind: "status", status: "ARCHIVED" })}>
            <Archive className="h-4 w-4" /> {t("archive")}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-danger" disabled={pending} onClick={() => window.confirm(t("deleteConfirm", { count: sel.size })) && run({ kind: "delete" })}>
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </Button>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label={t("selectAll")} className="h-4 w-4 accent-[#C8102E]" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              </th>
              <th className="px-3 py-2.5">{t("product")}</th>
              <th className="px-3 py-2.5">{t("price")}</th>
              <th className="px-3 py-2.5">{t("stock")}</th>
              <th className="px-3 py-2.5">{t("statusCol")}</th>
              <th className="px-3 py-2.5">{t("salesCol")}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={cn("align-middle", sel.has(r.id) && "bg-primary/5")}>
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={r.titleUz}
                    className="h-4 w-4 accent-[#C8102E]"
                    checked={sel.has(r.id)}
                    onChange={() =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{r.image && <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />}</span>
                    <div className="min-w-0">
                      <Link href={`/seller/products/${r.id}`} className="line-clamp-1 font-semibold hover:underline">
                        {locale === "ru" ? r.titleRu : locText(r.titleUz, locale)}
                      </Link>
                      <p className="text-xs text-muted">
                        {r.sku}
                        {r.variants > 1 && ` · ${t("variantsN", { count: r.variants })}`} · {r.fulfillment} · {locale === "ru" ? r.category.ru : locText(r.category.uz, locale)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="tabular px-3 py-2.5">
                  <p className="font-bold">{formatUZS(r.price, locale)}</p>
                  {r.oldPrice && <p className="text-xs text-muted line-through">{formatUZS(r.oldPrice, locale)}</p>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("tabular font-semibold", r.stock === 0 ? "text-danger" : r.lowStock && "text-accent-ink")}>{r.stock}</span>
                  {r.lowStock && r.stock > 0 && <span className="ml-1 text-xs font-semibold text-accent-ink">{t("low")}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                  {r.experiment && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-info" title={t("abRunning")}>
                      <FlaskConical className="h-3.5 w-3.5" /> A/B
                    </span>
                  )}
                  {r.status === "PENDING" && <p className="mt-0.5 text-xs text-muted">{t("pendingHint")}</p>}
                </td>
                <td className="tabular px-3 py-2.5 text-xs text-muted">
                  {t("soldN", { count: r.sold })}
                  <br />
                  {t("viewsN", { count: r.views })} · ★ {r.rating.toFixed(1)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Link href={`/seller/products/${r.id}`} className="rounded-[8px] p-2 hover:bg-surface-3" aria-label={t("edit")}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {r.status === "ACTIVE" && (
                      <a href={`/p/${r.slug}`} target="_blank" rel="noopener" className="rounded-[8px] p-2 hover:bg-surface-3" aria-label={t("view")}>
                        <Eye className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
      </div>
    </div>
  );
}
