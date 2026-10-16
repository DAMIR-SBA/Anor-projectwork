"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { acceptQuote, cancelInvoice, declineQuoteByBuyer, markInvoicePaid, requestQuote, respondQuote, saveBusinessProfile } from "@/server/services/b2b";
import { BANK_ACCOUNT_RE, MFO_RE, QUOTE_MAX_QTY, QUOTE_VALID_DAYS, TAX_ID_RE } from "@/lib/b2b";

const optional = (re: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => !v || re.test(v), { message })
    .transform((v) => v || null);

export const saveBusinessAction = action(
  {
    rateLimit: { key: "b2b.profile", limit: 10, window: 3600 },
    schema: z.object({
      companyName: z.string().trim().min(2).max(160),
      taxId: z
        .string()
        .trim()
        .transform((v) => v.replace(/\s/g, ""))
        .refine((v) => TAX_ID_RE.test(v), { message: "taxId" }),
      legalAddress: z.string().trim().min(5).max(240),
      bankName: z
        .string()
        .trim()
        .max(120)
        .transform((v) => v || null),
      bankAccount: optional(BANK_ACCOUNT_RE, "bankAccount"),
      bankMfo: optional(MFO_RE, "mfo"),
    }),
  },
  async (i, ctx) => {
    await saveBusinessProfile(ctx.user.id, i);
    revalidatePath("/[locale]", "layout");
  },
);

export const requestQuoteAction = action(
  {
    rateLimit: { key: "b2b.quote", limit: 10, window: 3600 },
    schema: z.object({
      productId: z.string(),
      variantId: z.string().nullish(),
      quantity: z.coerce.number().int().min(1).max(QUOTE_MAX_QTY),
      targetPrice: z.coerce.number().int().positive().max(10_000_000_000).nullish(),
      message: z
        .string()
        .trim()
        .max(1000)
        .nullish()
        .transform((v) => v || null),
    }),
  },
  async (i, ctx) => {
    const q = await requestQuote(ctx.user, { productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, targetPrice: i.targetPrice ?? null, message: i.message });
    revalidatePath("/[locale]/account/business", "page");
    return { ok: true, data: { number: q.number } };
  },
);

export const acceptQuoteAction = action({ rateLimit: { key: "b2b.accept", ...LIMITS.mutation }, schema: z.object({ quoteId: z.string() }) }, async (i, ctx) => {
  await acceptQuote(ctx.user, i.quoteId);
  revalidatePath("/[locale]", "layout");
});

export const declineQuoteAction = action({ rateLimit: { key: "b2b.accept", ...LIMITS.mutation }, schema: z.object({ quoteId: z.string() }) }, async (i, ctx) => {
  await declineQuoteByBuyer(ctx.user.id, i.quoteId);
  revalidatePath("/[locale]/account/business", "page");
});

export const respondQuoteAction = action(
  {
    rateLimit: { key: "seller.quotes", ...LIMITS.mutation },
    schema: z.discriminatedUnion("decision", [
      z.object({ quoteId: z.string(), decision: z.literal("quote"), price: z.coerce.number().int().positive().max(10_000_000_000), validDays: z.coerce.number().refine((d) => (QUOTE_VALID_DAYS as readonly number[]).includes(d)), note: z.string().trim().max(1000).nullish() }),
      z.object({ quoteId: z.string(), decision: z.literal("decline"), note: z.string().trim().max(1000).nullish() }),
    ]),
  },
  async (i, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const note = i.note || null;
    await respondQuote(shop.id, { userId: ctx.user.id, login: ctx.user.login }, i.quoteId, i.decision === "quote" ? { decision: "quote", price: i.price, validDays: i.validDays, note } : { decision: "decline", note });
    revalidatePath("/[locale]/seller", "layout");
  },
);

const zRef = z.string().trim().min(3).max(60);

/** `reason` carries the bank payment order number (the ActionButton reason dialog). */
export const markInvoicePaidAction = action({ auth: "staff", permission: "finance.manage", rateLimit: { key: "admin.invoice", ...LIMITS.mutation }, schema: z.object({ invoiceId: z.string(), reason: zRef }) }, async (i, ctx) => {
  await markInvoicePaid({ id: ctx.staff.user.id, login: ctx.staff.user.login }, i.invoiceId, i.reason);
  revalidatePath("/[locale]/admin/finance", "page");
});

export const cancelInvoiceAction = action({ auth: "staff", permission: "finance.manage", rateLimit: { key: "admin.invoice", ...LIMITS.mutation }, schema: z.object({ invoiceId: z.string(), reason: z.string().trim().min(3).max(500) }) }, async (i, ctx) => {
  await cancelInvoice(i.invoiceId, { staff: { id: ctx.staff.user.id, login: ctx.staff.user.login }, reason: i.reason });
  revalidatePath("/[locale]/admin/finance", "page");
});
