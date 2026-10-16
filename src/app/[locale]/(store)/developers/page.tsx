import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookOpen, KeyRound, Webhook } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { env } from "@/server/env";
import { WEBHOOK_EVENTS } from "@/server/services/webhooks";
import { LIMITS } from "@/server/security/rate-limit";
import { Card, PageHeader } from "@/components/ui/display";
import { ENDPOINTS, ERROR_CODES, type Endpoint } from "@/lib/openapi";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "developers" });
  return { title: t("title"), description: t("subtitle") };
}

const METHOD_TONE: Record<Endpoint["method"], string> = { GET: "bg-info/15 text-info", POST: "bg-success/15 text-success", PUT: "bg-accent/25 text-fg" };

const VERIFY = `import crypto from "node:crypto";

function verify(req, secret) {
  const ts = req.header("X-Anor-Timestamp");
  const sig = req.header("X-Anor-Signature")?.replace("sha256=", "") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${ts}.\${req.body}\`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}`;

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[12px] bg-[#1A1A1F] p-3 text-[13px] leading-relaxed text-[#F4F4F6]">{children}</pre>;
}

export default async function DevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("developers");
  const base = env().APP_URL.replace(/\/$/, "");
  const groups = (["catalog", "seller", "system"] as const).map((g) => ({ g, items: ENDPOINTS.filter((e) => e.group === g) }));
  return (
    <div className="container-page max-w-5xl space-y-6 py-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <a href="/api/v1/openapi.json" className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#1A1A1F] px-4 text-sm font-bold text-white">
            <BookOpen className="h-4 w-4" aria-hidden="true" /> OpenAPI 3.1
          </a>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-bold">{t("baseUrl")}</p>
          <p className="mt-1 break-all font-mono text-sm">{base}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" /> {t("auth")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t("authText")}{" "}
            <Link href="/seller/api" className="font-semibold text-primary hover:underline">
              {t("getKey")}
            </Link>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-bold">{t("limits")}</p>
          <p className="mt-1 text-sm text-muted">{t("limitsText", { n: LIMITS.sellerApi.limit })}</p>
        </Card>
      </div>

      <Code>{`curl ${base}/api/seller/v1/orders?status=PLACED \\\n  -H "Authorization: Bearer anr_live_…"`}</Code>

      {groups.map(({ g, items }) => (
        <section key={g} className="space-y-3" aria-labelledby={`dev-${g}`}>
          <h2 id={`dev-${g}`} className="text-xl font-extrabold">
            {t(`group.${g}`)}
          </h2>
          <p className="text-sm text-muted">{t(`groupText.${g}`)}</p>
          <ul className="space-y-3">
            {items.map((e) => (
              <li key={e.id} id={e.id} className="card scroll-mt-32 space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-2 py-0.5 font-mono text-xs font-bold", METHOD_TONE[e.method])}>{e.method}</span>
                  <code className="break-all font-mono text-sm font-semibold">{e.path}</code>
                  {e.scope && <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-xs">{e.scope}</span>}
                </div>
                <p className="text-sm">{t(`ep.${e.id}`)}</p>
                {e.query && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                          <th className="py-1.5 pr-3">{t("param")}</th>
                          <th className="py-1.5 pr-3">{t("type")}</th>
                          <th className="py-1.5">{t("description")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {e.query.map((q) => (
                          <tr key={q.name}>
                            <td className="py-1.5 pr-3 font-mono text-[13px]">{q.name}</td>
                            <td className="py-1.5 pr-3 text-[13px] text-muted">{q.enum ? q.enum.join(" | ") : q.type}</td>
                            <td className="py-1.5 text-[13px]">{q.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {e.body !== undefined && <Code>{JSON.stringify(e.body, null, 2)}</Code>}
                {e.example !== undefined && (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-primary">{t("exampleResponse")}</summary>
                    <div className="mt-2">
                      <Code>{JSON.stringify(e.example, null, 2)}</Code>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="space-y-3" aria-labelledby="dev-errors">
        <h2 id="dev-errors" className="text-xl font-extrabold">
          {t("errors")}
        </h2>
        <p className="text-sm text-muted">{t("errorsText")}</p>
        <Code>{`{ "error": { "code": "validation_failed", "message": "Request validation failed", "details": [{ "path": "quantity", "message": "…" }] } }`}</Code>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-border">
              {ERROR_CODES.map(([status, code, text]) => (
                <tr key={code}>
                  <td className="px-4 py-2 font-mono text-[13px]">{status}</td>
                  <td className="px-3 py-2 font-mono text-[13px]">{code}</td>
                  <td className="px-3 py-2 text-[13px]">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="dev-hooks">
        <h2 id="dev-hooks" className="flex items-center gap-2 text-xl font-extrabold">
          <Webhook className="h-5 w-5 text-primary" aria-hidden="true" /> {t("webhooks")}
        </h2>
        <p className="text-sm text-muted">{t("webhooksText")}</p>
        <div className="flex flex-wrap gap-1.5">
          {WEBHOOK_EVENTS.map((e) => (
            <code key={e} className="rounded-full bg-surface-3 px-2.5 py-1 font-mono text-xs">
              {e}
            </code>
          ))}
        </div>
        <Code>{VERIFY}</Code>
      </section>
    </div>
  );
}
