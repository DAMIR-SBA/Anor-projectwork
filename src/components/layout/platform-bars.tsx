import { getTranslations } from "next-intl/server";
import { Megaphone, PauseCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { platformSettings } from "@/server/services/platform";
import { activeAnnouncement, pickText } from "@/lib/platform";
import { cn } from "@/lib/cn";

const TONE = { info: "bg-info text-white", promo: "bg-accent text-[#1A1A1F]", warning: "bg-[#1A1A1F] text-white" } as const;

/** Site-wide announcement and "orders paused" notice, both set in /admin/settings. */
export async function PlatformBars({ locale }: { locale: string }) {
  const s = await platformSettings();
  const t = await getTranslations("common");
  const a = activeAnnouncement(s);
  const paused = s.ordersPaused.enabled ? pickText(s.ordersPaused.messageUz, s.ordersPaused.messageRu, locale) || t("ordersPaused") : null;
  if (!a && !paused) return null;
  const text = a ? pickText(a.textUz, a.textRu, locale) : "";
  return (
    <div>
      {paused && (
        <p role="status" className="flex items-center justify-center gap-2 bg-danger px-4 py-2 text-center text-sm font-semibold text-white">
          <PauseCircle className="h-4 w-4 shrink-0" /> {paused}
        </p>
      )}
      {a && (
        <p className={cn("px-4 py-2 text-center text-sm font-semibold", TONE[a.tone])}>
          {a.href ? (
            <Link href={a.href} className="inline-flex items-center gap-2 hover:underline">
              <Megaphone className="h-4 w-4 shrink-0" /> {text} →
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Megaphone className="h-4 w-4 shrink-0" /> {text}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
