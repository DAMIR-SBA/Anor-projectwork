"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { action, AppError, zBool, zInt } from "@/server/action";
import { audit } from "@/server/audit";

const zArticle = z.object({
  id: z.string().optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, "invalidFormat"),
  section: z.enum(["buyers", "sellers", "company"]),
  titleUz: z.string().trim().min(3).max(140),
  titleRu: z.string().trim().min(3).max(140),
  bodyUz: z.string().trim().min(10).max(20_000),
  bodyRu: z.string().trim().min(10).max(20_000),
  sort: zInt(0, 999).default(0),
  isPublished: zBool.default(true),
});

export const saveHelpArticleAction = action({ auth: "staff", permission: "help.manage", schema: zArticle }, async (input, ctx) => {
  const { id, ...data } = input;
  const dup = await db.helpArticle.findFirst({ where: { slug: data.slug, ...(id ? { NOT: { id } } : {}) } });
  if (dup) throw new AppError("slugTaken", undefined, "slug");
  const row = id ? await db.helpArticle.update({ where: { id }, data }) : await db.helpArticle.create({ data });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: id ? "help.update" : "help.create", entityType: "HelpArticle", entityId: row.id, after: { slug: row.slug, isPublished: row.isPublished } });
  revalidatePath("/[locale]/help", "layout");
  return { ok: true, data: { id: row.id } };
});

export const deleteHelpArticleAction = action({ auth: "staff", permission: "help.manage", schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const row = await db.helpArticle.delete({ where: { id: input.id } });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: "help.delete", entityType: "HelpArticle", entityId: row.id, before: { slug: row.slug } });
  revalidatePath("/[locale]/help", "layout");
});
