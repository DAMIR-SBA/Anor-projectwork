import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { completePayment } from "@/server/payments/service";
import { taxRegistry } from "@/server/b2b/tax-registry";
import { randomDigits } from "@/server/security/crypto";
import { cancelUnpaidGroup } from "./orders";
import { resolveCart } from "./cart";
import { platformSettings } from "./platform";
import { QUOTE_ANSWER_DAYS, QUOTE_MIN_QTY, quoteNumber, quoteState } from "@/lib/b2b";
import { groupDigits } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";

const DAY = 86_400_000;

export type BusinessInput = { companyName: string; taxId: string; legalAddress: string; bankName: string | null; bankAccount: string | null; bankMfo: string | null };

/** The buyer's company, or null. */
export function businessProfile(userId: string) {
  return db.businessProfile.findUnique({ where: { userId } });
}

/** Verified companies may pay by bank transfer and request quotes; wholesale tiers apply to any company. */
export async function isVerifiedBusiness(userId: string) {
  return !!(await db.businessProfile.findFirst({ where: { userId, verifiedAt: { not: null } }, select: { id: true } }));
}

/** Create or update the company. A new STIR is checked against the tax registry before it counts as verified. */
export async function saveBusinessProfile(userId: string, input: BusinessInput) {
  const before = await businessProfile(userId);
  const taken = await db.businessProfile.findFirst({ where: { taxId: input.taxId, userId: { not: userId } }, select: { id: true } });
  if (taken) throw new AppError("businessTaxIdTaken", undefined, "taxId");
  let verifiedAt = before?.taxId === input.taxId ? before.verifiedAt : null;
  if (!verifiedAt) {
    const { status } = await taxRegistry().lookup(input.taxId);
    if (status === "not_found") throw new AppError("taxIdNotFound", undefined, "taxId");
    if (status === "inactive") throw new AppError("taxIdInactive", undefined, "taxId");
    verifiedAt = new Date();
  }
  const data = { ...input, verifiedAt };
  const saved = await db.businessProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await audit({ actorId: userId, actorKind: "user", action: before ? "b2b.profile_updated" : "b2b.profile_created", entityType: "BusinessProfile", entityId: saved.id, before: before ? { companyName: before.companyName, taxId: before.taxId } : undefined, after: { companyName: saved.companyName, taxId: saved.taxId } });
  return saved;
}

// ── Quotes ───────────────────────────────────────────────────────────────

export async function requestQuote(user: CurrentUser, input: { productId: string; variantId: string | null; quantity: number; targetPrice: number | null; message: string | null }) {
  if (!(await isVerifiedBusiness(user.id))) throw new AppError("businessRequired");
  const product = await db.product.findFirst({
    where: { id: input.productId, status: "ACTIVE", deletedAt: null, shop: { status: "APPROVED" } },
    select: { id: true, titleUz: true, shopId: true, shop: { select: { ownerId: true } }, variants: { select: { id: true, price: true } } },
  });
  if (!product) throw new AppError("notFound");
  if (product.shop.ownerId === user.id) throw new AppError("forbidden");
  const variant = product.variants.find((v) => v.id === input.variantId) ?? product.variants[0];
  if (!variant) throw new AppError("notFound");
  if (input.quantity < QUOTE_MIN_QTY) throw new AppError("quoteMinQty", { min: QUOTE_MIN_QTY }, "quantity");
  if (input.targetPrice != null && input.targetPrice >= variant.price) throw new AppError("quoteTargetHigh", undefined, "targetPrice");
  const open = await db.quoteRequest.count({ where: { userId: user.id, productId: product.id, status: { in: ["OPEN", "QUOTED"] } } });
  if (open) throw new AppError("quoteExists");
  const q = await db.quoteRequest.create({
    data: { number: quoteNumber(), userId: user.id, shopId: product.shopId, productId: product.id, variantId: variant.id, quantity: input.quantity, targetPrice: input.targetPrice, message: input.message },
  });
  await notify({ userId: product.shop.ownerId, type: "seller.quote_request", title: `Narx so‘rovi ${q.number}`, body: `${product.titleUz} — ${input.quantity} dona`, href: "/seller/quotes", channels: ["telegram", "push"] });
  return q;
}

const quoteInclude = {
  product: { select: { slug: true, titleUz: true, titleRu: true, titleCyrl: true, media: { where: { type: "IMAGE" as const }, orderBy: { sort: "asc" as const }, take: 1, select: { url: true } } } },
  variant: { select: { titleUz: true, titleRu: true, price: true, stock: true } },
  shop: { select: { name: true, slug: true } },
} as const;

export async function buyerQuotes(userId: string) {
  const rows = await db.quoteRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: quoteInclude });
  const now = new Date();
  return rows.map((q) => ({ ...q, state: quoteState(q, now) }));
}

