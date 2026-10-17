import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Avatar, Badge, Card, CardHeader, PageHeader, Table } from "@/components/ui/display";
import { InviteForm, PromoteForm, RevokeInviteButton, StaffRowActions } from "@/components/admin/staff-manage";
import { Link } from "@/i18n/navigation";

export default async function StaffPage() {
  const me = await requireStaff("staff.manage");
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const [staff, roles, invites] = await Promise.all([
    db.staffProfile.findMany({
      include: { user: { select: { id: true, login: true, name: true, sessions: { where: { kind: "STAFF" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } }, role: true, overrides: { include: { permission: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    db.staffInvite.findMany({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, include: { role: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));
  const statusTone = { ACTIVE: "success", SUSPENDED: "accent", REMOVED: "danger" } as const;
  const statusLabel = { ACTIVE: t("statusActive"), SUSPENDED: t("statusSuspended"), REMOVED: t("statusRemoved") };

  return (
    <div className="space-y-6">
      <PageHeader title={t("staffList")} description={t("staffSubtitle")} actions={<Link href="/admin/staff/roles" className="text-sm font-semibold text-brand-ink">{t("rolesTitle")} →</Link>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-2 md:p-3">
          <Table head={[t("member"), t("role"), "", t("lastLogin"), ""]}>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.user.name ?? s.user.login} size={36} />
                    <div>
                      <p className="font-semibold">
                        {s.user.name ?? s.user.login} {s.userId === me.user.id && <span className="text-xs text-muted">({t("you")})</span>}
                      </p>
                      <p className="text-xs text-muted">@{s.user.login}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge tone={s.role.key === "SUPER_ADMIN" ? "primary" : "neutral"}>{s.role.key}</Badge>
                  {s.overrides.length > 0 && <span className="ml-1 text-xs text-muted">+{s.overrides.length}</span>}
                </td>
                <td>
                  <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                </td>
                <td className="text-muted">{s.user.sessions[0] ? format.relativeTime(s.user.sessions[0].createdAt) : "—"}</td>
                <td>
                  <StaffRowActions
                    staff={{ id: s.id, role: s.role.key, status: s.status, overrides: s.overrides.map((o) => ({ permission: o.permission.key, effect: o.effect })) }}
                    roles={roleOptions}
                    isSelf={s.userId === me.user.id}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("invite")} />
            <div className="p-4 md:p-5">
              <InviteForm roles={roleOptions} />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("invites")} />
            <div className="p-4 md:p-5">
              {invites.length === 0 ? (
                <p className="text-sm text-muted">{t("noInvites")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <Badge>{i.role.key}</Badge>
                        <p className="mt-1 text-xs text-muted">
                          {format.dateTime(i.expiresAt, "long")} {i.note ? `· ${i.note}` : ""}
                        </p>
                      </div>
                      <RevokeInviteButton inviteId={i.id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("promote")} />
            <div className="p-4 md:p-5">
              <PromoteForm roles={roleOptions} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
