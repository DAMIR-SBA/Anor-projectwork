"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { courierDeliverAction, courierFailAction, courierTakeAction } from "@/server/actions/courier";

export function CourierTake({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" loading={pending} onClick={() => start(async () => {
      const r = await courierTakeAction({ shipmentId });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    })}>
      +
    </Button>
  );
}

export function CourierDeliver({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations("courier");
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm font-semibold">{t("confirmCode")}</p>
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className="text-center text-3xl tracking-[0.5em]" aria-label="code" />
        <Button size="lg" variant="success" className="w-full" disabled={code.length !== 4} loading={pending} onClick={() => start(async () => {
          const r = await courierDeliverAction({ shipmentId, code });
          if (!r.ok) return void toast.error(r.fieldErrors?.code ?? r.error);
          toast.success(t("delivered"));
          router.push("/courier");
        })}>
          {t("deliver")}
        </Button>
      </div>
      <div className="card space-y-2 p-4">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("failReason")} aria-label={t("failReason")} />
        <Button variant="outline" className="w-full" disabled={reason.length < 2} loading={pending} onClick={() => start(async () => {
          const r = await courierFailAction({ shipmentId, reason });
          if (!r.ok) return void toast.error(r.error);
          router.push("/courier");
        })}>
          {t("failed")}
        </Button>
      </div>
    </div>
  );
}
