"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Radio, Select, Textarea } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { requestReturnAction } from "@/server/actions/checkout";

const REASONS = ["defect", "wrong", "size", "notAsDescribed", "changedMind"] as const;

export function ReturnDialog({ open, onClose, items }: { open: boolean; onClose: () => void; items: Array<{ id: string; title: string; quantity: number }> }) {
  const t = useTranslations("returns");
  const router = useRouter();
  const toast = useToast();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("defect");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [refund, setRefund] = useState<"CARD" | "WALLET">("WALLET");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const item = items.find((i) => i.id === itemId);
  return (
    <Dialog open={open} onClose={onClose} title={t("new")}>
      <div className="space-y-3">
        <FormError message={error} />
        <p className="text-sm text-muted">{t("window")}</p>
        <Field label={t("item")} htmlFor="r-item">
          <Select id="r-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("quantity")} htmlFor="r-qty">
          <Select id="r-qty" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
            {Array.from({ length: item?.quantity ?? 1 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("reason")} htmlFor="r-reason">
          <Select id="r-reason" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reasons.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("description")} htmlFor="r-desc">
          <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label={t("photos")}>
          <ImageUploader value={photos} onChange={setPhotos} folder="returns" />
        </Field>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-semibold">{t("refundTo")}</legend>
          <Radio name="refund" checked={refund === "WALLET"} onChange={() => setRefund("WALLET")} label={t("refundWallet")} />
          <Radio name="refund" checked={refund === "CARD"} onChange={() => setRefund("CARD")} label={t("refundCard")} />
        </fieldset>
        <Button
          className="w-full"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await requestReturnAction({ orderItemId: itemId, quantity: qty, reason, description, photos, refundMethod: refund });
              if (!r.ok) return setError(r.error);
              toast.success(t("submitted"));
              onClose();
              router.refresh();
            })
          }
        >
          {t("submit")}
        </Button>
      </div>
    </Dialog>
  );
}
