import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LEGAL, type LegalKey } from "@/content/legal";
import { cookieConsent } from "@/server/services/privacy";
import { CookieSettings } from "@/components/privacy/privacy-tools";
import { latinToCyrillic } from "@/lib/translit";

const DOCS = Object.keys(LEGAL) as LegalKey[];

export function generateStaticParams() {
  return DOCS.map((doc) => ({ doc }));
}

function pick(doc: LegalKey, locale: string) {
  const d = locale === "ru" ? LEGAL[doc].ru : LEGAL[doc].uz;
  if (locale !== "uz-Cyrl") return d;
  const c = latinToCyrillic;
  return { title: c(d.title), updated: c(d.updated), intro: c(d.intro), sections: d.sections.map((s) => ({ h: c(s.h), p: s.p.map(c) })) };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!DOCS.includes(doc as LegalKey)) return {};
  return { title: pick(doc as LegalKey, locale).title };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!DOCS.includes(doc as LegalKey)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("privacy");
  const d = pick(doc as LegalKey, locale);
  return (
    <article className="container-page max-w-3xl py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">{d.title}</h1>
      <p className="mt-1 text-sm text-muted">{t("updated", { date: d.updated })}</p>
      <p className="mt-5 leading-relaxed">{d.intro}</p>
      {d.sections.map((s) => (
        <section key={s.h} className="mt-6">
          <h2 className="text-lg font-bold">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p} className="mt-2 leading-relaxed text-fg/90">
              {p}
            </p>
          ))}
        </section>
      ))}
      {doc === "cookies" && (
        <section className="card mt-8 p-5">
          <h2 className="mb-3 font-bold">{t("cookieSettings")}</h2>
          <CookieSettings initial={await cookieConsent()} />
        </section>
      )}
    </article>
  );
}
