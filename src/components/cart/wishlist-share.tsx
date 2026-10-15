"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Share2 } from "lucide-react";
import { Switch } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/interactive";
import { setWishlistPublicAction } from "@/server/actions/cart";

export function WishlistShare({ isPublic, link }: { isPublic: boolean; link: string }) {
  const t = useTranslations("wishlist");
  const [on, setOn] = useState(isPublic);
  const [, start] = useTransition();
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <Share2 className="h-5 w-5 text-primary" />
      <Switch
        checked={on}
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          start(async () => void (await setWishlistPublicAction({ isPublic: v })));
        }}
        label={t("public")}
      />
      {on && (
        <span className="flex min-w-0 items-center gap-2 rounded-[10px] bg-surface-2 px-3 py-1.5 text-sm">
          <span className="truncate">{link}</span>
          <CopyButton value={link} />
        </span>
      )}
    </div>
  );
}
