import { getTranslations, setRequestLocale, getFormatter } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { AcceptInviteForm } from "@/components/staff/staff-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { findValidInvite } from "@/server/auth/staff-auth";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ code?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("staff");
  const te = await getTranslations("errors");
  const format = await getFormatter();
  const code = (await searchParams).code?.trim();
  const invite = code ? await findValidInvite(code) : null;

  return (
    <div className="space-y-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary dark:bg-primary/15">
        <UserPlus className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{code && !invite ? t("inviteInvalidTitle") : t("inviteTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{code && !invite ? te("inviteInvalid") : t("inviteSubtitle")}</p>
      </div>
      {invite ? (
        <>
          <div className="rounded-[12px] bg-surface-2 p-3 text-sm">
            <p className="font-bold">{t("inviteRole", { role: invite.role.name })}</p>
            <p className="text-muted">{t("inviteExpires", { date: format.dateTime(invite.expiresAt, "long") })}</p>
          </div>
          <AcceptInviteForm code={code!} />
        </>
      ) : (
        <form className="space-y-3" method="get">
          <label htmlFor="code" className="text-sm font-semibold">
            {t("inviteCode")}
          </label>
          <Input id="code" name="code" defaultValue={code} placeholder="ABCD-EFGH-JKLM" className="uppercase tracking-widest" required />
          <Button type="submit" className="w-full">
            {t("checkCode")}
          </Button>
        </form>
      )}
    </div>
  );
}
