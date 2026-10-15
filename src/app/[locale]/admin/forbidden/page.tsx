import { getTranslations } from "next-intl/server";
import { ShieldX } from "lucide-react";
import { EmptyState } from "@/components/ui/display";

export default async function Forbidden() {
  const t = await getTranslations("admin");
  return <EmptyState icon={<ShieldX className="h-8 w-8" />} title={t("forbiddenTitle")} description={t("forbiddenText")} className="card" />;
}
