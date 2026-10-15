"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { LayoutGrid, X, ChevronRight } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { loc } from "@/lib/localized";
import { CategoryIcon } from "@/components/catalog/category-icon";
import { cn } from "@/lib/cn";
import type { CategoryNode } from "@/server/services/categories";

/** "Katalog" button with a desktop mega menu (root categories → subcategories). */
export function CatalogButton({ categories, label }: { categories: CategoryNode[]; label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(categories[0]?.id);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const current = categories.find((c) => c.id === active) ?? categories[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("hidden h-11 shrink-0 items-center gap-2 rounded-[12px] px-4 text-[15px] font-bold text-white transition-colors md:flex", open ? "bg-primary-dark" : "bg-primary hover:bg-primary-dark")}
      >
        {open ? <X className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
        {label}
      </button>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[109px] z-30 hidden md:block">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <div className="container-page relative">
            <div className="grid max-h-[70vh] grid-cols-[280px_1fr] overflow-hidden rounded-b-[20px] bg-surface shadow-[var(--shadow-lift)]">
              <ul className="overflow-y-auto border-r border-border p-2">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/c/${c.slug}`}
                      onMouseEnter={() => setActive(c.id)}
                      onFocus={() => setActive(c.id)}
                      className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-semibold", c.id === current?.id ? "bg-primary-50 text-primary dark:bg-primary/15" : "hover:bg-surface-2")}
                    >
                      <CategoryIcon name={c.icon} className="h-5 w-5" />
                      <span className="flex-1">{loc(c, "name", locale)}</span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </Link>
                  </li>
                ))}
              </ul>
              {current && (
                <div className="overflow-y-auto p-6">
                  <Link href={`/c/${current.slug}`} className="text-2xl font-extrabold hover:text-primary">
                    {loc(current, "name", locale)}
                  </Link>
                  <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-3">
                    {current.children.map((sub) => (
                      <div key={sub.id}>
                        <Link href={`/c/${sub.slug}`} className="font-bold hover:text-primary">
                          {loc(sub, "name", locale)}
                        </Link>
                        {sub.children.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {sub.children.map((leaf) => (
                              <li key={leaf.id}>
                                <Link href={`/c/${leaf.slug}`} className="text-sm text-muted hover:text-fg">
                                  {loc(leaf, "name", locale)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
