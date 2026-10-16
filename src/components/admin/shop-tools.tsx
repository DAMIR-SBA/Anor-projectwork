"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { penalizeShopAction, shopTermsAction } from "@/server/actions/admin-marketplace";

export function ShopTermsForm({ shop }: { shop: { id: string; tier: "BASIC" | "PRO"; isOfficial: boolean; commissionRate: number | null; kycLevel: number } }) {
  const t = useTranslations("adminShops");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ tier: shop.tier, isOfficial: shop.isOfficial, rate: shop.commissionRate === null ? "" : String(+(shop.commissionRate * 100).toFixed(2)), kycLevel: String(shop.kycLevel) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await shopTermsAction({ id: shop.id, tier: f.tier, isOfficial: f.isOfficial, commissionRate: f.rate === "" ? null : Number(f.rate) / 100, kycLevel: Number(f.kycLevel) });
          if (!res.ok) return setError(res.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("tier")} htmlFor="st-tier">
          <Select id="st-tier" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as "BASIC" | "PRO" })}>
            <option value="BASIC">Basic</option>
            <option value="PRO">Pro</option>
          </Select>
        </Field>
        <Field label={t("kyc")} htmlFor="st-kyc">
          <Select id="st-kyc" value={f.kycLevel} onChange={(e) => setF({ ...f, kycLevel: e.target.value })}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("commissionOverride")} htmlFor="st-rate" hint={t("commissionHint")}>
        <Input id="st-rate" inputMode="decimal" value={f.rate} placeholder="—" onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, "") })} />
      </Field>
      <Checkbox checked={f.isOfficial} onChange={(e) => setF({ ...f, isOfficial: e.target.checked })} label={t("official")} />
      <FormError message={error} />
      <Button type="submit" size="sm" loading={pending}>
        {t("saveTerms")}
      </Button>
    </form>
  );
}

const PENALTY_TYPES = ["QUALITY", "CANCELLATION", "LATE_HANDOVER", "OTHER"] as const;

export function PenaltyForm({ shopId }: { shopId: string }) {
  const t = useTranslations("adminShops");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ amount: "", type: "QUALITY" as (typeof PENALTY_TYPES)[number], reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await penalizeShopAction({ id: shopId, amount: Number(f.amount), type: f.type, reason: f.reason });
          if (!res.ok) return setError(res.error);
          toast.success(t("penaltyAdded"));
          setF({ amount: "", type: "QUALITY", reason: "" });
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("amount")} htmlFor="pn-amount">
          <Input id="pn-amount" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("penaltyType")} htmlFor="pn-type">
          <Select id="pn-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as (typeof PENALTY_TYPES)[number] })}>
            {PENALTY_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(`penaltyTypes.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("reason")} htmlFor="pn-reason">
        <Textarea id="pn-reason" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      <FormError message={error} />
      <Button type="submit" size="sm" variant="danger" loading={pending} disabled={!f.amount || f.reason.trim().length < 3}>
        {t("addPenalty")}
      </Button>
    </form>
  );
}
