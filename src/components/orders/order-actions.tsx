"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FastForward, Undo2, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cancelOrderAction, demoAdvanceOrderAction } from "@/server/actions/checkout";
import { ReturnDialog } from "./return-dialog";

export function OrderActions({ orderId, canCancel, demo, returnable, items }: { orderId: string; canCancel: boolean; demo: boolean; returnable: boolean; items: Array<{ id: string; title: string; quantity: number }> }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [returnOpen, setReturnOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {canCancel && (
        <Button
          variant="outline"
          loading={pending}
          leftIcon={<XCircle className="h-4 w-4" />}
          onClick={() => {
            if (!window.confirm(t("cancelConfirm"))) return;
            start(async () => {
              const r = await cancelOrderAction({ orderId });
              if (r.ok) toast.success(t("cancelled"));
              else toast.error(r.error);
              router.refresh();
            });
          }}
        >
          {t("cancel")}
        </Button>
      )}
      {returnable && (
        <Button variant="outline" leftIcon={<Undo2 className="h-4 w-4" />} onClick={() => setReturnOpen(true)}>
          {t("requestReturn")}
        </Button>
      )}
      {demo && (
        <Button
          variant="accent"
          title={t("demoAdvanceHint")}
          loading={pending}
          leftIcon={<FastForward className="h-4 w-4" />}
          onClick={() =>
            start(async () => {
              const r = await demoAdvanceOrderAction({ orderId });
              if (!r.ok) toast.error(r.error);
              router.refresh();
            })
          }
        >
          {t("demoAdvance")}
        </Button>
      )}
      <ReturnDialog open={returnOpen} onClose={() => setReturnOpen(false)} items={items} />
    </div>
  );
}
