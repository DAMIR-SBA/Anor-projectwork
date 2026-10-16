"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Switch } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/interactive";
import { useToast } from "@/components/ui/toast";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, pingWebhookAction, redeliverAction, revokeApiKeyAction, rotateWebhookAction, updateWebhookAction } from "@/server/actions/seller-api";
import type { listApiKeys, listWebhooks } from "@/server/services/seller/api";
import { API_SCOPES } from "@/lib/seller";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type Key = Awaited<ReturnType<typeof listApiKeys>>[number];
type Hook = Awaited<ReturnType<typeof listWebhooks>>[number];

/** Shows a secret exactly once with a copy button. */
function SecretDialog({ title, value, onClose }: { title: string; value: string; onClose: () => void }) {
  const t = useTranslations("sellerApi");
  const tc = useTranslations("common");
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      closeLabel={tc("close")}
      footer={
        <Button onClick={onClose}>{t("savedIt")}</Button>
      }
    >
      <p className="mb-3 rounded-[10px] bg-accent/15 p-2.5 text-sm">{t("onceWarning")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-[10px] bg-surface-2 p-2.5 font-mono text-[13px]">{value}</code>
        <CopyButton value={value} label={t("copy")} copiedLabel={t("copied")} />
      </div>
    </Dialog>
  );
}

export function ApiKeys({ keys }: { keys: Key[] }) {
  const t = useTranslations("sellerApi");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["products:read", "orders:read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = keys.filter((k) => !k.revokedAt);
  return (
    <section className="card p-5" aria-labelledby="keys-title">
      <h2 id="keys-title" className="flex items-center gap-2 text-lg font-bold">
        <KeyRound className="h-5 w-5 text-primary" /> {t("keys")}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{t("keysHint")}</p>
      <ul className="mt-3 divide-y divide-border">
        {keys.map((k) => (
          <li key={k.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm", k.revokedAt && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {k.name} <code className="ml-1 font-mono text-[12px] text-muted">{k.prefix}…</code>
              </p>
              <p className="text-[12px] text-muted">
                {k.scopes.join(", ")} · {k.lastUsedAt ? t("lastUsed", { date: fmtDateTime(k.lastUsedAt, locale) }) : t("neverUsed")}
              </p>
            </div>
            {k.revokedAt ? (
              <Badge>{t("revoked")}</Badge>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (!window.confirm(t("revokeConfirm", { name: k.name }))) return;
                    const res = await revokeApiKeyAction({ id: k.id });
                    if (!res.ok) return toast.error(res.error);
                    router.refresh();
                  })
                }
              >
                {t("revoke")}
              </Button>
            )}
          </li>
        ))}
        {keys.length === 0 && <li className="py-3 text-sm text-muted">{t("noKeys")}</li>}
      </ul>
      {active.length < 5 && (
        <form
          className="mt-4 space-y-3 rounded-[14px] bg-surface-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await createApiKeyAction({ name, scopes: scopes as Array<(typeof API_SCOPES)[number]> });
              if (!res.ok) return setError(res.error);
              setSecret((res.data as { key: string }).key);
              setName("");
              router.refresh();
            });
          }}
        >
          <Field label={t("keyName")} htmlFor="key-name">
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="1C, MoySklad…" maxLength={60} />
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("scopes")}</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {API_SCOPES.map((s) => (
                <Checkbox key={s} checked={scopes.includes(s)} onChange={(e) => setScopes((x) => (e.target.checked ? [...x, s] : x.filter((y) => y !== s)))} label={<span><code className="font-mono text-[13px]">{s}</code> — {t(`scope.${s.replace(":", "_")}`)}</span>} />
              ))}
            </div>
          </fieldset>
          <FormError message={error} />
          <Button type="submit" loading={pending} disabled={name.trim().length < 2 || !scopes.length} leftIcon={<Plus className="h-4 w-4" />}>
            {t("createKey")}
          </Button>
        </form>
      )}
      {secret && <SecretDialog title={t("newKey")} value={secret} onClose={() => setSecret(null)} />}
    </section>
  );
}

const DELIVERY_TONE: Record<string, "success" | "danger" | "neutral"> = { DELIVERED: "success", FAILED: "danger", PENDING: "neutral" };

