"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ActionButton } from "@/components/admin/ui";
import { deleteCategoryAction, saveCategoryAction, saveCommissionsAction } from "@/server/actions/admin-marketplace";
import type { adminCategories, CategoryAttribute } from "@/server/services/admin/categories";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof adminCategories>>[number];
type AttrRow = { key: string; nameUz: string; nameRu: string; type: CategoryAttribute["type"]; options: string };

const pct = (v: number) => String(+(v * 100).toFixed(2));

function Editor({ rows, initial, parentId, onClose }: { rows: Row[]; initial: Row | null; parentId: string | null; onClose: () => void }) {
  const t = useTranslations("adminCategories");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    nameUz: initial?.nameUz ?? "",
    nameRu: initial?.nameRu ?? "",
    slug: initial?.slug ?? "",
    parentId: initial ? initial.parentId : parentId,
    icon: initial?.icon ?? "",
    sort: String(initial?.sort ?? 0),
    rate: pct(initial?.commissionRate ?? 0.12),
    nasiya: initial?.nasiyaEligible ?? true,
    active: initial?.isActive ?? true,
  });
  const [attrs, setAttrs] = useState<AttrRow[]>((initial?.attrs ?? []).map((a) => ({ ...a, options: (a.options ?? []).join(", ") })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A category cannot move under itself or its own subtree.
  const blocked = useMemo(() => {
    if (!initial) return new Set<string>();
    const out = new Set([initial.id]);
    let added = true;
    while (added) {
      added = false;
      for (const r of rows) if (r.parentId && out.has(r.parentId) && !out.has(r.id)) {
        out.add(r.id);
        added = true;
      }
    }
    return out;
  }, [rows, initial]);
  const save = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const res = await saveCategoryAction({
        id: initial?.id,
        nameUz: f.nameUz,
        nameRu: f.nameRu,
        slug: f.slug || undefined,
        parentId: f.parentId,
        icon: f.icon || null,
        sort: Number(f.sort) || 0,
        commissionRate: (Number(f.rate) || 0) / 100,
        nasiyaEligible: f.nasiya,
        isActive: f.active,
        attributes: attrs.filter((a) => a.key.trim()).map((a) => ({ key: a.key.trim(), nameUz: a.nameUz, nameRu: a.nameRu, type: a.type, ...(a.type === "select" ? { options: a.options.split(",").map((o) => o.trim()).filter(Boolean) } : {}) })),
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error);
      }
      toast.success(t("saved"));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      open
      onClose={onClose}
      title={initial ? t("editTitle", { name: initial.nameUz }) : t("newTitle")}
      closeLabel={tc("close")}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("back")}
          </Button>
          <Button loading={pending} onClick={save} disabled={f.nameUz.trim().length < 2 || f.nameRu.trim().length < 2}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("nameUz")} htmlFor="c-uz" error={errors.nameUz}>
            <Input id="c-uz" value={f.nameUz} onChange={(e) => setF({ ...f, nameUz: e.target.value })} />
          </Field>
          <Field label={t("nameRu")} htmlFor="c-ru" error={errors.nameRu}>
            <Input id="c-ru" value={f.nameRu} onChange={(e) => setF({ ...f, nameRu: e.target.value })} />
          </Field>
          <Field label={t("slug")} htmlFor="c-slug" error={errors.slug} hint={t("slugHint")}>
            <Input id="c-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          </Field>
          <Field label={t("parent")} htmlFor="c-parent" error={errors.parentId}>
            <Select id="c-parent" value={f.parentId ?? ""} onChange={(e) => setF({ ...f, parentId: e.target.value || null })}>
              <option value="">{t("root")}</option>
              {rows
                .filter((r) => !blocked.has(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {"— ".repeat(r.depth)}
                    {r.nameUz}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t("commission")} htmlFor="c-rate" hint={t("commissionHint")}>
            <Input id="c-rate" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("sort")} htmlFor="c-sort">
              <Input id="c-sort" inputMode="numeric" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label={t("icon")} htmlFor="c-icon">
              <Input id="c-icon" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} placeholder="smartphone" />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label={t("active")} />
          <Checkbox checked={f.nasiya} onChange={(e) => setF({ ...f, nasiya: e.target.checked })} label={t("nasiya")} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">{t("attributes")}</legend>
          <p className="text-[13px] text-muted">{t("attributesHint")}</p>
          {attrs.map((a, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-[12px] bg-surface-2 p-2 sm:grid-cols-[110px_1fr_1fr_110px_auto]">
              <Input aria-label={t("attrKey")} placeholder="memory" value={a.key} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, key: e.target.value.toLowerCase() } : y)))} className="h-9 text-sm" />
              <Input aria-label={t("nameUz")} placeholder={t("nameUz")} value={a.nameUz} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, nameUz: e.target.value } : y)))} className="h-9 text-sm" />
              <Input aria-label={t("nameRu")} placeholder={t("nameRu")} value={a.nameRu} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, nameRu: e.target.value } : y)))} className="h-9 text-sm" />
              <Select aria-label={t("attrType")} value={a.type} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, type: e.target.value as AttrRow["type"] } : y)))} className="h-9 text-sm">
                <option value="select">{t("types.select")}</option>
                <option value="number">{t("types.number")}</option>
                <option value="text">{t("types.text")}</option>
              </Select>
              <button type="button" className="p-2 text-muted hover:text-danger" aria-label={t("remove")} onClick={() => setAttrs((x) => x.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
              {a.type === "select" && <Input aria-label={t("options")} placeholder={t("optionsPlaceholder")} value={a.options} onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, options: e.target.value } : y)))} className="col-span-full h-9 text-sm" />}
            </div>
          ))}
          <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAttrs((x) => [...x, { key: "", nameUz: "", nameRu: "", type: "select", options: "" }])}>
            {t("addAttribute")}
          </Button>
          <FormError message={errors.attributes} />
        </fieldset>
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

