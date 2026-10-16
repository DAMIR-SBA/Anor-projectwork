"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type Result = { ok: boolean; error?: string; data?: unknown };

type Props<I extends object> = {
  action: (input: I) => Promise<Result>;
  input: Omit<I, "reason">;
  label: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** Plain confirmation prompt before running. */
  confirm?: string;
  /** Ask for a written reason in a dialog; it is sent as `reason`. */
  reason?: { title: string; label?: string; required?: boolean; placeholder?: string; hint?: string };
  /** Toast after success (defaults to a generic "saved"). */
  success?: string;
  onDone?: (data: unknown) => void;
};

/**
 * Button that runs a staff server action, optionally after a confirmation or a reason dialog,
 * then shows a toast and refreshes the page. Used across the admin panel.
 */
export function ActionButton<I extends object>({ action, input, label, icon, variant = "secondary", size = "sm", className, disabled, confirm, reason, success, onDone }: Props<I>) {
  const t = useTranslations("admin.ui");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (extra: Record<string, unknown> = {}) =>
    start(async () => {
      setError(null);
      const res = await action({ ...input, ...extra } as I);
      if (!res.ok) {
        if (open) setError(res.error ?? t("failed"));
        else toast.error(res.error ?? t("failed"));
        return;
      }
      setOpen(false);
      setText("");
      toast.success(success ?? t("saved"));
      onDone?.(res.data);
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        disabled={disabled || pending}
        loading={pending && !open}
        leftIcon={icon}
        onClick={() => {
          if (reason) return setOpen(true);
          if (confirm && !window.confirm(confirm)) return;
          run();
        }}
      >
        {label}
      </Button>
      {reason && open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={reason.title}
          closeLabel={tc("close")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tc("back")}
              </Button>
              <Button variant={variant === "danger" ? "danger" : "primary"} loading={pending} disabled={reason.required !== false && text.trim().length < 3} onClick={() => run({ reason: text.trim() })}>
                {t("confirm")}
              </Button>
            </>
          }
        >
          <Field label={reason.label ?? t("reason")} htmlFor="admin-reason" hint={reason.hint}>
            <Textarea id="admin-reason" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} maxLength={1000} autoFocus />
          </Field>
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}
