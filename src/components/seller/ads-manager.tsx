"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Megaphone, Pause, Pencil, Play, Plus, Square } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Radio, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { campaignStatusAction, saveCampaignAction } from "@/server/actions/seller-ads";
import type { listCampaigns } from "@/server/services/ads";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];
type Option = { id: string; label: string };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function AdsManager({ campaigns, products, categories, restricted, minBid, minBudget }: { campaigns: Campaign[]; products: Option[]; categories: Option[]; restricted: boolean; minBid: { CPC: number; CPM: number }; minBudget: number }) {
  const t = useTranslations("sellerAds");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Campaign | "new" | null>(campaigns.length ? null : "new");
  const [pending, start] = useTransition();
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div className="space-y-4">
      {restricted && <p className="rounded-[12px] bg-danger/10 p-3 text-sm text-danger">{t("restricted")}</p>}
      {editing ? (
        <CampaignForm initial={editing === "new" ? null : editing} products={products} categories={categories} minBid={minBid} minBudget={minBudget} onDone={() => (setEditing(null), router.refresh())} onCancel={() => setEditing(null)} />
      ) : (
        <Button leftIcon={<Plus className="h-4 w-4" />} disabled={restricted} onClick={() => setEditing("new")}>
          {t("create")}
        </Button>
      )}
      <ul className="space-y-3">
        {campaigns.map((c) => (
          <li key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <p className="font-bold">{c.name}</p>
              <Badge tone={c.status === "ACTIVE" ? "success" : c.status === "PAUSED" ? "accent" : "neutral"}>{t(`status.${c.status}`)}</Badge>
              <Badge>{t(`placement.${c.placement}`)}</Badge>
              <span className="text-sm text-muted">
                {c.bidModel} · {fmt(c.bid)} · {t("daily")}: {fmt(c.spentToday)} / {fmt(c.dailyBudget)}
              </span>
              <span className="ml-auto flex gap-1">
                {c.status !== "ENDED" && (
                  <>
                    <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={c.status === "ACTIVE" ? t("pause") : t("resume")} disabled={pending || (restricted && c.status !== "ACTIVE")} onClick={() => start(async () => { const r = await campaignStatusAction({ id: c.id, status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }); if (!r.ok) toast.error(r.error); router.refresh(); })}>
                      {c.status === "ACTIVE" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t("end")} disabled={pending} onClick={() => window.confirm(t("endConfirm")) && start(async () => { await campaignStatusAction({ id: c.id, status: "ENDED" }); router.refresh(); })}>
                      <Square className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </span>
            </div>
            {/* Budget pacing for today */}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-label={t("pacing")}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.spentToday / c.dailyBudget) * 100)}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
              {(
                [
                  ["impressions", String(c.stats.impressions)],
                  ["clicks", String(c.stats.clicks)],
                  ["ctr", pct(c.metrics.ctr)],
                  ["cpc", fmt(c.metrics.cpc)],
                  ["spend", fmt(c.stats.spend)],
                  ["orders", String(c.stats.orders)],
                  ["revenue", fmt(c.stats.revenue)],
                  ["roas", c.stats.spend ? `${c.metrics.roas.toFixed(1)}×` : "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-[10px] bg-surface-2 p-2">
                  <dt className="text-[11px] text-muted">{t(`metrics.${k}`)}</dt>
                  <dd className="tabular font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-muted">
              {c.placement === "SEARCH" ? `${t("keywords")}: ${c.keywords.join(", ")}` : `${t("category")}: ${locale === "ru" ? c.category?.nameRu : c.category?.nameUz}`} · {t("productsN", { count: c.productIds.length })} · {t("acos")}: {c.stats.revenue ? pct(c.metrics.acos) : "—"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignForm({ initial, products, categories, minBid, minBudget, onDone, onCancel }: { initial: Campaign | null; products: Option[]; categories: Option[]; minBid: { CPC: number; CPM: number }; minBudget: number; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("sellerAds");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    placement: initial?.placement ?? "SEARCH",
    bidModel: initial?.bidModel ?? "CPC",
    bid: String(initial?.bid ?? minBid.CPC * 2),
    dailyBudget: String(initial?.dailyBudget ?? 50_000),
    totalBudget: initial?.totalBudget ? String(initial.totalBudget) : "",
    keywords: initial?.keywords.join(", ") ?? "",
    categoryId: categories[0]?.id ?? "",
    productIds: new Set(initial?.productIds ?? []),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const min = minBid[f.bidModel as "CPC"];
  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-bold">{initial ? t("editTitle") : t("create")}</h2>
      <Field label={t("name")} htmlFor="ad-name" error={errors.name}>
        <Input id="ad-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t("placementLabel")}</legend>
          <div className="flex gap-4">
            {(["SEARCH", "CATEGORY"] as const).map((p) => (
              <Radio key={p} name="placement" checked={f.placement === p} onChange={() => setF({ ...f, placement: p })} label={t(`placement.${p}`)} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t("bidModel")}</legend>
          <div className="flex gap-4">
            {(["CPC", "CPM"] as const).map((m) => (
              <Radio key={m} name="bidModel" checked={f.bidModel === m} onChange={() => setF({ ...f, bidModel: m, bid: String(Math.max(Number(f.bid) || 0, minBid[m])) })} label={t(`models.${m}`)} />
            ))}
          </div>
        </fieldset>
      </div>
      {f.placement === "SEARCH" ? (
        <Field label={t("keywords")} htmlFor="ad-kw" hint={t("keywordsHint")} error={errors.keywords}>
          <Input id="ad-kw" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="ko‘ylak, платье, paxta" />
        </Field>
      ) : (
        <Field label={t("category")} htmlFor="ad-cat">
          <Select id="ad-cat" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t("bid", { model: f.bidModel })} htmlFor="ad-bid" hint={t("minBid", { min: formatUZS(min, locale) })} error={errors.bid}>
          <Input id="ad-bid" inputMode="numeric" value={f.bid} onChange={(e) => setF({ ...f, bid: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("dailyBudget")} htmlFor="ad-day" hint={t("minBid", { min: formatUZS(minBudget, locale) })} error={errors.dailyBudget}>
          <Input id="ad-day" inputMode="numeric" value={f.dailyBudget} onChange={(e) => setF({ ...f, dailyBudget: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("totalBudget")} htmlFor="ad-total" hint={tc("optional")}>
          <Input id="ad-total" inputMode="numeric" value={f.totalBudget} onChange={(e) => setF({ ...f, totalBudget: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("products")}</legend>
        {errors.productIds && <p className="mb-1 text-sm text-danger">{errors.productIds}</p>}
        <div className="grid grid-cols-1 max-h-56 gap-1.5 overflow-y-auto rounded-[12px] border border-border p-3 sm:grid-cols-2">
          {products.map((p) => (
            <Checkbox
              key={p.id}
              label={<span className="text-sm">{p.label}</span>}
              checked={f.productIds.has(p.id)}
              onChange={(e) =>
                setF((x) => {
                  const n = new Set(x.productIds);
                  if (e.target.checked) n.add(p.id);
                  else n.delete(p.id);
                  return { ...x, productIds: n };
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <p className="text-[13px] text-muted">{t("billingHint")}</p>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              setErrors({});
              setError(null);
              const res = await saveCampaignAction({
                id: initial?.id,
                name: f.name,
                placement: f.placement as "SEARCH",
                bidModel: f.bidModel as "CPC",
                bid: Number(f.bid) || 0,
                dailyBudget: Number(f.dailyBudget) || 0,
                totalBudget: f.totalBudget ? Number(f.totalBudget) : null,
                keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
                categoryId: f.placement === "CATEGORY" ? f.categoryId : null,
                productIds: [...f.productIds],
              });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                return setError(res.error);
              }
              onDone();
            })
          }
        >
          {tc("save")}
        </Button>
        <Button variant="secondary" onClick={onCancel} className={cn(!initial && "hidden")}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
