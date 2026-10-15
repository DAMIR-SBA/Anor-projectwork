import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { PageHeader } from "@/components/ui/display";
import { AdminDashboard } from "@/components/admin/dashboard";

export default async function AdminHome() {
  const staff = await requireStaff();
  const t = await getTranslations("admin");
  return (
    <div>
      <PageHeader title={t("dashboardTitle", { name: staff.user.name ?? staff.user.login })} description={t("dashboardSubtitle")} />
      <AdminDashboard permissions={[...staff.permissions]} />
    </div>
  );
}
