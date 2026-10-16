import "server-only";
import { db, type Tx } from "@/server/db";
import { AppError } from "@/server/action";
import { randomDigits } from "@/server/security/crypto";
import { cashbackRates, loyaltySettings } from "./loyalty";
import { computeCart, effectiveCommissionRate, commissionFor, logisticsFee, allocate, cashbackRate, type CartLine, type Coupon, type Promotion } from "@/lib/pricing";
import { estimateDelivery, regionZone, type Method } from "@/lib/delivery";
import { quote, buildSchedule, isPlanEligible } from "@/lib/installment";
import { locText, loc } from "@/lib/localized";
import { categoryAncestors } from "./cart";
import { earlyCampaignIds, getPlans, liveCampaignWhere } from "./catalog";
import { bonusSpend, walletDebit } from "./wallet";
import { markGroupPlaced, newGroupNumber } from "./orders";
import { startPayment } from "@/server/payments/service";
import type { CurrentUser } from "@/server/auth/session";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type CheckoutInput = {
  cartId?: string | null;
  deliveryMethod: Method;
  addressId?: string | null;
  pickupPointId?: string | null;
  slotStart?: string | null;
  isGift: boolean;
  giftMessage?: string | null;
  hidePrice: boolean;
  recipientName?: string | null;
  recipientPhone?: string | null;
  paymentMethod: PaymentMethod;
  savedCardId?: string | null;
  installmentMonths?: number | null;
  bonus: number;
  useWallet: boolean;
  acceptContract?: boolean;
};

type Line = CartLine & {
  itemId: string;
  title: string;
  variantTitle: string;
  image: string | null;
  fulfillment: "FBO" | "FBS" | "DBS";
  weight: number;
  shopTier: "BASIC" | "PRO";
  shopCommission: number | null;
  categoryRate: number;
  categoryId: string;
  isPreorder: boolean;
  nasiyaEligible: boolean;
  campaignId: string | null;
};

