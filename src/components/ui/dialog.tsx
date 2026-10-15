"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** "center" modal or bottom "sheet" on mobile. */
  variant?: "center" | "sheet" | "drawer";
  className?: string;
  closeLabel?: string;
};

/** Native <dialog>: focus trap, Esc and inert background come from the platform. */
export function Dialog({ open, onClose, title, children, footer, variant = "center", className, closeLabel = "Close" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = () => onClose();
    el.addEventListener("close", handle);
    return () => el.removeEventListener("close", handle);
  }, [onClose]);

  const position =
    variant === "sheet"
      ? "mb-0 mt-auto w-full max-w-full rounded-t-[20px] sm:m-auto sm:max-w-lg sm:rounded-[20px]"
      : variant === "drawer"
        ? "ml-auto mr-0 h-full max-h-full w-[min(420px,100vw)] rounded-none"
        : "m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px]";

  return (
    <dialog
      ref={ref}
      className={cn(
        "bg-surface p-0 text-fg shadow-[var(--shadow-lift)] backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-[2px] open:animate-[slide-up_0.2s_ease-out]",
        position,
        className,
      )}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={closeLabel}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </dialog>
  );
}