export async function sellerQuotes(shopId: string, tab: "open" | "answered" | "closed") {
  const status = tab === "open" ? ["OPEN"] : tab === "answered" ? ["QUOTED", "ACCEPTED"] : ["ORDERED", "DECLINED", "EXPIRED"];
  const [items, counts] = await Promise.all([
    db.quoteRequest.findMany({
      where: { shopId, status: { in: status as Array<"OPEN"> } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { ...quoteInclude, user: { select: { name: true, businessProfile: { select: { companyName: true, taxId: true, verifiedAt: true } } } } },
    }),
    db.quoteRequest.groupBy({ by: ["status"], where: { shopId }, _count: { _all: true } }),
  ]);
  const now = new Date();
  return { items: items.map((q) => ({ ...q, state: quoteState(q, now) })), open: counts.find((c) => c.status === "OPEN")?._count._all ?? 0 };
}

export async function respondQuote(shopId: string, actor: { userId: string; login: string }, quoteId: string, input: { decision: "quote"; price: number; validDays: number; note: string | null } | { decision: "decline"; note: string | null }) {
  const q = await db.quoteRequest.findFirst({ where: { id: quoteId, shopId }, include: { variant: { select: { price: true } }, product: { select: { titleUz: true } } } });
  if (!q) throw new AppError("notFound");
  if (quoteState(q) !== "OPEN") throw new AppError("conflict");
  const now = new Date();
  if (input.decision === "quote") {
    const list = q.variant?.price ?? Infinity;
    if (input.price >= list) throw new AppError("quotePriceHigh", undefined, "price");
    await db.quoteRequest.update({ where: { id: q.id }, data: { status: "QUOTED", quotedPrice: input.price, sellerNote: input.note, quotedAt: now, validUntil: new Date(now.getTime() + input.validDays * DAY) } });
    await notify({ userId: q.userId, type: "b2b.quote_answered", title: `Narx taklifi ${q.number}`, body: `${q.product.titleUz}: ${groupDigits(input.price)} so‘m × ${q.quantity}`, href: "/account/business#quotes", channels: ["email", "telegram", "push"] });
  } else {
    await db.quoteRequest.update({ where: { id: q.id }, data: { status: "DECLINED", sellerNote: input.note, quotedAt: now } });
    await notify({ userId: q.userId, type: "b2b.quote_declined", title: `Narx so‘rovi ${q.number}`, body: q.product.titleUz, href: "/account/business#quotes" });
  }
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: `quote.${input.decision === "quote" ? "answered" : "declined"}`, entityType: "QuoteRequest", entityId: q.id, meta: input.decision === "quote" ? { price: input.price, validDays: input.validDays } : undefined });
}

/** Accept the seller's price: the line goes to the cart with the quoted quantity and price locked. */
export async function acceptQuote(user: CurrentUser, quoteId: string) {
  const q = await db.quoteRequest.findFirst({ where: { id: quoteId, userId: user.id }, include: { variant: { select: { id: true, stock: true, product: { select: { isPreorder: true, status: true } } } } } });
  if (!q || !q.variant || q.variant.product.status !== "ACTIVE") throw new AppError("notFound");
  if (quoteState(q) !== "QUOTED") throw new AppError("quoteExpired");
  if (!q.variant.product.isPreorder && q.variant.stock < q.quantity) throw new AppError("outOfStock");
  const cart = (await resolveCart(user, true))!;
  await db.$transaction(async (tx) => {
    const ok = await tx.quoteRequest.updateMany({ where: { id: q.id, status: "QUOTED" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    if (ok.count !== 1) throw new AppError("conflict");
    await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: q.variant!.id } },
      create: { cartId: cart.id, variantId: q.variant!.id, quantity: q.quantity, quoteId: q.id, addedById: user.id },
      update: { quantity: q.quantity, quoteId: q.id, selected: true },
    });
  });
}

/** Buyer withdraws an open request or turns down a price. */
export async function declineQuoteByBuyer(userId: string, quoteId: string) {
  const ok = await db.quoteRequest.updateMany({ where: { id: quoteId, userId, status: { in: ["OPEN", "QUOTED"] } }, data: { status: "DECLINED" } });
  if (ok.count !== 1) throw new AppError("conflict");
}

/** Hourly: unanswered requests and lapsed prices expire; accepted-but-unbought lines leave the cart. */
export async function expireQuotes(now = new Date()) {
  const lapsedPrice = await db.quoteRequest.updateMany({ where: { status: { in: ["QUOTED", "ACCEPTED"] }, validUntil: { lt: now } }, data: { status: "EXPIRED" } });
  const unanswered = await db.quoteRequest.updateMany({ where: { status: "OPEN", createdAt: { lt: new Date(now.getTime() - QUOTE_ANSWER_DAYS * DAY) } }, data: { status: "EXPIRED" } });
  const detached = await db.cartItem.deleteMany({ where: { quote: { status: "EXPIRED" } } });
  return { lapsedPrice: lapsedPrice.count, unanswered: unanswered.count, removedFromCarts: detached.count };
}

