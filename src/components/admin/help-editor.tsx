"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { deleteHelpArticleAction, saveHelpArticleAction } from "@/server/actions/help";

type Article = { id?: string; slug: string; section: "buyers" | "sellers" | "company"; titleUz: string; titleRu: string; bodyUz: string; bodyRu: string; sort: number; isPublished: boolean };

export function HelpEditor({ initial }: { initial: Article }) {
  const t = useTranslations("help.admin");
  const th = useTranslations("help");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Article>(k: K, val: Article[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("slug")} htmlFor="h-slug" error={errors.slug} hint="/help/…">
          <Input id="h-slug" value={v.slug} onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <Field label={t("section")} htmlFor="h-section">
          <Select id="h-section" value={v.section} onChange={(e) => set("section", e.target.value as Article["section"])}>
            {(["buyers", "sellers", "company"] as const).map((s) => (
              <option key={s} value={s}>
                {th(`sections.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("sort")} htmlFor="h-sort">
          <Input id="h-sort" type="number" min={0} max={999} value={v.sort} onChange={(e) => set("sort", Number(e.target.value))} />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label={t("titleUz")} htmlFor="h-tuz" error={errors.titleUz}>
            <Input id="h-tuz" value={v.titleUz} onChange={(e) => set("titleUz", e.target.value)} />
          </Field>
          <Field label={t("bodyUz")} htmlFor="h-buz" error={errors.bodyUz} hint={t("formatHint")}>
            <Textarea id="h-buz" rows={14} value={v.bodyUz} onChange={(e) => set("bodyUz", e.target.value)} className="font-mono text-sm" />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label={t("titleRu")} htmlFor="h-tru" error={errors.titleRu}>
            <Input id="h-tru" value={v.titleRu} onChange={(e) => set("titleRu", e.target.value)} />
          </Field>
          <Field label={t("bodyRu")} htmlFor="h-bru" error={errors.bodyRu}>
            <Textarea id="h-bru" rows={14} value={v.bodyRu} onChange={(e) => set("bodyRu", e.target.value)} className="font-mono text-sm" />
          </Field>
        </div>
      </div>
      <Switch label={t("published")} checked={v.isPublished} onChange={(e) => set("isPublished", e.target.checked)} />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              setErrors({});
              setError(null);
              const res = await saveHelpArticleAction(v);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                return setError(res.error);
              }
              toast.success(tc("saved"));
              router.push("/admin/help");
              router.refresh();
            })
          }
        >
          {tc("save")}
        </Button>
        {v.id && (
          <Button
            variant="ghost"
            className="text-danger"
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() =>
              window.confirm(t("deleteConfirm")) &&
              start(async () => {
                await deleteHelpArticleAction({ id: v.id! });
                router.push("/admin/help");
                router.refresh();
              })
            }
          >
            {tc("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}
