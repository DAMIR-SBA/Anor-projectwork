import "server-only";
import { updateTag } from "next/cache";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { slugify } from "@/lib/seller";
import type { Staff } from "./shops";

export type CategoryAttribute = { key: string; nameUz: string; nameRu: string; type: "select" | "number" | "text"; options?: string[] };

/** All categories (active or not) as a depth-first list with product counts and tier rates. */
export async function adminCategories() {
  const [rows, counts, rules] = await Promise.all([
    db.category.findMany({ orderBy: [{ sort: "asc" }, { nameUz: "asc" }] }),
    db.product.groupBy({ by: ["categoryId"], where: { deletedAt: null }, _count: { _all: true } }),
    db.commissionRule.findMany(),
  ]);
  const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  const out: Array<(typeof rows)[number] & { depth: number; products: number; childCount: number; basic: number; pro: number; attrs: CategoryAttribute[] }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      const basic = rules.find((r) => r.categoryId === c.id && r.tier === "BASIC")?.rate ?? c.commissionRate;
      const pro = rules.find((r) => r.categoryId === c.id && r.tier === "PRO")?.rate ?? Math.max(0.03, basic - 0.02);
      out.push({ ...c, depth, products: count.get(c.id) ?? 0, childCount: (byParent.get(c.id) ?? []).length, basic, pro, attrs: (c.attributes as CategoryAttribute[] | null) ?? [] });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

async function descendants(id: string): Promise<string[]> {
  const all = await db.category.findMany({ select: { id: true, parentId: true } });
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of all) if (c.parentId === cur) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}

export type CategoryInput = { nameUz: string; nameRu: string; slug?: string; parentId: string | null; icon?: string | null; imageUrl?: string | null; sort: number; commissionRate: number; nasiyaEligible: boolean; isActive: boolean; attributes: CategoryAttribute[] };

export async function saveCategory(staff: Staff, input: CategoryInput, id?: string) {
  const slug = slugify(input.slug || input.nameUz);
  if (slug.length < 2) throw new AppError("slugInvalid", undefined, "slug");
  if (await db.category.findFirst({ where: { slug, NOT: { id: id ?? "-" } } })) throw new AppError("slugTaken", undefined, "slug");
  if (input.parentId) {
    if (id && (input.parentId === id || (await descendants(id)).includes(input.parentId))) throw new AppError("categoryCycle", undefined, "parentId");
    if (!(await db.category.findUnique({ where: { id: input.parentId } }))) throw new AppError("notFound", undefined, "parentId");
  }
  const keys = input.attributes.map((a) => a.key);
  if (new Set(keys).size !== keys.length) throw new AppError("invalidInput", undefined, "attributes");
  const data = { nameUz: input.nameUz.trim(), nameRu: input.nameRu.trim(), slug, parentId: input.parentId, icon: input.icon || null, imageUrl: input.imageUrl || null, sort: input.sort, commissionRate: input.commissionRate, nasiyaEligible: input.nasiyaEligible, isActive: input.isActive, attributes: input.attributes.length ? input.attributes : undefined };
  const before = id ? await db.category.findUnique({ where: { id } }) : null;
  const c = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
  // Keep the BASIC rule in step with the category default.
  await db.commissionRule.upsert({ where: { categoryId_tier: { categoryId: c.id, tier: "BASIC" } }, create: { categoryId: c.id, tier: "BASIC", rate: input.commissionRate }, update: { rate: input.commissionRate } });
  if (!id) await db.commissionRule.create({ data: { categoryId: c.id, tier: "PRO", rate: Math.max(0.03, input.commissionRate - 0.02) } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "category.updated" : "category.created", entityType: "Category", entityId: c.id, before: before ? { nameUz: before.nameUz, parentId: before.parentId, commissionRate: before.commissionRate, isActive: before.isActive } : undefined, after: { nameUz: c.nameUz, parentId: c.parentId, commissionRate: c.commissionRate, isActive: c.isActive } });
  updateTag("categories");
  return c;
}

/** Delete only empty leaves; anything with products or children is deactivated instead. */
export async function deleteCategory(staff: Staff, id: string) {
  const [children, products] = await Promise.all([db.category.count({ where: { parentId: id } }), db.product.count({ where: { categoryId: id } })]);
  if (children || products) throw new AppError("categoryInUse");
  await db.$transaction([db.commissionRule.deleteMany({ where: { categoryId: id } }), db.category.delete({ where: { id } })]);
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "category.deleted", entityType: "Category", entityId: id });
  updateTag("categories");
}

/** Commission table: BASIC and PRO rate per category, optionally cascading to subcategories. */
export async function saveCommissions(staff: Staff, rows: Array<{ categoryId: string; basic: number; pro: number; cascade?: boolean }>) {
  let changed = 0;
  for (const r of rows) {
    if (r.pro > r.basic) throw new AppError("proAboveBasic", undefined, r.categoryId);
    const ids = [r.categoryId, ...(r.cascade ? await descendants(r.categoryId) : [])];
    for (const categoryId of ids) {
      await db.category.update({ where: { id: categoryId }, data: { commissionRate: r.basic } });
      await db.commissionRule.upsert({ where: { categoryId_tier: { categoryId, tier: "BASIC" } }, create: { categoryId, tier: "BASIC", rate: r.basic }, update: { rate: r.basic } });
      await db.commissionRule.upsert({ where: { categoryId_tier: { categoryId, tier: "PRO" } }, create: { categoryId, tier: "PRO", rate: r.pro }, update: { rate: r.pro } });
      changed++;
    }
  }
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "commissions.updated", entityType: "CommissionRule", after: { rows: rows.map((r) => ({ c: r.categoryId, basic: r.basic, pro: r.pro, cascade: !!r.cascade })) } });
  return changed;
}
