"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { activeShop } from "@/server/services/seller/context";
import { createLinkToken } from "@/server/telegram/bot";

const rl = { key: "telegram.link", limit: 10, window: 600 };

/** Deep link to the bot; the bot links the account when it receives /start <token>. */
export const linkTelegramAction = action({ rateLimit: rl, schema: z.object({ shop: z.boolean().default(false) }) }, async (i, ctx) => {
  const shopId = i.shop ? (await activeShop(ctx.user.id)).id : undefined;
  const r = await createLinkToken(ctx.user.id, shopId);
  return { ok: true, data: r };
});

export const unlinkTelegramAction = action({ schema: z.object({ shop: z.boolean().default(false) }) }, async (i, ctx) => {
  if (i.shop) {
    const shop = await activeShop(ctx.user.id);
    await db.shop.update({ where: { id: shop.id }, data: { telegramChatId: null } });
    await audit({ actorId: ctx.user.id, actorKind: "seller", action: "shop.telegram_unlinked", entityType: "Shop", entityId: shop.id });
    revalidatePath("/[locale]/seller", "layout");
  } else {
    await db.user.update({ where: { id: ctx.user.id }, data: { telegramId: null, telegramUsername: null } });
    await audit({ actorId: ctx.user.id, actorKind: "user", action: "telegram.unlinked", entityType: "User", entityId: ctx.user.id });
    revalidatePath("/[locale]/account/notifications", "page");
  }
});
