import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/display";
import { RotateCodeForm, TotpSetup } from "@/components/admin/staff-security";

export default async function StaffSecurityPage() {
  const staff = await requireStaff();
  const t = await getTranslations("admin");
  const sp = await db.staffProfile.findUniqueOrThrow({ where: { id: staff.staffId } });
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("securityTitle")} />
      <Card>
        <CardHeader title={t("rotateCode")} />
        <div className="p-4 md:p-5">
          <RotateCodeForm />
        </div>
      </Card>
      <Card>
        <CardHeader
          title={t("totpTitle")}
          description={staff.role === "SUPER_ADMIN" ? t("totpRecommended") : undefined}
          action={<Badge tone={sp.totpEnabled ? "success" : "neutral"}>{sp.totpEnabled ? t("totpOn") : t("totpOff")}</Badge>}
        />
        <div className="p-4 md:p-5">
          <TotpSetup enabled={sp.totpEnabled} />
        </div>
      </Card>
    </div>
  );
}
