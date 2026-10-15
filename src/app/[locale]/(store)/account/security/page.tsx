import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { Monitor, Smartphone } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { sha256 } from "@/server/security/crypto";
import { COOKIE } from "@/server/auth/session";
import { Badge, Card, CardHeader, PageHeader, Table } from "@/components/ui/display";
import { ChangePasswordForm, LogoutEverywhereButton, PhoneVerify, PinForms, RegenerateCodesForm, SessionRevokeButton } from "@/components/account/security-forms";

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/security");
  const t = await getTranslations("security");
  const format = await getFormatter();
  const currentHash = sha256((await cookies()).get(COOKIE.USER)?.value ?? "");
  const [sessions, devices, history, codesLeft] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, kind: "USER", revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" }, include: { device: true } }),
    db.device.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, take: 10 }),
    db.loginAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.recoveryCode.count({ where: { userId: user.id, usedAt: null } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card>
        <CardHeader title={t("password")} />
        <div className="p-4 md:p-5">
          <ChangePasswordForm />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("pinTitle")} description={t("pinDescription")} action={<Badge tone={user.pinHash ? "success" : "neutral"}>{user.pinHash ? t("pinOn") : t("pinOff")}</Badge>} />
        <div className="p-4 md:p-5">
          <PinForms hasPin={!!user.pinHash} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("phoneTitle")} action={user.phone ? <Badge tone={user.phoneVerifiedAt ? "success" : "accent"}>{user.phoneVerifiedAt ? t("phoneVerified") : t("phoneNotVerified")}</Badge> : null} />
        <div className="p-4 md:p-5">
          <PhoneVerify phone={user.phone} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("recoveryTitle")} description={`${t("recoveryLeft", { count: codesLeft })} · ${t("regenerateHint")}`} />
        <div className="p-4 md:p-5">
          <RegenerateCodesForm />
        </div>
      </Card>
      <Card>
        <CardHeader title={t("linkedAccounts")} />
        <div className="flex flex-wrap gap-3 p-4 md:p-5">
          <Badge tone={user.googleId ? "success" : "neutral"}>Google · {user.googleId ? t("linked") : t("notLinked")}</Badge>
          <Badge tone={user.telegramId ? "success" : "neutral"}>Telegram · {user.telegramId ? `@${user.telegramUsername ?? user.telegramId}` : t("notLinked")}</Badge>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("sessionsTitle")} description={t("logoutEverywhereHint")} action={<LogoutEverywhereButton />} />
        <ul className="divide-y divide-border p-2 md:p-3">
          {sessions.map((s) => {
            const mobile = /Android|iOS/.test(s.device?.name ?? s.userAgent ?? "");
            return (
              <li key={s.id} className="flex items-center gap-3 px-2 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">{mobile ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.device?.name ?? "—"} {s.tokenHash === currentHash && <Badge tone="success">{t("thisDevice")}</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {s.ip} · {t("lastActive", { date: format.relativeTime(s.lastUsedAt) })}
                  </p>
                </div>
                {s.tokenHash !== currentHash && <SessionRevokeButton sessionId={s.id} />}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("devicesTitle")} />
        <ul className="divide-y divide-border p-2 md:p-3">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
              <span className="font-semibold">{d.name}</span>
              <span className="flex items-center gap-2 text-muted">
                {d.trusted && <Badge tone="success">{t("trusted")}</Badge>}
                {format.dateTime(d.lastSeenAt, "short")}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-2 md:p-3">
        <CardHeader title={t("historyTitle")} className="mb-2" />
        <Table head={[t("ip"), t("device"), "", ""]}>
          {history.map((h) => (
            <tr key={h.id}>
              <td>{h.ip}</td>
              <td className="max-w-[220px] truncate text-muted">{h.userAgent}</td>
              <td>
                <Badge tone={h.success ? "success" : "danger"}>{h.success ? t("success") : t("failed")}</Badge>
              </td>
              <td className="whitespace-nowrap text-muted">{format.dateTime(h.createdAt, "long")}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
