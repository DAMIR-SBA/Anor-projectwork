"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/toast";
import { toggleWishlistAction } from "@/server/actions/cart";

type ShopState = {
  signedIn: boolean;
  isLiked: (productId: string) => boolean;
  toggleLike: (productId: string) => void;
  compare: string[];
  toggleCompare: (productId: string) => void;
  clearCompare: () => void;
};

const Ctx = createContext<ShopState | null>(null);
const COMPARE_KEY = "anor_compare";

export function ShopStateProvider({ children, likedIds, signedIn }: { children: ReactNode; likedIds: string[]; signedIn: boolean }) {
  const [liked, setLiked] = useState(() => new Set(likedIds));
  const [compare, setCompare] = useState<string[]>([]);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("compare");
  const tw = useTranslations("wishlist");

  useEffect(() => setLiked(new Set(likedIds)), [likedIds]);
  useEffect(() => {
    try {
      setCompare(JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]") as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLike = useCallback(
    (productId: string) => {
      if (!signedIn) {
        toast.info(tw("loginRequired"));
        router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      // Optimistic: flip immediately, roll back on failure.
      setLiked((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      });
      start(async () => {
        const r = await toggleWishlistAction({ productId });
        if (!r.ok) {
          setLiked((prev) => {
            const next = new Set(prev);
            if (next.has(productId)) next.delete(productId);
            else next.add(productId);
            return next;
          });
          toast.error(r.error);
        }
      });
    },
    [signedIn, router, toast, tw],
  );

  const toggleCompare = useCallback(
    (productId: string) => {
      setCompare((prev) => {
        let next: string[];
        if (prev.includes(productId)) next = prev.filter((x) => x !== productId);
        else if (prev.length >= 4) {
          toast.error(t("limit"));
          return prev;
        } else {
          next = [...prev, productId];
          toast.success(t("added"));
        }
        try {
          localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [toast, t],
  );

  const value = useMemo<ShopState>(
    () => ({
      signedIn,
      isLiked: (id) => liked.has(id),
      toggleLike,
      compare,
      toggleCompare,
      clearCompare: () => {
        setCompare([]);
        try {
          localStorage.removeItem(COMPARE_KEY);
        } catch {
          /* ignore */
        }
      },
    }),
    [signedIn, liked, toggleLike, compare, toggleCompare],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShopState(): ShopState {
  const v = useContext(Ctx);
  if (!v) return { signedIn: false, isLiked: () => false, toggleLike: () => {}, compare: [], toggleCompare: () => {}, clearCompare: () => {} };
  return v;
}
