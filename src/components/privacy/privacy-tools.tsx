"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { useLocale } from "next-intl";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Switch } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { cookieConsentAction, deleteAccountAction, updateProfileAction } from "@/server/actions/privacy";

/** First-visit cookie choice. Necessary cookies need no consent; analytics and marketing do. */
export function CookieBanner() {
  const t = useTranslations("privacy");
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState({ analytics: true, marketing: false });
  const [pending, start] = useTransition();
  if (!open) return null;
  const save = (v: { analytics: boolean; marketing: boolean }) =>
    start(async () => {
      await cookieConsentAction(v);
      setOpen(false);
      router.refresh();
    });
  return (
    <section role="dialog" aria-label={t("bannerTitle")} className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-2xl rounded-[18px] border border-border bg-surface p-4 shadow-[var(--shadow-lift)] md:bottom-4">
      <p className="flex items-center gap-2 font-bold">
        <Cookie className="h-5 w-5 text-accent" /> {t("bannerTitle")}
      </p>
      <p className="mt-1 text-sm text-muted">
        {t("bannerText")}{" "}
        <Link href="/legal/cookies" className="font-semibold text-primary underline">
          {t("more")}
        </Link>
      </p>
      {custom && (
        <div className="mt-3 space-y-2">
          <Switch label={t("necessary")} checked disabled />
          <Switch label={t("analytics")} checked={c.analytics} onChange={(e) => setC({ ...c, analytics: e.target.checked })} />
          <Switch label={t("marketing")} checked={c.marketing} onChange={(e) => setC({ ...c, marketing: e.target.checked })} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={pending} onClick={() => save({ analytics: true, marketing: true })}>
          {t("acceptAll")}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => save({ analytics: false, marketing: false })}>
          {t("necessaryOnly")}
        </Button>
        {custom ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(c)}>
            {t("saveChoice")}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setCustom(true)}>
            {t("customize")}
          </Button>
        )}
      </div>
    </section>
  );
}

export function CookieSettings({ initial }: { initial: { analytics: boolean; marketing: boolean } | null }) {
  const t = useTranslations("privacy");
  const toast = useToast();
  const router = useRouter();
  const [c, setC] = useState(initial ?? { analytics: false, marketing: false });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Switch label={t("necessary")} checked disabled />
      <Switch label={t("analytics")} checked={c.analytics} onChange={(e) => setC({ ...c, analytics: e.target.checked })} />
      <Switch label={t("marketing")} checked={c.marketing} onChange={(e) => setC({ ...c, marketing: e.target.checked })} />
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            await cookieConsentAction(c);
            toast.success(t("saved"));
            router.refresh();
          })
        }
      >
        {t("saveChoice")}
      </Button>
    </div>
  );
}

type Profile = { name: string; email: string; avatarUrl: string | null; locale: "uz" | "uz-Cyrl" | "ru"; marketing: boolean; login: string };

export function ProfileForm({ initial }: { initial: Profile }) {
  const t = useTranslations("privacy");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Profile>) => setF((prev) => ({ ...prev, ...patch }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await updateProfileAction({ name: f.name, email: f.email, avatarUrl: f.avatarUrl, locale: f.locale, marketing: f.marketing });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          toast.success(t("profileSaved"));
          router.refresh();
        });
      }}
    >
      <div>
        <p className="mb-1.5 text-sm font-semibold">{t("avatar")}</p>
        <ImageUploader folder="avatars" value={f.avatarUrl ? [f.avatarUrl] : []} onChange={(urls) => set({ avatarUrl: urls[0] ?? null })} max={1} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("login")} htmlFor="pf-login" hint={t("loginHint")}>
          <Input id="pf-login" value={f.login} disabled />
        </Field>
        <Field label={t("name")} htmlFor="pf-name" error={errors.name}>
          <Input id="pf-name" autoComplete="name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t("email")} htmlFor="pf-email" error={errors.email}>
          <Input id="pf-email" type="email" autoComplete="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label={t("language")} htmlFor="pf-locale">
          <Select id="pf-locale" value={f.locale} onChange={(e) => set({ locale: e.target.value as Profile["locale"] })}>
            <option value="uz">O‘zbekcha</option>
            <option value="uz-Cyrl">Ўзбекча</option>
            <option value="ru">Русский</option>
          </Select>
        </Field>
      </div>
      <Switch label={t("marketingConsent")} checked={f.marketing} onChange={(e) => set({ marketing: e.target.checked })} />
      <FormError message={error} />
      <Button type="submit" loading={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}

export function DeleteAccount({ hasPassword, login, blockers }: { hasPassword: boolean; login: string; blockers: string[] }) {
  const t = useTranslations("privacy");
  const locale = useLocale();
  const [password, setPassword] = useState("");
  const [typedLogin, setTypedLogin] = useState("");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (blockers.length)
    return (
      <div className="rounded-[12px] bg-surface-2 p-3 text-sm">
        <p className="font-semibold">{t("deleteBlocked")}</p>
        <ul className="mt-1 list-disc pl-5 text-muted">
          {blockers.map((b) => (
            <li key={b}>{t(`blockers.${b}`)}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await deleteAccountAction({ password: hasPassword ? password : undefined, login: hasPassword ? undefined : typedLogin, phrase });
          if (!res.ok) return setError(res.error);
          window.location.assign(getPathname({ href: "/?deleted=1", locale }));
        });
      }}
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>{t("deleteWhat1")}</li>
        <li>{t("deleteWhat2")}</li>
        <li>{t("deleteWhat3")}</li>
      </ul>
      {hasPassword ? (
        <Field label={t("password")} htmlFor="del-pass">
          <Input id="del-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : (
        <Field label={t("typeLogin", { login })} htmlFor="del-login">
          <Input id="del-login" autoComplete="off" value={typedLogin} onChange={(e) => setTypedLogin(e.target.value)} />
        </Field>
      )}
      <Field label={t("typePhrase")} htmlFor="del-phrase">
        <Input id="del-phrase" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="danger" loading={pending} disabled={!phrase.trim()}>
        {t("deleteButton")}
      </Button>
    </form>
  );
}