async function loadLines(user: CurrentUser, cartId: string | null | undefined, locale: string) {
  const cart = cartId ? await db.cart.findFirst({ where: { id: cartId, kind: "GROUP", ownerId: user.id } }) : await db.cart.findUnique({ where: { userId: user.id } });
  if (!cart) throw new AppError("cartEmpty");
  const early = await earlyCampaignIds();
  const items = await db.cartItem.findMany({
    where: { cartId: cart.id, selected: true },
    include: {
      variant: {
        include: {
          product: {
            include: {
              shop: { select: { id: true, tier: true, commissionRate: true, status: true } },
              category: { select: { id: true, commissionRate: true, nasiyaEligible: true, commissionRules: true } },
              media: { where: { type: "IMAGE" }, orderBy: { sort: "asc" }, take: 1 },
              campaignItems: { where: { status: "APPROVED", campaign: liveCampaignWhere(early) }, select: { salePrice: true, campaignId: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  const ancestors = await categoryAncestors();
  const lines: Line[] = [];
  for (const it of items) {
    const p = it.variant.product;
    if (p.status !== "ACTIVE" || p.deletedAt || p.shop.status !== "APPROVED") continue;
    if (!p.isPreorder && it.variant.stock < it.quantity) throw new AppError("outOfStock");
    const sale = p.campaignItems[0];
    const price = sale ? Math.min(sale.salePrice, it.variant.price) : it.variant.price;
    const rule = p.category.commissionRules.find((r) => r.tier === p.shop.tier);
    lines.push({
      itemId: it.id,
      variantId: it.variantId,
      productId: p.id,
      shopId: p.shop.id,
      categoryIds: ancestors[p.categoryId] ?? [p.categoryId],
      unitPrice: price,
      oldPrice: it.variant.oldPrice,
      quantity: it.quantity,
      wholesaleTiers: (p.wholesaleTiers as Array<{ minQty: number; price: number }> | null) ?? null,
      title: loc(p, "title", locale),
      variantTitle: locale === "ru" ? it.variant.titleRu : locText(it.variant.titleUz, locale),
      image: it.variant.imageUrl ?? p.media[0]?.url ?? null,
      fulfillment: p.fulfillment,
      weight: it.variant.weightGrams ?? p.weightGrams,
      shopTier: p.shop.tier,
      shopCommission: p.shop.commissionRate,
      categoryRate: rule?.rate ?? p.category.commissionRate,
      categoryId: p.categoryId,
      isPreorder: p.isPreorder,
      nasiyaEligible: p.nasiyaEligible ?? p.category.nasiyaEligible,
      campaignId: sale?.campaignId ?? null,
    });
  }
  if (!lines.length) throw new AppError("cartEmpty");
  return { cart, lines };
}

async function couponFor(user: CurrentUser, code: string | null) {
  if (!code) return { coupon: null as Coupon | null, couponId: null as string | null, ctx: undefined };
  const c = await db.coupon.findUnique({ where: { code } });
  if (!c) return { coupon: null, couponId: null, ctx: undefined };
  const [orders, uses] = await Promise.all([db.orderGroup.count({ where: { userId: user.id, paymentStatus: { in: ["PAID", "AUTHORIZED", "PENDING"] }, orders: { some: { status: { not: "CANCELLED" } } } } }), db.couponRedemption.count({ where: { couponId: c.id, userId: user.id } })]);
  return { coupon: c as Coupon, couponId: c.id, ctx: { now: new Date(), isFirstOrder: orders === 0, userUses: uses } };
}

async function promotionsFor(productIds: string[]): Promise<Promotion[]> {
  const now = new Date();
  const rows = await db.promotion.findMany({ where: { isActive: true, productIds: { hasSome: productIds }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] } });
  return rows.map((r) => ({ id: r.id, type: r.type, discountPercent: r.discountPercent, minQty: r.minQty, productIds: r.productIds }));
}

/** Quote used by the checkout page (and re-run inside placeOrder so prices are never taken from the client). */
export async function quoteCheckout(user: CurrentUser, input: Pick<CheckoutInput, "cartId" | "deliveryMethod" | "addressId" | "pickupPointId" | "bonus">, locale: string) {
  const { cart, lines } = await loadLines(user, input.cartId, locale);
  let region = "toshkent_sh";
  if (input.deliveryMethod === "PICKUP" && input.pickupPointId) {
    const pp = await db.pickupPoint.findUnique({ where: { id: input.pickupPointId } });
    if (pp) region = pp.region;
  } else if (input.addressId) {
    const a = await db.address.findFirst({ where: { id: input.addressId, userId: user.id } });
    if (a) region = a.region;
  }
  const { coupon, couponId, ctx } = await couponFor(user, cart.couponCode);
  const isBusiness = !!(await db.businessProfile.findUnique({ where: { userId: user.id }, select: { id: true } }));
  const totals = computeCart({
    lines,
    promotions: await promotionsFor(lines.map((l) => l.productId)),
    coupon,
    couponCtx: ctx,
    delivery: { method: input.deliveryMethod, region },
    isPlus: user.isPlus,
    isBusiness,
    tier: user.loyaltyTier,
    bonusRequested: input.bonus,
    bonusBalance: user.bonusBalance,
  });
  const expressAllowed = regionZone(region) === 0 && lines.every((l) => l.fulfillment === "FBO");
  const byShop = new Map<string, Line[]>();
  for (const l of lines) byShop.set(l.shopId, [...(byShop.get(l.shopId) ?? []), l]);
  const shops = await db.shop.findMany({ where: { id: { in: [...byShop.keys()] } }, select: { id: true, name: true } });
  const groups = [...byShop.entries()].map(([shopId, ls]) => {
    const worst = ls.some((l) => l.fulfillment === "DBS") ? "DBS" : ls.some((l) => l.fulfillment === "FBS") ? "FBS" : "FBO";
    return { shopId, shopName: locText(shops.find((s) => s.id === shopId)?.name ?? "", locale), fulfillment: worst as Line["fulfillment"], eta: estimateDelivery(worst, region, input.deliveryMethod).toISOString(), lines: ls };
  });
  const plans = await getPlans();
  const nasiyaOk = lines.every((l) => l.nasiyaEligible);
  return { cart, lines, totals, region, couponId, expressAllowed, groups, plans: nasiyaOk ? plans.filter((p) => isPlanEligible(totals.total, p)) : [] };
}

/** Atomically reserve stock for a line from the right warehouse (platform FC for FBO, seller warehouse otherwise). */
async function reserve(tx: Tx, line: Line, region: string, orderId: string) {
  if (line.isPreorder) return;
  const stocks = await tx.warehouseStock.findMany({ where: { variantId: line.variantId, quantity: { gt: 0 } }, include: { warehouse: true } });
  // Prefer a warehouse in the buyer's region, then the fullest one.
  stocks.sort((a, b) => Number(b.warehouse.region === region) - Number(a.warehouse.region === region) || b.quantity - a.quantity);
  let left = line.quantity;
  for (const s of stocks) {
    if (left <= 0) break;
    const take = Math.min(left, s.quantity);
    const ok = await tx.warehouseStock.updateMany({ where: { variantId: s.variantId, warehouseId: s.warehouseId, quantity: { gte: take } }, data: { quantity: { decrement: take } } });
    if (ok.count !== 1) continue;
    await tx.stockMovement.create({ data: { variantId: s.variantId, warehouseId: s.warehouseId, delta: -take, reason: "SALE", refType: "order", refId: orderId } });
    left -= take;
  }
  if (left > 0) throw new AppError("outOfStock");
  const v = await tx.variant.updateMany({ where: { id: line.variantId, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } });
  if (v.count !== 1) throw new AppError("outOfStock");
}

export async function placeOrder(user: CurrentUser, input: CheckoutInput, locale: string) {
  const q = await quoteCheckout(user, input, locale);
  const { totals, region } = q;
  if (input.deliveryMethod === "EXPRESS" && !q.expressAllowed) throw new AppError("expressUnavailable");
  if (input.deliveryMethod === "PICKUP" && !input.pickupPointId) throw new AppError("pickupRequired");
  if (input.deliveryMethod !== "PICKUP" && !input.addressId) throw new AppError("addressRequired");
  if (q.cart.couponCode && totals.couponError) throw new AppError("couponInvalid");

  const address = input.addressId ? await db.address.findFirst({ where: { id: input.addressId, userId: user.id } }) : null;
  if (input.deliveryMethod !== "PICKUP" && !address) throw new AppError("addressRequired");

  // Money split: bonus (capped in computeCart) → wallet → external method.
  const wallet = input.useWallet || input.paymentMethod === "WALLET" ? await db.wallet.findUnique({ where: { userId: user.id } }) : null;
  const afterBonus = totals.total;
  const walletUsed = wallet ? Math.min(wallet.balance, afterBonus) : 0;
  const external = afterBonus - walletUsed;
  if (input.paymentMethod === "WALLET" && external > 0) throw new AppError("insufficientFunds");

  let installmentPlan: Awaited<ReturnType<typeof getPlans>>[number] | null = null;
  if (input.paymentMethod === "INSTALLMENT") {
    installmentPlan = q.plans.find((p) => p.months === input.installmentMonths) ?? null;
    if (!installmentPlan) throw new AppError("nasiyaNotEligible");
    if (user.nasiyaLimit - user.nasiyaUsed < external) throw new AppError("nasiyaLimit");
    if (!input.acceptContract) throw new AppError("contractRequired");
    const [open, settings] = await Promise.all([db.installmentContract.count({ where: { userId: user.id, status: { in: ["ACTIVE", "OVERDUE"] } } }), (await import("./admin/finance")).nasiyaSettings()]);
    if (open >= settings.maxActiveContracts) throw new AppError("nasiyaContracts", { max: settings.maxActiveContracts });
    if (await db.installmentContract.count({ where: { userId: user.id, status: "OVERDUE" } })) throw new AppError("nasiyaOverdue");
  }

  const onlineMethod = ["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"].includes(input.paymentMethod) && external > 0;
  const initialStatus = onlineMethod ? "PENDING_PAYMENT" : "PLACED";
  const groupNumber = newGroupNumber();
  const lineTotals = new Map(totals.lines.map((l) => [l.variantId, l]));
  const shopSubtotals = q.groups.map((g) => g.lines.reduce((s, l) => s + (lineTotals.get(l.variantId)?.lineTotal ?? 0), 0));
  const deliveryShares = allocate(totals.deliveryFee, shopSubtotals);
  const bonusShares = allocate(totals.bonusApplied, shopSubtotals);
  const rate = cashbackRate(user.loyaltyTier, user.isPlus, cashbackRates(await loyaltySettings()));

  const group = await db.$transaction(
    async (tx) => {
      const group = await tx.orderGroup.create({
        data: {
          number: groupNumber,
          userId: user.id,
          subtotal: totals.subtotal,
          discountTotal: totals.promoDiscount + totals.couponDiscount,
          deliveryTotal: totals.deliveryFee,
          bonusUsed: totals.bonusApplied,
          walletUsed,
          total: totals.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: onlineMethod ? "PENDING" : external === 0 ? "PAID" : input.paymentMethod === "INSTALLMENT" ? "PAID" : "PENDING",
          couponCode: totals.couponDiscount > 0 || totals.freeDelivery ? q.cart.couponCode : null,
        },
      });
      for (const [i, g] of q.groups.entries()) {
        const goods = shopSubtotals[i];
        const eta = estimateDelivery(g.fulfillment, region, input.deliveryMethod);
        const order = await tx.order.create({
          data: {
            number: `${groupNumber}-${i + 1}`,
            groupId: group.id,
            userId: user.id,
            shopId: g.shopId,
            status: initialStatus,
            fulfillment: g.fulfillment,
            subtotal: g.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
            discountTotal: g.lines.reduce((s, l) => s + (lineTotals.get(l.variantId)?.promoDiscount ?? 0) + (lineTotals.get(l.variantId)?.couponDiscount ?? 0), 0),
            deliveryFee: deliveryShares[i],
            total: goods + deliveryShares[i],
            cashbackAmount: Math.floor((goods - bonusShares[i]) * rate),
            commissionTotal: 0,
            logisticsFee: g.lines.reduce((s, l) => s + logisticsFee(l.fulfillment, l.weight, l.quantity), 0),
            deliveryMethod: input.deliveryMethod,
            pickupPointId: input.deliveryMethod === "PICKUP" ? input.pickupPointId : null,
            address: address ? { recipient: address.recipient, phone: address.phone, region: address.region, city: address.city, district: address.district, street: address.street, house: address.house, apartment: address.apartment, entrance: address.entrance, floor: address.floor, comment: address.comment, lat: address.lat, lng: address.lng } : undefined,
            region,
            slotStart: input.slotStart ? new Date(input.slotStart) : null,
            slotEnd: input.slotStart ? new Date(new Date(input.slotStart).getTime() + 2 * 3_600_000) : null,
            estimatedDeliveryAt: eta,
            paymentMethod: input.paymentMethod,
            isGift: input.isGift,
            giftMessage: input.isGift ? input.giftMessage?.slice(0, 300) : null,
            hidePrice: input.isGift && input.hidePrice,
            recipientName: input.isGift ? input.recipientName : null,
            recipientPhone: input.isGift ? input.recipientPhone : null,
            isPreorder: g.lines.some((l) => l.isPreorder),
            pickupCode: randomDigits(4),
            isB2B: !!(await tx.businessProfile.findUnique({ where: { userId: user.id }, select: { id: true } })),
          },
        });
        let commission = 0;
        for (const l of g.lines) {
          const lt = lineTotals.get(l.variantId)!;
          const r = effectiveCommissionRate(l.categoryRate, l.shopTier, l.shopCommission);
          const c = commissionFor(lt.lineTotal, r);
          commission += c;
          await tx.orderItem.create({
            data: { orderId: order.id, productId: l.productId, variantId: l.variantId, title: l.title, variantTitle: l.variantTitle || null, imageUrl: l.image, unitPrice: lt.effectivePrice, oldPrice: l.oldPrice ?? null, quantity: l.quantity, discount: lt.promoDiscount + lt.couponDiscount, commissionRate: r, commissionAmount: c, campaignId: l.campaignId },
          });
          await reserve(tx, l, region, order.id);
          if (l.campaignId) await tx.campaignProduct.updateMany({ where: { campaignId: l.campaignId, productId: l.productId }, data: { sold: { increment: l.quantity } } });
        }
        await tx.order.update({ where: { id: order.id }, data: { commissionTotal: commission } });
        await tx.orderStatusEvent.create({ data: { orderId: order.id, status: initialStatus } });
      }
      if (q.couponId && (totals.couponDiscount > 0 || totals.freeDelivery)) {
        const c = await tx.coupon.findUniqueOrThrow({ where: { id: q.couponId } });
        const ok = await tx.coupon.updateMany({ where: { id: c.id, ...(c.usageLimit != null ? { usedCount: { lt: c.usageLimit } } : {}) }, data: { usedCount: { increment: 1 } } });
        if (ok.count !== 1) throw new AppError("couponInvalid");
        await tx.couponRedemption.create({ data: { couponId: c.id, userId: user.id, groupId: group.id, amount: totals.couponDiscount } });
      }
      if (totals.bonusApplied > 0) await bonusSpend(tx, user.id, totals.bonusApplied, group.id);
      if (walletUsed > 0) await walletDebit(tx, user.id, walletUsed, "PAYMENT", { refType: "order_group", refId: group.id, description: `№${groupNumber}` });
      if (installmentPlan) {
        const qt = quote(external, installmentPlan);
        const plan = await tx.installmentPlan.findUniqueOrThrow({ where: { months: installmentPlan.months } });
        const contract = await tx.installmentContract.create({ data: { number: `NS-${groupNumber}`, userId: user.id, groupId: group.id, planId: plan.id, principal: qt.principal, markup: qt.markup, total: qt.total, months: qt.months } });
        await tx.repaymentSchedule.createMany({ data: buildSchedule(qt, new Date()).map((s) => ({ contractId: contract.id, index: s.index, dueDate: s.dueDate, amount: s.amount })) });
        await tx.user.update({ where: { id: user.id }, data: { nasiyaUsed: { increment: external } } });
        await tx.payment.create({ data: { userId: user.id, groupId: group.id, method: "INSTALLMENT", purpose: "ORDER", amount: external, status: "PAID", paidAt: new Date(), meta: { contract: contract.number } } });
      }
      if (input.paymentMethod === "COD" && external > 0) {
        await tx.payment.create({ data: { userId: user.id, groupId: group.id, method: "COD", purpose: "ORDER", amount: external, status: "PENDING" } });
      }
      // Purchased lines leave the cart.
      await tx.cartItem.deleteMany({ where: { id: { in: q.lines.map((l) => l.itemId) } } });
      if (q.cart.couponCode) await tx.cart.update({ where: { id: q.cart.id }, data: { couponCode: null } });
      return group;
    },
    { timeout: 20_000 },
  );

  if (onlineMethod) {
    const pay = await startPayment({ userId: user.id, method: input.paymentMethod, amount: external, purpose: "ORDER", groupId: group.id, savedCardId: input.savedCardId });
    if (pay.status === "PAID") return { groupId: group.id, redirectUrl: null };
    return { groupId: group.id, redirectUrl: pay.redirectUrl };
  }
  await markGroupPlaced(group.id, external === 0 || input.paymentMethod === "INSTALLMENT");
  return { groupId: group.id, redirectUrl: null };
}
