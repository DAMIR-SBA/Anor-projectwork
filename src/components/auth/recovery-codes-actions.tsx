"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/interactive";
import { acknowledgeRecoveryCodesAction } from "@/server/actions/auth";

export function RecoveryCodesActions({ codes, next }: { codes: string[]; next: string }) {
  const t = useTranslations("auth");
  const [pending, start] = useTransition();
  const text = `ANOR recovery codes\n${new Date().toISOString().slice(0, 10)}\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <CopyButton value={codes.join("\n")} label={t("recoveryCopy")} copiedLabel="✓" />
        <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="anor-recovery-codes.txt" className="inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm font-semibold text-brand-ink hover:bg-primary/10">
          <Download className="h-4 w-4" /> {t("recoveryDownload")}
        </a>
      </div>
      <Button size="lg" className="w-full" loading={pending} onClick={() => start(() => acknowledgeRecoveryCodesAction(next))}>
        {t("recoveryAck")}
      </Button>
    </div>
  );
}
