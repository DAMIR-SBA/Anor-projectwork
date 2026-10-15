"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { StrengthMeter } from "@/components/ui/interactive";
import { useToast } from "@/components/ui/toast";
import { loginAction, registerAction, pinAction, resetPasswordAction, sendOtpAction, demoLoginAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/action";

function fe(state: ActionResult | null, field: string) {
  return state && !state.ok ? state.fieldErrors?.[field] : undefined;
}

function dv(state: ActionResult | null, field: string) {
  return state && !state.ok ? state.values?.[field] : undefined;
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label={t("identifier")} htmlFor="identifier" error={fe(state, "identifier")}>
        <Input id="identifier" name="identifier" defaultValue={dv(state, "identifier")} autoComplete="username" placeholder={t("identifierPlaceholder")} required autoFocus />
      </Field>
      <Field label={t("password")} htmlFor="password" error={fe(state, "password")}>
        <PasswordInput id="password" name="password" autoComplete="current-password" required showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/auth/forgot" className="text-sm font-semibold text-brand-ink hover:underline">
          {t("forgot")}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("signIn")}
      </Button>
    </form>
  );
}

export function RegisterForm({ next, referral }: { next?: string; referral?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(registerAction, null);
  const [pw, setPw] = useState("");
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label={t("login")} htmlFor="login" hint={t("loginHint")} error={fe(state, "login")} required>
        <Input id="login" name="login" defaultValue={dv(state, "login")} autoComplete="username" placeholder="anor_ali07" required minLength={4} maxLength={20} pattern="[A-Za-z0-9_]{4,20}" autoFocus />
      </Field>
      <Field label={t("name")} htmlFor="name" error={fe(state, "name")} required>
        <Input id="name" name="name" defaultValue={dv(state, "name")} autoComplete="name" required />
      </Field>
      <Field label={t("password")} htmlFor="password" error={fe(state, "password")} required>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <StrengthMeter value={pw} labels={[t("strength.0"), t("strength.1"), t("strength.2"), t("strength.3"), t("strength.4")]} />
      <Field label={t("confirmPassword")} htmlFor="confirm" error={fe(state, "confirm")} required>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
      </Field>
      <Field label={t("phone")} htmlFor="phone" hint={t("phoneHint")} error={fe(state, "phone")}>
        <Input id="phone" name="phone" defaultValue={dv(state, "phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
      </Field>
      <Field label={t("referral")} htmlFor="referral" error={fe(state, "referral")}>
        <Input id="referral" name="referral" defaultValue={dv(state, "referral") ?? referral} maxLength={12} />
      </Field>
      <div className="space-y-2">
        <Checkbox
          name="terms"
          required
          label={t.rich("terms", {
            terms: (c) => (
              <Link href="/legal/terms" className="font-semibold text-brand-ink underline" target="_blank">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/legal/privacy" className="font-semibold text-brand-ink underline" target="_blank">
                {c}
              </Link>
            ),
          })}
        />
        {fe(state, "terms") && <p className="text-sm text-danger">{fe(state, "terms")}</p>}
        <Checkbox name="marketing" label={t("marketing")} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("createAccount")}
      </Button>
    </form>
  );
}

export function PinForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(pinAction, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label={t("pin")} htmlFor="pin" error={fe(state, "pin")}>
        <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="text-center text-2xl tracking-[0.6em]" required autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {t("verify")}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const toast = useToast();
  const [method, setMethod] = useState<"otp" | "recovery">("otp");
  const [phone, setPhone] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, startSend] = useTransition();
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);
  const [pw, setPw] = useState("");

  const sendCode = () =>
    startSend(async () => {
      const r = await sendOtpAction({ phone, purpose: "RESET_PASSWORD" });
      if (!r.ok) {
        toast.error(r.fieldErrors?.phone ?? r.error);
        return;
      }
      const demo = (r.data as { demoCode?: string } | undefined)?.demoCode;
      toast.success(t("codeSent"), demo ? t("demoCode", { code: demo }) : undefined);
      setCooldown(60);
      const id = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(id), 0) : c - 1)), 1000);
    });

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-3 p-1">
        {(["otp", "recovery"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m)} className={`rounded-[10px] py-2 text-sm font-semibold ${method === m ? "bg-surface shadow-[var(--shadow-soft)]" : "text-muted"}`}>
            {m === "otp" ? t("viaSms") : t("viaRecovery")}
          </button>
        ))}
      </div>
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="method" value={method} />
        <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
        {method === "otp" ? (
          <>
            <Field label={t("phone")} htmlFor="phone" error={fe(state, "phone")}>
              <div className="flex gap-2">
                <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button type="button" variant="secondary" onClick={sendCode} loading={sending} disabled={cooldown > 0 || phone.length < 9}>
                  {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("sendCode")}
                </Button>
              </div>
            </Field>
            <Field label={t("smsCode")} htmlFor="code" error={fe(state, "code")}>
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("login")} htmlFor="login" error={fe(state, "login")}>
              <Input id="login" name="login" defaultValue={dv(state, "login")} autoComplete="username" />
            </Field>
            <Field label={t("recoveryCode")} htmlFor="code" error={fe(state, "code")}>
              <Input id="code" name="code" placeholder={t("recoveryCodePlaceholder")} className="uppercase tracking-widest" />
            </Field>
          </>
        )}
        <Field label={t("newPassword")} htmlFor="password" error={fe(state, "password")}>
          <PasswordInput id="password" name="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
        </Field>
        <StrengthMeter value={pw} labels={[t("strength.0"), t("strength.1"), t("strength.2"), t("strength.3"), t("strength.4")]} />
        <Field label={t("confirmPassword")} htmlFor="confirm" error={fe(state, "confirm")}>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          {t("setPassword")}
        </Button>
      </form>
    </div>
  );
}

export function DemoButtons({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const toast = useToast();
  const [pending, start] = useTransition();
  const accounts = [
    ["buyer", t("demoBuyer")],
    ["seller", t("demoSeller")],
    ["seller2", t("demoArtisan")],
    ["business", t("demoBusiness")],
  ] as const;
  return (
    <div className="rounded-[16px] border border-dashed border-accent bg-accent-50 p-4 dark:bg-accent/10">
      <p className="text-sm font-bold">{t("demoAccounts")}</p>
      <p className="mb-3 text-xs text-muted">{t("demoHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        {accounts.map(([as, label]) => (
          <Button
            key={as}
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await demoLoginAction({ as, next });
                if (r && !r.ok) toast.error(r.error);
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
