"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { StrengthMeter } from "@/components/ui/interactive";
import { useToast } from "@/components/ui/toast";
import {
  changePasswordAction,
  setPinAction,
  removePinAction,
  regenerateRecoveryCodesAction,
  logoutEverywhereAction,
  revokeSessionAction,
  sendOtpAction,
  verifyPhoneAction,
} from "@/server/actions/auth";
import type { ActionResult } from "@/server/action";

const fe = (s: ActionResult | null, f: string) => (s && !s.ok ? s.fieldErrors?.[f] : undefined);

export function ChangePasswordForm() {
  const t = useTranslations("security");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const [pw, setPw] = useState("");
  return (
    <form action={action} className="grid max-w-md gap-3">
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      {state?.ok && <FormSuccess message={t("passwordChanged")} />}
      <Field label={t("currentPassword")} htmlFor="sec-current" error={fe(state, "current")}>
        <PasswordInput id="sec-current" name="current" autoComplete="current-password" />
      </Field>
      <Field label={ta("newPassword")} htmlFor="sec-new" error={fe(state, "password")}>
        <PasswordInput id="sec-new" name="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <StrengthMeter value={pw} labels={[ta("strength.0"), ta("strength.1"), ta("strength.2"), ta("strength.3"), ta("strength.4")]} />
      <Field label={ta("confirmPassword")} htmlFor="sec-confirm" error={fe(state, "confirm")}>
        <PasswordInput id="sec-confirm" name="confirm" autoComplete="new-password" />
      </Field>
      <Button type="submit" loading={pending} className="justify-self-start">
        {t("changePassword")}
      </Button>
    </form>
  );
}

export function PinForms({ hasPin }: { hasPin: boolean }) {
  const t = useTranslations("security");
  const ta = useTranslations("auth");
  const [setState, setAction, setting] = useActionState(setPinAction, null);
  const [rmState, rmAction, removing] = useActionState(removePinAction, null);
  const [mode, setMode] = useState<"idle" | "set" | "remove">("idle");
  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        {setState?.ok && <FormSuccess message={t("pinSaved")} />}
        {rmState?.ok && <FormSuccess message={t("pinRemoved")} />}
        <Button variant={hasPin ? "outline" : "primary"} onClick={() => setMode("set")}>
          {hasPin ? t("changePin") : t("setPin")}
        </Button>
        {hasPin && (
          <Button variant="ghost" className="text-danger" onClick={() => setMode("remove")}>
            {t("removePin")}
          </Button>
        )}
      </div>
    );
  }
  if (mode === "remove") {
    return (
      <form action={async (fd) => { rmAction(fd); setMode("idle"); }} className="grid max-w-sm gap-3">
        <FormError message={rmState && !rmState.ok ? rmState.error : null} />
        <Field label={ta("password")} htmlFor="pin-rm-pw">
          <PasswordInput id="pin-rm-pw" name="password" autoComplete="current-password" required />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="danger" loading={removing}>
            {t("removePin")}
          </Button>
          <Button variant="ghost" onClick={() => setMode("idle")}>
            ✕
          </Button>
        </div>
      </form>
    );
  }
  return (
    <form action={async (fd) => { setAction(fd); }} className="grid max-w-sm gap-3">
      <FormError message={setState && !setState.ok && !setState.fieldErrors ? setState.error : null} />
      {setState?.ok && <FormSuccess message={t("pinSaved")} />}
      <Field label={ta("password")} htmlFor="pin-pw" error={fe(setState, "password")}>
        <PasswordInput id="pin-pw" name="password" autoComplete="current-password" required />
      </Field>
      <Field label={t("newPin")} htmlFor="pin-new" error={fe(setState, "pin")}>
        <Input id="pin-new" name="pin" type="password" inputMode="numeric" maxLength={6} pattern="\d{6}" required className="tracking-[0.4em]" />
      </Field>
      <Field label={t("confirmPin")} htmlFor="pin-confirm" error={fe(setState, "confirm")}>
        <Input id="pin-confirm" name="confirm" type="password" inputMode="numeric" maxLength={6} pattern="\d{6}" required className="tracking-[0.4em]" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={setting}>
          {t("setPin")}
        </Button>
        <Button variant="ghost" onClick={() => setMode("idle")}>
          ✕
        </Button>
      </div>
    </form>
  );
}

export function PhoneVerify({ phone }: { phone: string | null }) {
  const t = useTranslations("security");
  const ta = useTranslations("auth");
  const toast = useToast();
  const [value, setValue] = useState(phone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="grid max-w-md gap-3">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} type="tel" placeholder="+998 90 123 45 67" aria-label={ta("phone")} />
        <Button
          variant="secondary"
          loading={pending && !sent}
          onClick={() =>
            start(async () => {
              const r = await sendOtpAction({ phone: value, purpose: "VERIFY_PHONE" });
              if (!r.ok) return void toast.error(r.fieldErrors?.phone ?? r.error);
              setSent(true);
              const demo = (r.data as { demoCode?: string } | undefined)?.demoCode;
              toast.success(ta("codeSent"), demo ? ta("demoCode", { code: demo }) : undefined);
            })
          }
        >
          {ta("sendCode")}
        </Button>
      </div>
      {sent && (
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="000000" aria-label={ta("smsCode")} />
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await verifyPhoneAction({ phone: value, code });
                if (!r.ok) return void toast.error(r.fieldErrors?.code ?? r.error);
                toast.success(t("phoneSaved"));
                setSent(false);
              })
            }
          >
            {ta("verify")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function RegenerateCodesForm() {
  const t = useTranslations("security");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(regenerateRecoveryCodesAction, null);
  return (
    <form action={action} className="flex max-w-md flex-wrap items-end gap-2">
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label={ta("password")} htmlFor="rc-pw" className="min-w-52 flex-1">
        <PasswordInput id="rc-pw" name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="outline" loading={pending}>
        {t("regenerate")}
      </Button>
    </form>
  );
}

export function SessionRevokeButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations("security");
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" className="text-danger" loading={pending} onClick={() => start(async () => void (await revokeSessionAction({ sessionId })))}>
      {t("endSession")}
    </Button>
  );
}

export function LogoutEverywhereButton() {
  const t = useTranslations("security");
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" loading={pending} onClick={() => start(async () => void (await logoutEverywhereAction({})))}>
      {t("logoutEverywhere")}
    </Button>
  );
}
