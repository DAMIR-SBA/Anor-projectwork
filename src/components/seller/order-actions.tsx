"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, PackageCheck, Printer, Truck, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { advanceOrdersAction } from "@/server/actions/seller-orders";
import { CancelDialog, DeliverDialog } from "./orders-board";

const NEXT: Record<string, "CONFIRMED" | "PACKED" | "SHIPPED" | null> = { PLACED: "CONFIRMED", CONFIRMED: "PACKED", PACKED: "SHIPPED" };

export function SellerOrderActions({ order }: { order: { id: string; number: string; status: string; fulfillment: string } }) {
  const t = useTranslations("sellerOrders");
  const router = useRouter();
  const toast = useToast();
  const [cancel, setCancel] = useState(false);
  const [deliver, setDeliver] = useState(false);
  const [pending, start] = useTransition();
  const next = NEXT[order.status];
  const fboLocked = order.fulfillment === "FBO" && next !== "CONFIRMED";
  return (
    <div className="flex flex-wrap gap-2">
      {next && !fboLocked && (
        <Button
          loading={pending}
          leftIcon={next === "SHIPPED" ? <Truck className="h-4 w-4" /> : next === "PACKED" ? <PackageCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          onClick={() =>
            start(async () => {
              const res = await advanceOrdersAction({ ids: [order.id], to: next });
              if (!res.ok || (res.data as { failed: number }).failed) return toast.error(res.ok ? t("bulkFailed", { count: 1 }) : res.error);
              router.refresh();
            })
          }
        >
          {t(`actions.${next}`)}
        </Button>
      )}
      {order.fulfillment === "DBS" && order.status === "SHIPPED" && (
        <Button variant="success" onClick={() => setDeliver(true)}>
          {t("deliver")}
        </Button>
      )}
      {["CONFIRMED", "PACKED", "SHIPPED"].includes(order.status) && (
        <a href={`/seller/print/slips?ids=${order.id}`} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border px-4 font-semibold hover:bg-surface-2">
          <Printer className="h-4 w-4" /> {t("printSlip")}
        </a>
      )}
      {["PLACED", "CONFIRMED", "PACKED"].includes(order.status) && (
        <Button variant="ghost" className="text-danger" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancel(true)}>
          {t("cancel")}
        </Button>
      )}
      {cancel && <CancelDialog order={order} onClose={() => setCancel(false)} />}
      {deliver && <DeliverDialog order={order} onClose={() => setDeliver(false)} />}
    </div>
  );
}
