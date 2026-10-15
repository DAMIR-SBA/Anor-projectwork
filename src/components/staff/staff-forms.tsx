"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { staffLoginAction, acceptInviteAction, demoStaffLoginAction } from "@/server/actions/staff";
import type { ActionResult } from "@/server/action";

const fe = (s: ActionResult | null, f: string) => (s && !s.ok ? s.fieldErrors?.[f] : undefined);
const dv = (s: ActionResult | null, f: string) => (s && !s.ok ? s.values?.[f] : undefined);

export function StaffLoginForm() {
  const t = useTranslations("staff");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(staffLoginAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label={ta("login")} htmlFor="login" error={fe(state, "login")}>
        <Input id="login" name="login" defaultValue={dv(state, "login")} autoComplete="username" required autoFocus />
      </Field>
      <Field label={ta("password")} htmlFor="password" error={fe(state, "password")}>
        <PasswordInput id="password" name="password" autoComplete="current-password" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Field label={t("accessCode")} htmlFor="accessCode" hint={t("accessCodeHint")} error={fe(state, "accessCode")}>
        <PasswordInput id="accessCode" name="accessCode" autoComplete="off" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Field label={t("totp")} htmlFor="totp" hint={t("totpHint")}>
        <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {ta("signIn")}
      </Button>
    </form>
  );
}

export function DemoStaffButtons() {
  const t = useTranslations("staff");
  const toast = useToast();
  const [pending, start] = useTransition();
  const roles = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "MODERATOR", "FINANCE", "COURIER"] as const;
  return (
    <div className="rounded-[16px] border border-dashed border-accent bg-accent-50 p-4 dark:bg-accent/10">
      <p className="mb-3 text-sm font-bold">{t("demoStaff")}</p>
      <div className="grid grid-cols-2 gap-2">
        {roles.map((role) => (
          <Button
            key={role}
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await demoStaffLoginAction({ role });
                if (r && !r.ok) toast.error(r.error);
              })
            }
          >
            {role}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AcceptInviteForm({ code }: { code: string }) {
  const t = useTranslations("staff");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="code" value={code} />
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : (fe(state, "code") ?? null)} />
      <Field label={ta("login")} htmlFor="login" hint={ta("loginHint")} error={fe(state, "login")} required>
        <Input id="login" name="login" defaultValue={dv(state, "login")} autoComplete="username" required />
      </Field>
      <Field label={ta("name")} htmlFor="name" error={fe(state, "name")} required>
        <Input id="name" name="name" defaultValue={dv(state, "name")} autoComplete="name" required />
      </Field>
      <Field label={ta("password")} htmlFor="password" error={fe(state, "password")} required>
        <PasswordInput id="password" name="password" autoComplete="new-password" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Field label={ta("confirmPassword")} htmlFor="confirm" error={fe(state, "confirm")} required>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Field label={t("chooseAccessCode")} htmlFor="accessCode" hint={t("chooseAccessCodeHint")} error={fe(state, "accessCode")} required>
        <PasswordInput id="accessCode" name="accessCode" autoComplete="off" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Field label={t("confirmAccessCode")} htmlFor="accessCodeConfirm" error={fe(state, "accessCodeConfirm")} required>
        <PasswordInput id="accessCodeConfirm" name="accessCodeConfirm" autoComplete="off" required showLabel={ta("showPassword")} hideLabel={ta("hidePassword")} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("join")}
      </Button>
    </form>
  );
}
