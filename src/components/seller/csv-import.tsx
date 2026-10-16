"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { importCommitAction, importPreviewAction } from "@/server/actions/seller-products";
import type { ImportIssue, ImportRow } from "@/lib/seller";
import { formatUZS } from "@/lib/money";

type Preview = { valid: number; sample: ImportRow[]; issues: ImportIssue[]; issueCount: number };
type Result = { created: number; updated: number; errors: Array<{ line: number; code: string }> };

export function CsvImport() {
  const t = useTranslations("sellerProducts.import");
  const locale = useLocale();
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <p className="text-sm text-muted">{t("text")}</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[12px] bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
            <Upload className="h-4 w-4" /> {t("choose")}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setError(null);
                setResult(null);
                if (f.size > 2_000_000) return setError(t("tooBig"));
                const text = await f.text();
                setCsv(text);
                setFileName(f.name);
                start(async () => {
                  const res = await importPreviewAction({ csv: text });
                  if (!res.ok) return setError(res.error);
                  setPreview(res.data as Preview);
                });
              }}
            />
          </label>
          <a href="/api/seller/products/template" download className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border px-4 font-semibold hover:bg-surface-2">
            <FileSpreadsheet className="h-4 w-4" /> {t("template")}
          </a>
        </div>
        <p className="text-[13px] text-muted">{t("columns")}</p>
      </div>
      <FormError message={error} />
      {preview && !result && (
        <div className="card space-y-3 p-5">
          <p className="font-bold">
            {fileName}: {t("validRows", { count: preview.valid })}
            {preview.issueCount > 0 && <span className="text-danger"> · {t("issues", { count: preview.issueCount })}</span>}
          </p>
          {preview.issues.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-[10px] bg-danger/5 p-3 text-[13px]">
              {preview.issues.map((i, k) => (
                <li key={k}>
                  {t("line", { line: i.line })} · <b>{i.field}</b>: {t(`codes.${i.code}`)}
                </li>
              ))}
            </ul>
          )}
          {preview.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1">SKU</th>
                    <th>{t("titleCol")}</th>
                    <th>{t("categoryCol")}</th>
                    <th className="text-right">{t("priceCol")}</th>
                    <th className="text-right">{t("stockCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.sku} className="border-t border-border">
                      <td className="py-1.5 font-mono text-xs">{r.sku}</td>
                      <td className="max-w-64 truncate">{r.titleUz}</td>
                      <td className="text-xs">{r.category}</td>
                      <td className="tabular text-right">{formatUZS(r.price, locale)}</td>
                      <td className="tabular text-right">{r.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            disabled={!preview.valid || !csv}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await importCommitAction({ csv: csv! });
                if (!res.ok) return setError(res.error);
                setResult(res.data as Result);
                router.refresh();
              })
            }
          >
            {t("run", { count: preview.valid })}
          </Button>
        </div>
      )}
      {result && (
        <div className="card flex items-start gap-3 p-5">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="font-bold">{t("done", { created: result.created, updated: result.updated })}</p>
            <p className="text-sm text-muted">{t("doneHint")}</p>
            {result.errors.length > 0 && <p className="text-sm text-danger">{t("failedLines", { lines: result.errors.map((e) => e.line).join(", ") })}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