// ── Invoices ─────────────────────────────────────────────────────────────

export function invoiceNumber(groupNumber: string) {
  return `INV-${groupNumber}`;
}

/** Requisites frozen on the invoice: who pays (the company) and who receives (the operator). */
export async function invoiceRequisites(userId: string) {
  const [b, platform] = await Promise.all([businessProfile(userId), platformSettings()]);
  if (!b?.verifiedAt) throw new AppError("businessRequired");
  return {
    payer: { companyName: b.companyName, taxId: b.taxId, legalAddress: b.legalAddress, bankName: b.bankName, bankAccount: b.bankAccount, bankMfo: b.bankMfo },
    payee: platform.requisites,
  };
}

export async function buyerInvoices(userId: string) {
  return db.invoice.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { group: { select: { id: true, number: true, orders: { select: { id: true, number: true, status: true }, take: 1 } } } } });
}

export async function adminInvoices(status: "ISSUED" | "PAID" | "CANCELLED" | "all", page: number, pageSize = 25) {
  const where = status === "all" ? {} : { status };
  const [items, total, sums] = await Promise.all([
    db.invoice.findMany({ where, orderBy: [{ status: "asc" }, { dueDate: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { login: true, businessProfile: { select: { companyName: true, taxId: true } } } }, group: { select: { number: true } } } }),
    db.invoice.count({ where }),
    db.invoice.groupBy({ by: ["status"], _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return { items, total, sums };
}

/** Finance confirms the money arrived (matching the bank statement) — the order is released to the seller. */
export async function markInvoicePaid(staff: { id: string; login: string }, invoiceId: string, paidRef: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new AppError("notFound");
  if (inv.status !== "ISSUED") throw new AppError("conflict");
  const payment = await db.payment.findFirst({ where: { groupId: inv.groupId, method: "BANK_TRANSFER", status: "PENDING" } });
  if (!payment) throw new AppError("conflict");
  // Nothing left to release (the buyer cancelled meanwhile): the money goes back, not into a dead order.
  if (!(await db.order.count({ where: { groupId: inv.groupId, status: "PENDING_PAYMENT" } }))) throw new AppError("invoiceOrdersCancelled");
  const ok = await db.invoice.updateMany({ where: { id: inv.id, status: "ISSUED" }, data: { status: "PAID", paidAt: new Date(), paidRef, paidById: staff.id, eInvoiceId: `EHF-${randomDigits(12)}` } });
  if (ok.count !== 1) throw new AppError("conflict");
  await db.payment.update({ where: { id: payment.id }, data: { externalId: paidRef } });
  // Runs the ORDER handler: orders move to PLACED, receipts are issued, sellers are notified.
  await completePayment(payment.id, true);
  await audit({ actorId: staff.id, actorLogin: staff.login, actorKind: "staff", action: "invoice.marked_paid", entityType: "Invoice", entityId: inv.id, meta: { number: inv.number, amount: inv.amount, paidRef } });
  await notify({ userId: inv.userId, type: "b2b.invoice_paid", title: `Hisob ${inv.number} to‘landi`, body: `${groupDigits(inv.amount)} so‘m qabul qilindi. Buyurtma sotuvchiga yuborildi.`, href: "/account/business#invoices", channels: ["email", "push"] });
}

/** Cancel an unpaid invoice (staff on request, or the job after the due date) and release the stock. */
export async function cancelInvoice(invoiceId: string, by: { staff?: { id: string; login: string }; reason: string }) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new AppError("notFound");
  const ok = await db.invoice.updateMany({ where: { id: inv.id, status: "ISSUED" }, data: { status: "CANCELLED" } });
  if (ok.count !== 1) throw new AppError("conflict");
  await db.payment.updateMany({ where: { groupId: inv.groupId, method: "BANK_TRANSFER", status: "PENDING" }, data: { status: "FAILED" } });
  await cancelUnpaidGroup(inv.groupId, by.staff ? "invoice_cancelled" : "invoice_overdue");
  await audit({ actorId: by.staff?.id ?? null, actorLogin: by.staff?.login ?? null, actorKind: by.staff ? "staff" : "system", action: "invoice.cancelled", entityType: "Invoice", entityId: inv.id, meta: { number: inv.number, reason: by.reason } });
  await notify({ userId: inv.userId, type: "b2b.invoice_cancelled", title: `Hisob ${inv.number} bekor qilindi`, body: by.staff ? by.reason : "To‘lov muddati o‘tdi, buyurtma bekor qilindi.", href: "/account/business#invoices" });
}

export async function expireInvoices(now = new Date()) {
  const due = await db.invoice.findMany({ where: { status: "ISSUED", dueDate: { lt: now } }, select: { id: true }, take: 200 });
  let cancelled = 0;
  for (const i of due) {
    try {
      await cancelInvoice(i.id, { reason: "overdue" });
      cancelled++;
    } catch {
      // Paid or cancelled concurrently — nothing to do.
    }
  }
  return { cancelled };
}
