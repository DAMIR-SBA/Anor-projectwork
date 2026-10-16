"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GitCompare, X } from "lucide-react";
import { useShopState } from "@/components/providers/shop-state";
import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/display";
import type { ProductCardData } from "@/lib/types";

type Data = { cards: ProductCardData[]; keys: string[]; values: Record<string, Record<string, string>> };

export function CompareView() {
  const t = useTranslations("compare");
  const locale = useLocale();
  const { compare, toggleCompare, clearCompare } = useShopState();
  // Results are keyed by the id list, so a stale table never shows for a changed selection.
  const key = `${compare.join(",")}|${locale}`;
  const [loaded, setLoaded] = useState<{ key: string; data: Data | null } | null>(null);

  useEffect(() => {
    if (!compare.length) return;
    let live = true;
    fetch(`/api/v1/products/compare?ids=${compare.join(",")}&locale=${locale}`)
      .then((r) => r.json())
      .then((d: Data) => live && setLoaded({ key, data: d }))
      .catch(() => live && setLoaded({ key, data: null }));
    return () => {
      live = false;
    };
  }, [compare, locale, key]);

  if (!compare.length) return <EmptyState className="card" icon={<GitCompare className="h-8 w-8" />} title={t("empty")} />;
  const data = loaded?.key === key ? loaded.data : null;
  if (!data) return <div className="skeleton h-96" />;
  const cols = data.cards.length;
  return (
    <div className="card overflow-x-auto p-3">
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={clearCompare} className="text-sm font-semibold text-brand-ink">
          {t("clear")}
        </button>
      </div>
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40" />
            {data.cards.map((c) => (
              <th key={c.id} className="relative p-2 align-top font-normal">
                <button type="button" onClick={() => toggleCompare(c.id)} className="absolute right-3 top-3 z-10 rounded-full bg-white p-1 text-[#1A1A1F] shadow" aria-label="remove">
                  <X className="h-4 w-4" />
                </button>
                <ProductCard p={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.keys.map((k) => {
            const vals = data.cards.map((c) => data.values[c.id]?.[k] ?? "—");
            const differs = new Set(vals).size > 1;
            return (
              <tr key={k} className="border-t border-border">
                <th scope="row" className="p-2 text-left font-semibold text-muted">
                  {k}
                </th>
                {vals.map((v, i) => (
                  <td key={i} className={`p-2 ${differs ? "font-semibold" : ""}`} style={{ width: `${100 / cols}%` }}>
                    {v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
