import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cookieConsent, deletionBlockers } from "@/server/services/privacy";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { CookieSettings, DeleteAccount } from "@/components/privacy/privacy-tools";
import { buttonClasses } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/privacy");
  const t = await getTranslations("privacy");
  const [consents, consent, blockers, u] = await Promise.all([
    db.consentRecord.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    cookieConsent(),
    deletionBlockers(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, login: true } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="p-5">
        <h2 className="mb-2 font-bold">{t("documents")}</h2>
        <ul className="space-y-1.5 text-sm">
          {(["privacy", "terms", "cookies"] as const).map((d) => (
            <li key={d}>
              <Link href={`/legal/${d}`} className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                <FileText className="h-4 w-4" /> {t(`docs.${d}`)}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("cookieSettings")}</h2>
        <CookieSettings initial={consent} />
      </Card>
      <Card className="p-5">
        <h2 className="mb-1 font-bold">{t("exportTitle")}</h2>
        <p className="mb-3 text-sm text-muted">{t("exportText")}</p>
        <a href="/api/account/export" download className={buttonClasses("secondary", "sm")}>
          <Download className="h-4 w-4" /> {t("exportButton")}
        </a>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("consentHistory")}</h2>
        <ul className="divide-y divide-border text-sm">
          {consents.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{t(`consentTypes.${c.type}`)}</span>
              <span className="flex items-center gap-2">
                <Badge tone={c.granted ? "success" : "neutral"}>{c.granted ? t("granted") : t("declined")}</Badge>
                <span className="text-xs text-muted">{fmtDateTime(c.createdAt.toISOString(), locale)}</span>
              </span>
            </li>
          ))}
          {!consents.length && <li className="py-2 text-muted">—</li>}
        </ul>
      </Card>
      <Card className="border-danger/30 p-5">
        <h2 className="mb-1 font-bold text-danger">{t("deleteTitle")}</h2>
        <p className="mb-3 text-sm text-muted">{t("deleteText")}</p>
        <DeleteAccount hasPassword={!!u.passwordHash} login={u.login} blockers={blockers} />
      </Card>
    </div>
  );
}
