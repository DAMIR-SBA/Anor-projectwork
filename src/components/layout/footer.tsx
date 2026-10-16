import { getTranslations } from "next-intl/server";
import { Send, Headset, Phone, Mail } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { platformSettings } from "@/server/services/platform";
import { telegramUrl } from "@/lib/platform";

export async function Footer() {
  const t = await getTranslations("footer");
  const tb = await getTranslations("brand");
  const { support } = await platformSettings();
  const tg = telegramUrl(support.telegram);
  const cols = [
    {
      title: t("buyers"),
      links: [
        ["/help/how-to-order", t("howToOrder")],
        ["/help/delivery", t("delivery")],
        ["/help/returns", t("returns")],
        ["/help/payment", t("payment")],
        ["/pvz", "PVZ"],
        ["/trade-in", t("tradeIn")],
        ["/live", t("live")],
      ],
    },
    {
      title: t("sellers"),
      links: [
        ["/seller/onboarding", t("sellOnAnor")],
        ["/help/sellers", t("sellerHelp")],
        ["/developers", t("sellerApi")],
        ["/seller/academy", t("training")],
      ],
    },
    {
      title: t("company"),
      links: [
        ["/help/about", t("about")],
        ["/legal/privacy", t("privacy")],
        ["/legal/terms", t("terms")],
        ["/legal/cookies", t("cookies")],
      ],
    },
  ];
  const methods = ["Click", "Payme", "Uzcard", "Humo", "Visa", "Mastercard"];
  return (
    <footer className="mt-12 border-t border-border bg-surface pb-24 md:pb-0">
      <div className="container-page grid gap-10 py-10 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <AnorLogo height={36} />
          <p className="max-w-xs text-sm text-muted">{tb("tagline")}</p>
          <Link href="/help" className="inline-flex items-center gap-2 text-sm font-semibold">
            <Headset className="h-4 w-4 text-primary" /> {t("support")}
          </Link>
          {support.phone && (
            <a href={`tel:${support.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm font-semibold tabular">
              <Phone className="h-4 w-4 text-primary" /> {support.phone}
            </a>
          )}
          {support.email && (
            <a href={`mailto:${support.email}`} className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-primary" /> {support.email}
            </a>
          )}
          {tg && (
            <a href={tg} className="flex items-center gap-2 text-sm font-semibold" rel="noopener noreferrer" target="_blank">
              <Send className="h-4 w-4 text-[#2AABEE]" /> {t("app")}
            </a>
          )}
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{c.title}</h2>
            <ul className="space-y-2 text-[15px]">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-3 py-5 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p>{t("rights", { year: new Date().getFullYear() })}</p>
          <ul className="flex flex-wrap gap-2" aria-label={t("paymentMethods")}>
            {methods.map((m) => (
              <li key={m} className="rounded-md border border-border px-2 py-0.5 text-xs font-bold">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
