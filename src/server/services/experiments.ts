import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { rateLimit } from "@/server/security/rate-limit";
import type { ProductCardData } from "@/lib/types";

/** Stable 50/50 split per viewer and experiment. */
export function armFor(viewerId: string, experimentId: string): "A" | "B" {
  return createHash("sha256").update(`${experimentId}:${viewerId}`).digest()[0] % 2 === 0 ? "A" : "B";
}

type Variant = { title?: string; image?: string };

/**
 * Title/photo A/B tests on listing cards. Titles are authored in Uzbek, so title tests run for the
 * Uzbek UI only; Russian viewers always see the original and are not counted.
 */
export async function applyExperiments(cards: ProductCardData[], viewerId: string | null | undefined, locale: string) {
  if (!viewerId || !cards.length) return { cards, shown: [] as Array<{ id: string; arm: "A" | "B" }> };
  const running = await db.productExperiment.findMany({ where: { status: "RUNNING", productId: { in: cards.map((c) => c.id) } } });
  if (!running.length) return { cards, shown: [] };
  const byProduct = new Map(running.map((e) => [e.productId, e]));
  const shown: Array<{ id: string; arm: "A" | "B" }> = [];
  const out = cards.map((c) => {
    const e = byProduct.get(c.id);
    if (!e || c.sponsored || (e.type === "title" && locale === "ru")) return c;
    const arm = armFor(viewerId, e.id);
    shown.push({ id: e.id, arm });
    if (arm === "A") return { ...c, ab: arm };
    const b = e.variantB as Variant;
    return { ...c, ab: arm, ...(e.type === "title" && b.title ? { title: b.title } : {}), ...(e.type === "image" && b.image ? { image: b.image } : {}) };
  });
  return { cards: out, shown };
}

export async function recordExperimentImpressions(shown: Array<{ id: string; arm: "A" | "B" }>) {
  for (const s of shown) await db.productExperiment.updateMany({ where: { id: s.id, status: "RUNNING" }, data: s.arm === "A" ? { impressionsA: { increment: 1 } } : { impressionsB: { increment: 1 } } });
}

/** Product page opened from a test card (`?ab=`): one click per viewer per experiment per day. */
export async function recordExperimentClick(productId: string, viewerId: string | null | undefined, ab: string | undefined) {
  if (!viewerId || (ab !== "A" && ab !== "B")) return;
  const e = await db.productExperiment.findFirst({ where: { productId, status: "RUNNING" } });
  // The arm must match the viewer's assignment, so a crafted ?ab= cannot skew results.
  if (!e || armFor(viewerId, e.id) !== ab) return;
  const rl = await rateLimit(`abclick:${e.id}:${viewerId}`, 1, 86_400);
  if (!rl.success) return;
  await db.productExperiment.update({ where: { id: e.id }, data: ab === "A" ? { clicksA: { increment: 1 } } : { clicksB: { increment: 1 } } });
}

/** Title the viewer should see on the product page (keeps the test consistent after the click). */
export async function experimentTitle(productId: string, viewerId: string | null | undefined, locale: string): Promise<string | null> {
  if (!viewerId || locale === "ru") return null;
  const e = await db.productExperiment.findFirst({ where: { productId, status: "RUNNING", type: "title" } });
  if (!e || armFor(viewerId, e.id) !== "B") return null;
  return (e.variantB as Variant).title ?? null;
}
