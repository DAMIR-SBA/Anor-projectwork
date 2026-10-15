import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";

export type CategoryNode = { id: string; slug: string; nameUz: string; nameRu: string; nameCyrl: string | null; icon: string | null; imageUrl: string | null; children: CategoryNode[] };

/** Category tree (cached 5 min; invalidated by tag "categories" on admin edits). */
export const getCategoryTree = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    const rows = await db.category.findMany({ where: { isActive: true }, orderBy: [{ sort: "asc" }, { nameUz: "asc" }] });
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    const build = (parentId: string | null): CategoryNode[] =>
      (byParent.get(parentId) ?? []).map((c) => ({ id: c.id, slug: c.slug, nameUz: c.nameUz, nameRu: c.nameRu, nameCyrl: c.nameCyrl, icon: c.icon, imageUrl: c.imageUrl, children: build(c.id) }));
    return build(null);
  },
  ["category-tree"],
  { revalidate: 300, tags: ["categories"] },
);
