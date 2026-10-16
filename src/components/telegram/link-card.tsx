"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { linkTelegramAction, unlinkTelegramAction } from "@/server/actions/telegram";

/** Link the buyer account (main bot) or the active shop (seller bot) to Telegram. */
export function TelegramLinkCard({ shop = false, linked, username }: { shop?: boolean; linked: boolean; username?: string | null }) {
  const t = useTranslations("telegramBot");
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Send className="h-5 w-5 text-[#2AABEE]" /> {shop ? t("cardSellerTitle") : t("cardTitle")}
      </h2>
      <p className="text-sm text-muted">{shop ? t("cardSellerText") : t("cardText")}</p>
      {linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-success">{username ? t("linkedAs", { username }) : t("linkedOk")}</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await unlinkTelegramAction({ shop });
                if (!res.ok) return void toast.error(res.error ?? "");
                router.refresh();
              })
            }
          >
            {t("unlink")}
          </Button>
        </div>
      ) : (
        <>
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await linkTelegramAction({ shop });
                if (!res.ok) return void toast.error(res.error ?? "");
                const d = res.data as { token: string; url: string | null };
                setToken(d.token);
                if (d.url) window.open(d.url, "_blank", "noopener");
              })
            }
          >
            {t("link")}
          </Button>
          {token && (
            <p className="rounded-[10px] bg-surface-2 p-3 text-sm">
              {t("linkManual")} <code className="break-all font-bold">/start {token}</code>
            </p>
          )}
        </>
      )}
    </section>
  );
}
