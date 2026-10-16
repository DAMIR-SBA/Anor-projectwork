import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { env } from "@/server/env";
import { listApiKeys, listWebhooks } from "@/server/services/seller/api";
import { WEBHOOK_EVENTS } from "@/server/services/webhooks";
import { LIMITS } from "@/server/security/rate-limit";
import { Card, PageHeader } from "@/components/ui/display";
import { ApiKeys, Webhooks } from "@/components/seller/api-console";

const ENDPOINTS = [
  { method: "GET", path: "/products", scope: "products:read", key: "listProducts" },
  { method: "GET", path: "/products/{sku}", scope: "products:read", key: "getSku" },
  { method: "PUT", path: "/products/{sku}/stock", scope: "products:write", key: "setStock" },
  { method: "PUT", path: "/products/{sku}/price", scope: "products:write", key: "setPrice" },
  { method: "POST", path: "/stock", scope: "products:write", key: "bulkStock" },
  { method: "GET", path: "/orders", scope: "orders:read", key: "listOrders" },
  { method: "GET", path: "/orders/{number}", scope: "orders:read", key: "getOrder" },
  { method: "POST", path: "/orders/{number}/status", scope: "orders:write", key: "setStatus" },
] as const;

const VERIFY = `import crypto from "node:crypto";

// Express: app.post("/anor", express.raw({ type: "application/json" }), handler)
function verify(req, secret) {
  const ts = req.header("X-Anor-Timestamp");
  const sig = req.header("X-Anor-Signature")?.replace("sha256=", "") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const expected = crypto.createHmac("sha256", secret).update(\`\${ts}.\${req.body}\`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}`;

export default async function SellerApiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/api");
  const t = await getTranslations("sellerApi");
  const [keys, hooks] = await Promise.all([listApiKeys(shop.id), listWebhooks(shop.id)]);
  const base = `${env().APP_URL.replace(/\/$/, "")}/api/seller/v1`;
  const curl = `curl -X PUT ${base}/products/APPLE-IPHONE-15-2/stock \\
  -H "Authorization: Bearer anr_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"quantity": 12}'`;
  const sample = `{
  "event": "order.created",
  "data": {
    "id": "cm…",
    "number": "261016-48213-1",
    "total": 12990000,
    "fulfillment": "FBS",
    "items": [{ "sku": "APPLE-IPHONE-15-2", "title": "…", "quantity": 1, "unitPrice": 12990000 }]
  },
  "sentAt": "2026-10-16T09:30:00.000Z"
}`;
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <ApiKeys keys={keys} />
        <Webhooks hooks={hooks} events={WEBHOOK_EVENTS} />
      </div>

      <Card className="space-y-5 p-5">
        <div>
          <h2 className="text-lg font-bold">{t("docs")}</h2>
          <p className="mt-1 text-sm text-muted">{t("docsIntro", { limit: LIMITS.sellerApi.limit })}</p>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="font-semibold">{t("baseUrl")}</dt>
          <dd>
            <code className="break-all font-mono text-[13px]">{base}</code>
          </dd>
          <dt className="font-semibold">{t("auth")}</dt>
          <dd>
            <code className="font-mono text-[13px]">Authorization: Bearer anr_live_…</code>
          </dd>
          <dt className="font-semibold">{t("format")}</dt>
          <dd>{t("formatText")}</dd>
          <dt className="font-semibold">{t("limits")}</dt>
          <dd>{t("limitsText", { limit: LIMITS.sellerApi.limit, window: LIMITS.sellerApi.window })}</dd>
          <dt className="font-semibold">{t("errors")}</dt>
          <dd>
            <code className="font-mono text-[13px]">{`{ "error": { "code": "not_found", "message": "…" } }`}</code> · 401, 403, 404, 409, 422, 429
          </dd>
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">{t("method")}</th>
                <th className="py-2 pr-3">{t("path")}</th>
                <th className="py-2 pr-3">{t("scopeCol")}</th>
                <th className="py-2">{t("description")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ENDPOINTS.map((e) => (
                <tr key={e.method + e.path}>
                  <td className="py-2 pr-3">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] font-bold">{e.method}</code>
                  </td>
                  <td className="py-2 pr-3">
                    <code className="font-mono text-[13px]">{e.path}</code>
                  </td>
                  <td className="py-2 pr-3">
                    <code className="font-mono text-[12px] text-muted">{e.scope}</code>
                  </td>
                  <td className="py-2">{t(`endpoints.${e.key}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-sm font-bold">{t("example")}</h3>
            <pre className="overflow-x-auto rounded-[12px] bg-surface-2 p-3 font-mono text-[12px] leading-relaxed">{curl}</pre>
            <h3 className="mb-1.5 mt-4 text-sm font-bold">{t("payloadExample")}</h3>
            <pre className="overflow-x-auto rounded-[12px] bg-surface-2 p-3 font-mono text-[12px] leading-relaxed">{sample}</pre>
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-bold">{t("verify")}</h3>
            <p className="mb-2 text-sm text-muted">{t("verifyText")}</p>
            <pre className="overflow-x-auto rounded-[12px] bg-surface-2 p-3 font-mono text-[12px] leading-relaxed">{VERIFY}</pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
