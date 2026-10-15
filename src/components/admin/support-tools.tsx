"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Ban, Check, KeyRound, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Radio, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { chatBanAction, deleteCannedAction, moderationAccessAction, resolveChatReportAction, saveCannedAction, segmentSizeAction, sendBroadcastAction } from "@/server/actions/chat";

// ── Canned replies ───────────────────────────────────────────────────────

type CannedRow = { id: string; title: string; shortcut: string; textUz: string; textRu: string };
const EMPTY: Omit<CannedRow, "id"> & { id?: string } = { title: "", shortcut: "", textUz: "", textRu: "" };

export function CannedManager({ rows }: { rows: CannedRow[] }) {
  const t = useTranslations("support.canned");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {form ? (
        <div className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("name")} htmlFor="c-title" error={errors.title}>
              <Input id="c-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label={t("shortcut")} htmlFor="c-short" hint={t("shortcutHint")} error={errors.shortcut}>
              <Input id="c-short" value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} placeholder="salom" />
            </Field>
          </div>
          <Field label={t("textUz")} htmlFor="c-uz" error={errors.textUz}>
            <Textarea id="c-uz" rows={3} value={form.textUz} onChange={(e) => setForm({ ...form, textUz: e.target.value })} />
          </Field>
          <Field label={t("textRu")} htmlFor="c-ru" error={errors.textRu}>
            <Textarea id="c-ru" rows={3} value={form.textRu} onChange={(e) => setForm({ ...form, textRu: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await saveCannedAction(form);
                  if (!res.ok) return setErrors(res.fieldErrors ?? { title: res.error });
                  toast.success(tc("saved"));
                  setForm(null);
                  router.refresh();
                })
              }
            >
              {tc("save")}
            </Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => (setErrors({}), setForm(EMPTY))} leftIcon={<Plus className="h-4 w-4" />}>
          {t("add")}
        </Button>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="card flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                <span className="text-primary">/{r.shortcut}</span> · {r.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm">{r.textUz}</p>
              <p className="line-clamp-1 text-sm text-muted">{r.textRu}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => (setErrors({}), setForm(r))}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={tc("delete")}
              onClick={() =>
                window.confirm(t("deleteConfirm")) &&
                start(async () => {
                  await deleteCannedAction({ id: r.id });
                  router.refresh();
                })
              }
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Broadcasts ───────────────────────────────────────────────────────────

const SEGMENTS = ["ALL", "BUYERS", "SELLERS", "PLUS"] as const;
const CHANNELS = ["inapp", "push", "email", "telegram"] as const;

export function BroadcastForm({ initialSize }: { initialSize: number }) {
  const t = useTranslations("broadcasts");
  const router = useRouter();
  const toast = useToast();
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("ALL");
  const [size, setSize] = useState(initialSize);
  const [channels, setChannels] = useState<string[]>(["inapp", "push"]);
  const [v, setV] = useState({ title: "", body: "", href: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-4 p-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("segment")}</legend>
        <div className="flex flex-wrap gap-4">
          {SEGMENTS.map((s) => (
            <Radio
              key={s}
              name="segment"
              checked={segment === s}
              onChange={async () => {
                setSegment(s);
                const r = await segmentSizeAction({ segment: s });
                if (r.ok) setSize(Number(r.data));
              }}
              label={t(`segments.${s}`)}
            />
          ))}
        </div>
        <p className="mt-1.5 text-sm text-muted">{t("recipients", { count: size })}</p>
      </fieldset>
      <Field label={t("titleLabel")} htmlFor="b-title" error={errors.title}>
        <Input id="b-title" maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <Field label={t("body")} htmlFor="b-body" error={errors.body}>
        <Textarea id="b-body" rows={4} maxLength={1000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
      </Field>
      <Field label={t("link")} htmlFor="b-href" hint={t("linkHint")} error={errors.href}>
        <Input id="b-href" value={v.href} onChange={(e) => setV({ ...v, href: e.target.value })} placeholder="/deals" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("channels")}</legend>
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <Checkbox key={c} label={t(`channelNames.${c}`)} checked={channels.includes(c)} onChange={(e) => setChannels((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))} />
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">{t("channelsHint")}</p>
      </fieldset>
      <FormError message={error} />
      <Button
        loading={pending}
        leftIcon={<Megaphone className="h-4 w-4" />}
        onClick={() => {
          if (!window.confirm(t("confirm", { count: size }))) return;
          start(async () => {
            setErrors({});
            setError(null);
            const res = await sendBroadcastAction({ segment, ...v, channels: channels as Array<(typeof CHANNELS)[number]> });
            if (!res.ok) {
              setErrors(res.fieldErrors ?? {});
              return setError(res.error);
            }
            toast.success(t("queued"));
            setV({ title: "", body: "", href: "" });
            router.refresh();
          });
        }}
      >
        {t("send")}
      </Button>
    </div>
  );
}

// ── Chat moderation ──────────────────────────────────────────────────────

/** Opening a buyer↔seller chat requires a written reason that is stored in the audit log. */
export function ModerationGate({ conversationId }: { conversationId: string }) {
  const t = useTranslations("chatModeration");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card mx-auto max-w-lg space-y-3 p-6">
      <p className="flex items-center gap-2 text-lg font-extrabold">
        <KeyRound className="h-5 w-5 text-primary" /> {t("gateTitle")}
      </p>
      <p className="text-sm text-muted">{t("gateText")}</p>
      <Field label={t("reason")} htmlFor="mod-reason" error={error}>
        <Textarea id="mod-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
      <Button
        loading={pending}
        disabled={reason.trim().length < 10}
        onClick={() =>
          start(async () => {
            const res = await moderationAccessAction({ conversationId, reason });
            if (!res.ok) return setError(res.fieldErrors?.reason ?? res.error);
            router.refresh();
          })
        }
      >
        {t("openLogged")}
      </Button>
    </div>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const t = useTranslations("chatModeration");
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (status: "RESOLVED" | "DISMISSED") =>
    start(async () => {
      await resolveChatReportAction({ reportId, status });
      router.refresh();
    });
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="danger" className="h-8" loading={pending} onClick={() => go("RESOLVED")}>
        <Check className="h-4 w-4" /> {t("resolve")}
      </Button>
      <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => go("DISMISSED")}>
        <X className="h-4 w-4" /> {t("dismiss")}
      </Button>
    </div>
  );
}

export function ChatBanButton({ userId, banned, name }: { userId: string; banned: boolean; name: string }) {
  const t = useTranslations("chatModeration");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={banned ? "outline" : "danger"}
      className="h-8"
      loading={pending}
      onClick={() => {
        const reason = window.prompt(t(banned ? "unbanReason" : "banReason", { name }));
        if (!reason || reason.trim().length < 3) return;
        start(async () => {
          const res = await chatBanAction({ userId, ban: !banned, reason });
          if (!res.ok) return toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <Ban className="h-4 w-4" /> {banned ? t("unban", { name }) : t("ban", { name })}
    </Button>
  );
}
