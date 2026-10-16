"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { matchPriceAction } from "@/server/actions/seller-growth";
import { formatUZS } from "@/lib/money";

export function MatchPriceButton({ productId, price }: { productId: string; price: number }) {
  const t = useTranslations("sellerCompetitors");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          if (!window.confirm(t("matchConfirm", { price: formatUZS(price, locale) }))) return;
          const res = await matchPriceAction({ productId, price });
          if (!res.ok) return toast.error(res.error);
          toast.success(t("matched"));
          router.refresh();
        })
      }
    >
      {t("match", { price: formatUZS(price, locale) })}
    </Button>
  );
}
