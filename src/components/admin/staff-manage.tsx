"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/interactive";
import { useToast } from "@/components/ui/toast";
import { PERMISSION_GROUPS, SUPER_ADMIN_ONLY, type Permission } from "@/lib/rbac";
import { createInviteAction, promoteUserAction, changeRoleAction, setStaffStatusAction, revokeInviteAction } from "@/server/actions/staff";

type RoleOption = { key: string; name: string };
type OverrideState = Record<string, "GRANT" | "DENY" | undefined>;

function OverridesEditor({ value, onChange }: { value: OverrideState; onChange: (v: OverrideState) => void }) {
  const t = useTranslations("admin");
  return (
    <details className="rounded-[12px] border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t("overrides")}</summary>
      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.key}>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t(`permissionGroups.${g.key}`)}</p>
            {g.permissions
              .filter((p) => !SUPER_ADMIN_ONLY.includes(p))
              .map((p) => (
                <div key={p} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <code className="text-xs">{p}</code>
                  <select
                    className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
                    value={value[p] ?? ""}
                    onChange={(e) => onChange({ ...value, [p]: (e.target.value || undefined) as OverrideState[string] })}
                    aria-label={p}
                  >
                    <option value="">{t("inherit")}</option>
                    <option value="GRANT">{t("grant")}</option>
                    <option value="DENY">{t("deny")}</option>
                  </select>
                </div>
              ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function serialize(o: OverrideState) {
  return JSON.stringify(Object.entries(o).filter(([, e]) => e).map(([permission, effect]) => ({ permission: permission as Permission, effect })));
}

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [overrides, setOverrides] = useState<OverrideState>({});
  const [state, action, pending] = useActionState(createInviteAction, null);
  const [shown, setShown] = useState<string | null>(null);
  const invite = state?.ok ? (state.data as { code: string; link: string }) : null;
  return (
    <>
      <form action={action} className="space-y-3">
        <FormError message={state && !state.ok ? state.error : null} />
        <Field label={t("role")} htmlFor="inv-role">
          <Select id="inv-role" name="roleKey" defaultValue="SUPPORT">
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.key})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("note")} htmlFor="inv-note">
          <Textarea id="inv-note" name="note" rows={2} maxLength={200} />
        </Field>
        <OverridesEditor value={overrides} onChange={setOverrides} />
        <input type="hidden" name="overrides" value={serialize(overrides)} />
        <Button type="submit" loading={pending} className="w-full" onClick={() => setShown(null)}>
          {t("invite")}
        </Button>
        <p className="text-xs text-muted">{t("inviteHint")}</p>
      </form>
      <Dialog open={!!invite && shown !== invite.code} onClose={() => setShown(invite?.code ?? null)} title={t("inviteCreated")} closeLabel={tc("close")}>
        {invite && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("inviteCreatedText")}</p>
            <div className="flex items-center justify-between rounded-[12px] bg-surface-2 p-3 font-mono text-lg font-bold tracking-widest">
              {invite.code} <CopyButton value={invite.code} label={tc("copy")} copiedLabel={tc("copied")} />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[12px] bg-surface-2 p-3 text-xs">
              <span className="break-all">{invite.link}</span> <CopyButton value={invite.link} label={tc("copy")} copiedLabel={tc("copied")} />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

export function PromoteForm({ roles }: { roles: RoleOption[] }) {
  const t = useTranslations("admin");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState(promoteUserAction, null);
  const temp = state?.ok ? (state.data as { tempCode: string }).tempCode : null;
  return (
    <form action={action} className="space-y-3">
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label={ta("login")} htmlFor="pr-login" error={state && !state.ok ? state.fieldErrors?.login : undefined}>
        <Input id="pr-login" name="login" placeholder="demo_buyer" required />
      </Field>
      <Field label={t("role")} htmlFor="pr-role">
        <Select id="pr-role" name="roleKey" defaultValue="SUPPORT">
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="outline" loading={pending} className="w-full">
        {t("promote")}
      </Button>
      <p className="text-xs text-muted">{t("promoteHint")}</p>
      {temp && (
        <div className="rounded-[12px] bg-success/10 p-3 text-sm font-semibold text-success">
          {t("promoted")}. {t("tempCode", { code: temp })}
        </div>
      )}
    </form>
  );
}

export function StaffRowActions({ staff, roles, isSelf }: { staff: { id: string; role: string; status: string; overrides: Array<{ permission: string; effect: "GRANT" | "DENY" }> }; roles: RoleOption[]; isSelf: boolean }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<OverrideState>(Object.fromEntries(staff.overrides.map((o) => [o.permission, o.effect])));
  const [state, action, pending] = useActionState(changeRoleAction, null);
  const [busy, start] = useTransition();

  const setStatus = (status: "ACTIVE" | "SUSPENDED" | "REMOVED", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await setStaffStatusAction({ staffProfileId: staff.id, status });
      if (r.ok) toast.success(tc("saved"));
      else toast.error(r.error);
    });
  };

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("changeRole")}
      </Button>
      {staff.status === "ACTIVE" ? (
        <Button size="sm" variant="ghost" disabled={busy || isSelf} onClick={() => setStatus("SUSPENDED", t("confirmSuspend"))}>
          {t("suspend")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("ACTIVE")}>
          {t("restore")}
        </Button>
      )}
      {staff.status !== "REMOVED" && (
        <Button size="sm" variant="ghost" className="text-danger" disabled={busy || isSelf} onClick={() => setStatus("REMOVED", t("confirmRemove"))}>
          {t("remove")}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t("changeRole")} closeLabel={tc("close")}>
        <form
          action={async (fd) => {
            action(fd);
          }}
          className="space-y-3"
        >
          <FormError message={state && !state.ok ? state.error : null} />
          {state?.ok && <p className="text-sm font-semibold text-success">{tc("saved")}</p>}
          <input type="hidden" name="staffProfileId" value={staff.id} />
          <Select name="roleKey" defaultValue={staff.role} aria-label={t("role")}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.key})
              </option>
            ))}
          </Select>
          <OverridesEditor value={overrides} onChange={setOverrides} />
          <input type="hidden" name="overrides" value={serialize(overrides)} />
          <Button type="submit" loading={pending} className="w-full">
            {tc("save")}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const t = useTranslations("admin");
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-danger"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await revokeInviteAction({ inviteId });
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      {t("revoke")}
    </Button>
  );
}
