"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ruler } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

export function SizeGuide({ guide }: { guide: { headers: string[]; rows: string[][] } }) {
  const t = useTranslations("product");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline">
        <Ruler className="h-4 w-4" /> {t("sizeGuide")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("sizeGuide")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              {guide.headers.map((h) => (
                <th key={h} className="py-1.5 pr-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((r) => (
              <tr key={r[0]} className="border-t border-border">
                {r.map((c, i) => (
                  <td key={i} className={i === 0 ? "py-1.5 pr-3 font-bold" : "tabular py-1.5 pr-3"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </>
  );
}
