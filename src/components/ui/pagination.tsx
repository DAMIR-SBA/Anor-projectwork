"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export function Pagination({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const search = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams(search.toString());
    q.set("page", String(p));
    return `${pathname}?${q.toString()}`;
  };
  const window = [page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages);
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <Link href={href(Math.max(1, page - 1))} aria-disabled={page === 1} className={cn("rounded-[10px] p-2 hover:bg-surface-3", page === 1 && "pointer-events-none opacity-40")} aria-label={t("prev")}>
        <ChevronLeft className="h-5 w-5" />
      </Link>
      {window.map((p) => (
        <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined} className={cn("min-w-9 rounded-[10px] px-2 py-1.5 text-center text-sm font-semibold hover:bg-surface-3", p === page && "bg-primary text-white hover:bg-primary")}>
          {p}
        </Link>
      ))}
      <Link href={href(Math.min(pages, page + 1))} aria-disabled={page === pages} className={cn("rounded-[10px] p-2 hover:bg-surface-3", page === pages && "pointer-events-none opacity-40")} aria-label={t("next")}>
        <ChevronRight className="h-5 w-5" />
      </Link>
    </nav>
  );
}
