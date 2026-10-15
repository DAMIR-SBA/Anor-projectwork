"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { rotateAccessCodeAction, startTotpAction, enableTotpAction, disableTotpAction } from "@/server/actions/staff";

export function RotateCodeForm() {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState(rotateAccessCodeAction, null);
  const fe = (f: string) => (state && !state.ok ? state.fieldErrors?.[f] : undefined);
  return (
    <form action={action} className="space-y-3">
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      {state?.ok && <FormSuccess message={t("codeRotated")} />}
      <Field label={t("currentCode")} htmlFor="current" error={fe("current")}>
        <PasswordInput id="current" name="current" autoComplete="off" required />
      </Field>
      <Field label={t("newCode")} htmlFor="next" error={fe("next")}>
        <PasswordInput id="next" name="next" autoComplete="off" required />
      </Field>
      <Field label={t("confirmCode")} htmlFor="confirm" error={fe("confirm")}>
        <PasswordInput id="confirm" name="confirm" autoComplete="off" required />
      </Field>
      <Button type="submit" loading={pending}>
        {t("rotateCode")}
      </Button>
    </form>
  );
}

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const t = useTranslations("admin");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [starting, start] = useTransition();
  const [enableState, enable, enabling] = useActionState(enableTotpAction, null);
  const [disableState, disable, disabling] = useActionState(disableTotpAction, null);

  if (enabled) {
    return (
      <form action={disable} className="flex flex-wrap items-end gap-2">
        <FormError message={disableState && !disableState.ok ? disableState.error : null} />
        <Field label="TOTP" htmlFor="totp-off" className="w-40">
          <Input id="totp-off" name="code" inputMode="numeric" maxLength={6} required />
        </Field>
        <Button type="submit" variant="outline" loading={disabling}>
          {t("totpDisable")}
        </Button>
      </form>
    );
  }
  if (!setup || enableState?.ok) {
    return (
      <Button
        loading={starting}
        onClick={() =>
          start(async () => {
            const r = await startTotpAction({});
            if (r.ok) setSetup(r.data as { secret: string; qr: string });
          })
        }
      >
        {t("totpStart")}
      </Button>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("totpScan")}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="TOTP QR" width={180} height={180} className="rounded-xl bg-white p-2" />
      <p className="text-xs text-muted">
        {t("totpSecret")} <code className="select-all font-bold">{setup.secret}</code>
      </p>
      <form action={enable} className="flex flex-wrap items-end gap-2">
        <FormError message={enableState && !enableState.ok ? enableState.error : null} />
        <Input name="code" inputMode="numeric" maxLength={6} className="w-40" required aria-label="TOTP" />
        <Button type="submit" loading={enabling}>
          {t("totpEnable")}
        </Button>
      </form>
    </div>
  );
}
