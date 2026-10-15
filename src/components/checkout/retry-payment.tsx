"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { retryPaymentAction } from "@/server/actions/checkout";

export function RetryPayment({ groupId }: { groupId: string }) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await retryPaymentAction({ groupId, method: "CLICK" });
          if (!r.ok) return void toast.error(r.error);
          const url = (r.data as { redirectUrl: string | null }).redirectUrl;
          if (url) router.push(url);
          else router.refresh();
        })
      }
    >
      {t("payNow")}
    </Button>
  );
}
