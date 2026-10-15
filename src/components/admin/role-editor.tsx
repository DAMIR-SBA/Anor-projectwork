"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PERMISSION_GROUPS, PERMISSIONS, SUPER_ADMIN_ONLY } from "@/lib/rbac";
import { saveRoleAction, deleteRoleAction } from "@/server/actions/staff";

export function RoleEditor({ role }: { role?: { id: string; key: string; name: string; description: string | null; permissions: string[]; isSystem: boolean } }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const toast = useToast();
  const [state, action, pending] = useActionState(saveRoleAction, null);
  const [deleting, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const readOnly = role?.isSystem;

  return (
    <form action={action} className="space-y-4">
      {role && <input type="hidden" name="roleId" value={role.id} />}
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      {state?.ok && <p className="text-sm font-semibold text-success">{tc("saved")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("roleKey")} htmlFor={`key-${role?.id ?? "new"}`} error={state && !state.ok ? state.fieldErrors?.key : undefined}>
          <Input id={`key-${role?.id ?? "new"}`} name="key" defaultValue={role?.key} readOnly={!!role} placeholder="CONTENT_EDITOR" className="uppercase" />
        </Field>
        <Field label={t("roleName")} htmlFor={`name-${role?.id ?? "new"}`}>
          <Input id={`name-${role?.id ?? "new"}`} name="name" defaultValue={role?.name} readOnly={readOnly} required />
        </Field>
      </div>
      <Field label={t("roleDescription")} htmlFor={`desc-${role?.id ?? "new"}`}>
        <Input id={`desc-${role?.id ?? "new"}`} name="description" defaultValue={role?.description ?? ""} readOnly={readOnly} />
      </Field>
      <fieldset className="grid gap-4 md:grid-cols-2" disabled={readOnly}>
        <legend className="mb-2 text-sm font-semibold">{t("permissions")}</legend>
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.key} className="rounded-[12px] bg-surface-2 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t(`permissionGroups.${g.key}`)}</p>
            {g.permissions.map((p) => {
              const locked = SUPER_ADMIN_ONLY.includes(p);
              return (
                <label key={p} className="flex items-start gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    name="permissions[]"
                    value={p}
                    disabled={locked}
                    checked={selected.has(p)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p);
                      else next.delete(p);
                      setSelected(next);
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#C8102E]"
                  />
                  <span>
                    <code className="text-xs font-semibold">{p}</code>
                    <span className="block text-xs text-muted">{locked ? t("superAdminOnly") : PERMISSIONS[p]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
      {!readOnly && (
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            {tc("save")}
          </Button>
          {role && (
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              loading={deleting}
              onClick={() =>
                start(async () => {
                  const r = await deleteRoleAction({ roleId: role.id });
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              {tc("delete")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
