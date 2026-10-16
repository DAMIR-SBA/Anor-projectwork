"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { action, AppError } from "@/server/action";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isOwnStorageUrl } from "@/server/storage";
import { COOKIE } from "@/server/auth/session";
import { deleteAccount, saveCookieConsent } from "@/server/services/privacy";

export const cookieConsentAction = action({ auth: "public", rateLimit: { key: "consent", limit: 20, window: 600 }, schema: z.object({ analytics: z.boolean(), marketing: z.boolean() }) }, async (i, ctx) => {
  await saveCookieConsent(i, ctx.user?.id ?? null);
});

export const updateProfileAction = action(
  {
    rateLimit: { key: "profile", limit: 20, window: 600 },
    schema: z.object({
      name: z.string().trim().min(2).max(60),
      email: z.union([z.literal(""), z.string().trim().email().max(120)]),
      avatarUrl: z.string().max(500).nullish(),
      locale: z.enum(["uz", "uz-Cyrl", "ru"]),
      marketing: z.boolean(),
    }),
  },
  async (i, ctx) => {
    const email = i.email.toLowerCase() || null;
    if (email && (await db.user.findFirst({ where: { email, id: { not: ctx.user.id } }, select: { id: true } }))) throw new AppError("emailTaken", undefined, "email");
    if (i.avatarUrl && !isOwnStorageUrl(i.avatarUrl)) throw new AppError("invalidInput", undefined, "avatarUrl");
    const before = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { email: true, marketingConsent: true } });
    await db.user.update({
      where: { id: ctx.user.id },
      data: { name: i.name, email, emailVerifiedAt: email === before.email ? undefined : null, avatarUrl: i.avatarUrl ?? null, locale: i.locale, marketingConsent: i.marketing },
    });
    if (before.marketingConsent !== i.marketing) await db.consentRecord.create({ data: { userId: ctx.user.id, type: "MARKETING", granted: i.marketing, version: "2026-01", ip: ctx.meta.ip } });
    await audit({ actorId: ctx.user.id, actorKind: "user", action: "profile.updated", entityType: "User", entityId: ctx.user.id, after: { name: i.name, emailChanged: email !== before.email, locale: i.locale, marketing: i.marketing } });
    revalidatePath("/[locale]", "layout");
  },
);

export const deleteAccountAction = action(
  { rateLimit: { key: "account.delete", limit: 5, window: 3600 }, schema: z.object({ password: z.string().max(200).optional(), login: z.string().max(40).optional(), phrase: z.string() }) },
  async (i, ctx) => {
    // The phrase as shown in each UI language (Latin, Cyrillic, Russian), plus English.
    if (!["DELETE", "O‘CHIRISH", "O'CHIRISH", "OʻCHIRISH", "ЎЧИРИШ", "УДАЛИТЬ"].includes(i.phrase.trim().toUpperCase())) throw new AppError("invalidInput", undefined, "phrase");
    await deleteAccount(ctx.user.id, { password: i.password, login: i.login });
    (await cookies()).delete(COOKIE.USER);
    return { ok: true };
  },
);
