import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { RoleEditor } from "@/components/admin/role-editor";

export default async function RolesPage() {
  await requireStaff("roles.manage");
  const t = await getTranslations("admin");
  const roles = await db.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { staff: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  return (
    <div className="space-y-6">
      <PageHeader title={t("rolesTitle")} description={t("rolesSubtitle")} />
      <Card className="p-4 md:p-5">
        <h2 className="mb-4 text-lg font-bold">{t("newRole")}</h2>
        <RoleEditor />
      </Card>
      {roles.map((r) => (
        <Card key={r.id} className="p-4 md:p-5">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{r.name}</span>
              <Badge tone={r.key === "SUPER_ADMIN" ? "primary" : "neutral"}>{r.key}</Badge>
              {r.isSystem && <Badge tone="info">{t("systemRole")}</Badge>}
              <span className="text-sm text-muted">{t("membersCount", { count: r._count.staff })}</span>
            </summary>
            <div className="mt-4">
              <RoleEditor role={{ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, permissions: r.permissions.map((p) => p.permission.key) }} />
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}
