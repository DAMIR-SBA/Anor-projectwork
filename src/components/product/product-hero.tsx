"use client";

import { useState, type ReactNode } from "react";
import { Gallery, type GalleryItem } from "./gallery";
import { BuyBox } from "./buy-box";

type BuyProps = Omit<Parameters<typeof BuyBox>[0], "onVariantImage">;

/** Gallery + buy box sharing the selected variant (switching a color shows its photo). */
export function ProductHero({ gallery, buy, title, meta, aside }: { gallery: GalleryItem[]; buy: BuyProps; title: ReactNode; meta: ReactNode; aside: ReactNode }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.75fr)_320px]">
      <Gallery items={gallery} activeUrl={activeUrl} />
      <div className="space-y-4">
        {title}
        {meta}
        <div className="xl:hidden">
          <BuyBox {...buy} onVariantImage={setActiveUrl} />
        </div>
        {aside}
      </div>
      <div className="hidden xl:block">
        <div className="card sticky top-36 p-4">
          <BuyBox {...buy} onVariantImage={setActiveUrl} />
        </div>
      </div>
    </div>
  );
}
