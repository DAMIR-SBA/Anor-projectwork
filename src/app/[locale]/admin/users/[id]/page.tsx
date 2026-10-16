import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Ban, KeyRound, LogOut, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { userDetail } from "@/server/services/admin/fraud";
import { resetLockoutAction, restoreUserAction, revokeUserSessionsAction, suspendUserAction } from "@/server/actions/admin-risk";
import { Avatar, Badge, Card, KeyValue, PageHeader } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { WalletAdjust } from "@/components/admin/user-tools";
import { ORDER_TONE } from "@/components/admin/tones";
import { formatUZS } from "@/lib/money";
import { fmtDateTime, fmtDay } from "@/lib/format-date";

export default async function AdminUserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("users.view");
  const t = await getTranslations("adminUsers");
  const to = await getTranslations("orders");
  const u = await userDetail(id);
  if (!u) notFound();
  const canManage = staff.permissions.has("users.manage") && !u.staffProfile;
  const fmt = (v: number) => formatUZS(v, locale);
  const locked = u.lockedUntil && u.lockedUntil > new Date();
  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="text-sm font-semibold text-primary hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={u.name ?? u.login} src={u.avatarUrl} size={44} />
            <span>
              {u.name ?? u.login}
              <span className="mt-1 flex flex-wrap gap-1.5 text-sm font-normal">
                <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{t(`statuses.${u.status}`)}</Badge>
                <Badge>{u.loyaltyTier}</Badge>
                {locked && <Badge tone="danger">{t("locked")}</Badge>}
                {u.staffProfile && <Badge tone="info">{t("staff")}</Badge>}
              </span>
            </span>
          </span>
        }
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              {u.status === "ACTIVE" ? (
                <ActionButton action={suspendUserAction} input={{ id: u.id }} variant="danger" icon={<Ban className="h-4 w-4" />} label={t("suspend")} reason={{ title: t("suspendTitle"), hint: t("suspendHint") }} />
              ) : (
                <ActionButton action={restoreUserAction} input={{ id: u.id }} icon={<RotateCcw className="h-4 w-4" />} label={t("restore")} confirm={t("restoreConfirm")} />
              )}
              {(locked || u.failedLoginCount > 0) && <ActionButton action={resetLockoutAction} input={{ id: u.id }} icon={<KeyRound className="h-4 w-4" />} label={t("resetLockout")} />}
              {u.sessions.length > 0 && <ActionButton action={revokeUserSessionsAction} input={{ id: u.id }} icon={<LogOut className="h-4 w-4" />} label={t("revokeSessions")} confirm={t("revokeConfirm")} />}
            </div>
          )
        }
      />
      {u.staffProfile && <p className="rounded-[12px] bg-info/10 p-3 text-sm">{t("staffNote")}</p>}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="p-5">
            <KeyValue
              items={[
                [t("login"), `@${u.login}`],
                [t("phone"), u.phone ?? "—"],
                [t("email"), u.email ?? "—"],
                [t("registered"), fmtDateTime(u.createdAt.toISOString(), locale)],
                [t("lastSeen"), u.lastSeenAt ? fmtDateTime(u.lastSeenAt.toISOString(), locale) : "—"],
                [t("ordersStat"), t("ordersValue", { orders: u.stats.orders, spend: fmt(u.stats.spend), returns: u.stats.returns })],
                [t("wallet"), fmt(u.wallet?.balance ?? 0)],
                [t("bonus"), String(u.bonusBalance)],
                [t("shops"), u.shops.length ? u.shops.map((s) => s.name).join(", ") : "—"],
              ]}
            />
            {u.shops.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {u.shops.map((s) => (
                  <Link key={s.id} href={`/admin/moderation/shops/${s.id}`} className="text-primary underline">
                    {s.name}
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("recentOrders")}</h2>
            <ul className="divide-y divide-border text-sm">
              {u.recent.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold underline">
                    №{o.number}
                  </Link>
                  <Badge tone={ORDER_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
                  <span className="ml-auto tabular">{fmt(o.total)}</span>
                  <span className="text-[13px] text-muted">{fmtDay(o.createdAt.toISOString(), locale)}</span>
                </li>
              ))}
              {!u.recent.length && <li className="py-2 text-muted">—</li>}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("history")}</h2>
            <ul className="space-y-1.5 text-sm">
              {u.audits.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{fmtDateTime(a.createdAt.toISOString(), locale)}</span> <b>{a.action}</b> <span className="text-muted">{a.actorLogin ?? "system"}</span>
                  {a.ip && <span className="font-mono text-[12px] text-muted">{a.ip}</span>}
                </li>
              ))}
              {!u.audits.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          {staff.permissions.has("finance.manage") && !u.staffProfile && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("walletAdjust")}</h2>
              <WalletAdjust userId={u.id} />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("sessions", { count: u.sessions.length })}</h2>
            <ul className="space-y-1.5 text-sm">
              {u.sessions.map((s) => (
                <li key={s.id}>
                  {s.kind} · {fmtDateTime(s.createdAt.toISOString(), locale)}
                  <span className="block font-mono text-[12px] text-muted">{s.ip ?? "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("devices")}</h2>
            <ul className="space-y-1.5 text-sm">
              {u.devices.map((d) => (
                <li key={d.id}>
                  {d.name ?? t("unknownDevice")} {d.trusted && <Badge tone="success">{t("trusted")}</Badge>}
                  <span className="block text-[12px] text-muted">
                    {fmtDateTime(d.lastSeenAt.toISOString(), locale)} · <span className="font-mono">{d.fingerprint.slice(0, 10)}…</span>
                  </span>
                </li>
              ))}
              {!u.devices.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
          {u.fraudFlags.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("flags")}</h2>
              <ul className="space-y-1.5 text-sm">
                {u.fraudFlags.map((f) => (
                  <li key={f.id}>
                    <Link href={`/admin/fraud?status=${f.status}`} className="font-semibold underline">
                      {f.type}
                    </Link>{" "}
                    · {f.status} · {f.score}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
