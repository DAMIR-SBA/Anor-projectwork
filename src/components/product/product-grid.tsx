import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { ProductCardData } from "@/lib/types";
import { ProductCard, ProductCardSkeleton } from "./product-card";

import { GRID } from "./grid-class";
export { GRID };

export function ProductGrid({ items, className, priorityCount = 0 }: { items: ProductCardData[]; className?: string; priorityCount?: number }) {
  return (
    <div className={cn(GRID, className)}>
      {items.map((p, i) => (
        <ProductCard key={p.id} p={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function SectionTitle({ title, href, more, action }: { title: ReactNode; href?: string; more?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 md:mb-4">
      <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{title}</h2>
      {action}
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-brand-ink hover:underline">
          {more} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/** Horizontally scrolling row of product cards (snap on mobile). */
export function ProductRail({ items, title, href, more }: { items: ProductCardData[]; title: ReactNode; href?: string; more?: string }) {
  if (!items.length) return null;
  return (
    <section className="py-4">
      <SectionTitle title={title} href={href} more={more} />
      <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:gap-3 md:mx-0 md:px-0">
        {items.map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%] xl:w-[18.8%]">
            <ProductCard p={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
