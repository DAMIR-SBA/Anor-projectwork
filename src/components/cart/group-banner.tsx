"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/interactive";

export function GroupCartBanner({ link }: { code: string; link: string }) {
  const t = useTranslations("cart");
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-2 p-4">
      <div>
        <p className="font-bold">{t("groupShare")}</p>
        <p className="break-all text-sm text-muted">{link}</p>
      </div>
      <CopyButton value={link} />
    </div>
  );
}