function HookRow({ hook, events }: { hook: Hook; events: readonly string[] }) {
  const t = useTranslations("sellerApi");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (data: unknown) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? "");
      after?.(res.data);
      router.refresh();
    });
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">{hook.url}</code>
        {!hook.isActive && <Badge tone="danger">{t("disabled")}</Badge>}
        {hook.lastStatus !== null && <Badge tone={hook.lastStatus >= 200 && hook.lastStatus < 300 ? "success" : "danger"}>HTTP {hook.lastStatus}</Badge>}
        <Switch checked={hook.isActive} aria-label={t("active")} onChange={(e) => run(() => updateWebhookAction({ id: hook.id, isActive: e.target.checked }))} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {events.map((ev) => (
          <Checkbox
            key={ev}
            checked={hook.events.includes(ev)}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked ? [...hook.events, ev] : hook.events.filter((x) => x !== ev);
              if (next.length) run(() => updateWebhookAction({ id: hook.id, events: next as Array<"order.created"> }));
            }}
            label={<code className="font-mono text-[12px]">{ev}</code>}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          leftIcon={<Send className="h-4 w-4" />}
          onClick={() =>
            run(
              () => pingWebhookAction({ id: hook.id }),
              (d) => {
                const r = d as { ok: boolean; status: number; error?: string };
                if (r.ok) toast.success(t("pingOk", { status: r.status }));
                else toast.error(t("pingFailed", { reason: r.error ?? `HTTP ${r.status}` }));
              },
            )
          }
        >
          {t("ping")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => run(() => rotateWebhookAction({ id: hook.id }), (d) => setSecret((d as { secret: string }).secret))}>
          {t("rotate")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          disabled={pending}
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={() => {
            if (window.confirm(t("deleteConfirm"))) run(() => deleteWebhookAction({ id: hook.id }));
          }}
        >
          {t("delete")}
        </Button>
      </div>
      {hook.deliveries.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-muted">{t("deliveries", { count: hook.deliveries.length })}</summary>
          <ul className="mt-1.5 space-y-1.5">
            {hook.deliveries.map((d) => (
              <li key={d.id} className="rounded-[10px] bg-surface-2 p-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono">{d.event}</code>
                  <Badge tone={DELIVERY_TONE[d.status] ?? "neutral"}>{t.has(`deliveryStatus.${d.status}`) ? t(`deliveryStatus.${d.status}`) : d.status}</Badge>
                  <span className="text-muted">
                    {d.responseCode ? `HTTP ${d.responseCode}` : (d.error ?? "—")} · {t("attempts", { count: d.attempts })}
                  </span>
                  <span className="ml-auto text-muted">{fmtDateTime(d.createdAt, locale)}</span>
                  {d.status === "FAILED" && (
                    <button type="button" className="font-semibold text-primary hover:underline" disabled={pending} onClick={() => run(() => redeliverAction({ id: d.id }))}>
                      {t("redeliver")}
                    </button>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-muted">{t("payload")}</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-[8px] bg-surface p-2 font-mono text-[12px]">{d.payload}</pre>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
      {secret && <SecretDialog title={t("newSecret")} value={secret} onClose={() => setSecret(null)} />}
    </li>
  );
}

export function Webhooks({ hooks, events }: { hooks: Hook[]; events: readonly string[] }) {
  const t = useTranslations("sellerApi");
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [sel, setSel] = useState<string[]>(["order.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-5" aria-labelledby="hooks-title">
      <h2 id="hooks-title" className="flex items-center gap-2 text-lg font-bold">
        <Webhook className="h-5 w-5 text-primary" /> {t("webhooks")}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{t("webhooksHint")}</p>
      <ul className="mt-2 divide-y divide-border">
        {hooks.map((h) => (
          <HookRow key={h.id} hook={h} events={events} />
        ))}
        {hooks.length === 0 && <li className="py-3 text-sm text-muted">{t("noWebhooks")}</li>}
      </ul>
      {hooks.length < 5 && (
        <form
          className="mt-4 space-y-3 rounded-[14px] bg-surface-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await createWebhookAction({ url, events: sel as Array<"order.created"> });
              if (!res.ok) return setError(res.fieldErrors?.url ?? res.error);
              setSecret((res.data as { secret: string }).secret);
              setUrl("https://");
              router.refresh();
            });
          }}
        >
          <Field label={t("url")} htmlFor="hook-url" hint={t("urlHint")}>
            <Input id="hook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("events")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {events.map((ev) => (
                <Checkbox key={ev} checked={sel.includes(ev)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, ev] : x.filter((y) => y !== ev)))} label={<code className="font-mono text-[13px]">{ev}</code>} />
              ))}
            </div>
          </fieldset>
          <FormError message={error} />
          <Button type="submit" loading={pending} disabled={!url.startsWith("https://") || url.length < 12 || !sel.length} leftIcon={<Plus className="h-4 w-4" />}>
            {t("addWebhook")}
          </Button>
        </form>
      )}
      {secret && <SecretDialog title={t("newSecret")} value={secret} onClose={() => setSecret(null)} />}
    </section>
  );
}