export function CategoryManager({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const t = useTranslations("adminCategories");
  const locale = useLocale();
  const [editing, setEditing] = useState<{ row: Row | null; parentId: string | null } | null>(null);
  return (
    <div>
      {canEdit && (
        <Button className="mb-3" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ row: null, parentId: null })}>
          {t("add")}
        </Button>
      )}
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("name")}</th>
              <th className="px-3 py-2.5">{t("slug")}</th>
              <th className="px-3 py-2.5 text-right">{t("products")}</th>
              <th className="px-3 py-2.5 text-right">Basic / Pro</th>
              <th className="px-3 py-2.5">{t("flags")}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={cn(!r.isActive && "opacity-55")}>
                <td className="px-4 py-2" style={{ paddingLeft: 16 + r.depth * 20 }}>
                  <span className={cn(r.depth === 0 && "font-bold")}>{locale === "ru" ? r.nameRu : r.nameUz}</span>
                  {r.attrs.length > 0 && <span className="ml-1.5 text-xs text-muted">({t("attrsCount", { count: r.attrs.length })})</span>}
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-muted">{r.slug}</td>
                <td className="tabular px-3 py-2 text-right">{r.products}</td>
                <td className="tabular px-3 py-2 text-right">
                  {pct(r.basic)}% / {pct(r.pro)}%
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {!r.isActive && <Badge>{t("hidden")}</Badge>}
                    {r.nasiyaEligible && <Badge tone="info">Nasiya</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("addChild")} title={t("addChild")} onClick={() => setEditing({ row: null, parentId: r.id })}>
                        <Plus className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing({ row: r, parentId: r.parentId })}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!r.products && !r.childCount && <ActionButton action={deleteCategoryAction} input={{ id: r.id }} variant="ghost" className="h-8 px-1.5 text-muted hover:text-danger" label={<Trash2 className="h-4 w-4" aria-label={t("delete")} />} confirm={t("deleteConfirm", { name: r.nameUz })} />}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <Editor rows={rows} initial={editing.row} parentId={editing.parentId} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function CommissionTable({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const t = useTranslations("adminCategories");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, { basic: string; pro: string; cascade: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const value = (r: Row) => edits[r.id] ?? { basic: pct(r.basic), pro: pct(r.pro), cascade: false };
  const set = (r: Row, patch: Partial<{ basic: string; pro: string; cascade: boolean }>) => setEdits((e) => ({ ...e, [r.id]: { ...value(r), ...patch } }));
  const changed = Object.keys(edits);
  return (
    <div>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("name")}</th>
              <th className="px-3 py-2.5">Basic, %</th>
              <th className="px-3 py-2.5">Pro, %</th>
              <th className="px-3 py-2.5">{t("cascade")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const v = value(r);
              const bad = Number(v.pro) > Number(v.basic);
              return (
                <tr key={r.id} className={cn(edits[r.id] && "bg-accent/10")}>
                  <td className="px-4 py-1.5" style={{ paddingLeft: 16 + r.depth * 20 }}>
                    <span className={cn(r.depth === 0 && "font-bold")}>{locale === "ru" ? r.nameRu : r.nameUz}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`Basic ${r.nameUz}`} disabled={!canEdit} inputMode="decimal" value={v.basic} onChange={(e) => set(r, { basic: e.target.value.replace(/[^\d.]/g, "") })} className="h-8 w-20 rounded-[8px] border border-border bg-surface px-2 text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`Pro ${r.nameUz}`} disabled={!canEdit} inputMode="decimal" value={v.pro} onChange={(e) => set(r, { pro: e.target.value.replace(/[^\d.]/g, "") })} className={cn("h-8 w-20 rounded-[8px] border bg-surface px-2 text-sm", bad ? "border-danger" : "border-border")} />
                  </td>
                  <td className="px-3 py-1.5">{r.childCount > 0 && <input type="checkbox" aria-label={t("cascade")} disabled={!canEdit} checked={v.cascade} onChange={(e) => set(r, { cascade: e.target.checked })} className="h-4 w-4 accent-[#C8102E]" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="sticky bottom-3 mt-3 flex items-center gap-3 rounded-[14px] border border-border bg-surface/95 p-3 shadow-sm backdrop-blur">
          <span className="text-sm text-muted">{t("changed", { count: changed.length })}</span>
          <FormError message={error} />
          <Button
            className="ml-auto"
            disabled={!changed.length}
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await saveCommissionsAction({ rows: changed.map((id) => ({ categoryId: id, basic: Number(edits[id].basic) / 100, pro: Number(edits[id].pro) / 100, cascade: edits[id].cascade })) });
                if (!res.ok) return setError(res.error);
                toast.success(t("commissionsSaved", { count: Number((res.data as { count: number }).count) }));
                setEdits({});
                router.refresh();
              })
            }
          >
            {t("saveCommissions")}
          </Button>
        </div>
      )}
    </div>
  );
}
