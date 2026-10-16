"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
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
const COMPARE_EVENT = "anor-compare";
const EMPTY: string[] = [];

// The compare list lives in localStorage (survives reloads, shared by tabs); this store keeps
// one parsed copy per stored value so React sees a stable snapshot.
let cachedRaw: string | null = null;
let cachedList: string[] = EMPTY;
function readCompare(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(COMPARE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const v = JSON.parse(raw || "[]");
      cachedList = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 4) : EMPTY;
    } catch {
      cachedList = EMPTY;
    }
  }
  return cachedList;
}
function writeCompare(next: string[]) {
  try {
    if (next.length) localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    else localStorage.removeItem(COMPARE_KEY);
  } catch {
    /* private mode: the list lasts for this page only */
  }
  window.dispatchEvent(new Event(COMPARE_EVENT));
}
function subscribeCompare(cb: () => void) {
  window.addEventListener(COMPARE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COMPARE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ShopStateProvider({ children, likedIds, signedIn }: { children: ReactNode; likedIds: string[]; signedIn: boolean }) {
  const [liked, setLiked] = useState(() => new Set(likedIds));
  const compare = useSyncExternalStore(subscribeCompare, readCompare, () => EMPTY);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("compare");
  const tw = useTranslations("wishlist");

  // Fresh server data (after sign-in or a refresh) replaces the optimistic set.
  const [seenLiked, setSeenLiked] = useState(likedIds);
  if (seenLiked !== likedIds) {
    setSeenLiked(likedIds);
    setLiked(new Set(likedIds));
  }

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
      const prev = readCompare();
      if (prev.includes(productId)) return writeCompare(prev.filter((x) => x !== productId));
      if (prev.length >= 4) return void toast.error(t("limit"));
      writeCompare([...prev, productId]);
      toast.success(t("added"));
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
      clearCompare: () => writeCompare([]),
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
