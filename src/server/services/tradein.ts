import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { isOwnStorageUrl } from "@/server/storage";
import { randomDigits } from "@/server/security/crypto";
import { walletCredit } from "./wallet";
import { estimate, findModel, HANDOVER_DAYS, MAX_OPEN_REQUESTS, OFFER_VALID_DAYS, offerAllowed, type Answers } from "@/lib/tradein";
import { groupDigits } from "@/lib/money";

const DAY = 86_400_000;
const OPEN = ["SUBMITTED", "ESTIMATED", "ACCEPTED"] as const;

export async function submitTradeIn(userId: string, input: { category: string; modelKey: string; answers: Answers; photos: string[]; imeiLast4: string | null }) {
  const model = findModel(input.category, input.modelKey);
  if (!model) throw new AppError("notFound");
  if (input.answers.locked) throw new AppError("tradeinLocked");
  if (input.photos.length < 2 || input.photos.some((u) => !isOwnStorageUrl(u))) throw new AppError("tradeinPhotos", undefined, "photos");
  if ((await db.tradeInRequest.count({ where: { userId, status: { in: [...OPEN] } } })) >= MAX_OPEN_REQUESTS) throw new AppError("tradeinTooMany", { max: MAX_OPEN_REQUESTS });
  // The estimate is always recomputed here; the number on the form is only a preview.
  const e = estimate(model.base, input.answers);
  const r = await db.tradeInRequest.create({
    data: { number: `TI-${randomDigits(6)}`, userId, category: input.category, deviceModel: model.label, conditionGrade: e.grade, answers: { ...input.answers, modelKey: model.key }, estimatedValue: e.value, photos: input.photos, imeiLast4: input.imeiLast4 },
  });
  await audit({ actorId: userId, actorKind: "user", action: "tradein.submitted", entityType: "TradeInRequest", entityId: r.id, meta: { model: model.label, grade: e.grade, estimate: e.value } });
  return r;
}

export function myTradeIns(userId: string) {
  return db.tradeInRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function tradeInQueue(status: "SUBMITTED" | "ESTIMATED" | "ACCEPTED" | "closed", page: number, pageSize = 20) {
  const where = status === "closed" ? { status: { in: ["COMPLETED", "REJECTED"] as Array<"COMPLETED"> } } : { status };
  const [items, total, counts] = await Promise.all([
    db.tradeInRequest.findMany({ where, orderBy: { createdAt: status === "closed" ? "desc" : "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { login: true, name: true, phone: true } } } }),
    db.tradeInRequest.count({ where }),
    db.tradeInRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { items, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number> };
}

type Staff = { id: string; login: string };

/** Inspector: confirm or correct the estimate from the photos, or reject (fake photos, wrong model, locked). */
export async function reviewTradeIn(staff: Staff, id: string, input: { decision: "offer"; offeredValue: number; note: string | null } | { decision: "reject"; note: string }) {
  const r = await db.tradeInRequest.findUnique({ where: { id } });
  if (!r) throw new AppError("notFound");
  if (r.status !== "SUBMITTED") throw new AppError("conflict");
  const now = new Date();
  if (input.decision === "offer") {
    const model = findModel(r.category, String((r.answers as Record<string, unknown>).modelKey ?? ""));
    if (!model || !offerAllowed(model.base, input.offeredValue)) throw new AppError("tradeinOfferRange", undefined, "offeredValue");
    await db.tradeInRequest.update({ where: { id }, data: { status: "ESTIMATED", offeredValue: input.offeredValue, staffNote: input.note, reviewedById: staff.id, reviewedAt: now } });
    await notify({ userId: r.userId, type: "tradein.offer", title: `Trade-in ${r.number}`, body: `${r.deviceModel}: ${groupDigits(input.offeredValue)} so‘m taklif qilindi. ${OFFER_VALID_DAYS} kun ichida javob bering.`, href: "/account/trade-in", channels: ["sms", "telegram", "push"] });
  } else {
    await db.tradeInRequest.update({ where: { id }, data: { status: "REJECTED", staffNote: input.note, reviewedById: staff.id, reviewedAt: now } });
    await notify({ userId: r.userId, type: "tradein.rejected", title: `Trade-in ${r.number}`, body: input.note, href: "/account/trade-in" });
  }
  await audit({ actorId: staff.id, actorLogin: staff.login, actorKind: "staff", action: `tradein.${input.decision === "offer" ? "offered" : "rejected"}`, entityType: "TradeInRequest", entityId: id, meta: input.decision === "offer" ? { offeredValue: input.offeredValue, estimate: r.estimatedValue } : { note: input.note } });
}

/** Buyer accepts the offer (then hands the device over at a pickup point) or declines it. */
export async function answerOffer(userId: string, id: string, accept: boolean) {
  const r = await db.tradeInRequest.findFirst({ where: { id, userId } });
  if (!r) throw new AppError("notFound");
  if (r.status !== "ESTIMATED" || !r.reviewedAt || r.reviewedAt.getTime() + OFFER_VALID_DAYS * DAY < Date.now()) throw new AppError("conflict");
  const ok = await db.tradeInRequest.updateMany({ where: { id, status: "ESTIMATED" }, data: accept ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "REJECTED", staffNote: "buyer_declined" } });
  if (ok.count !== 1) throw new AppError("conflict");
  await audit({ actorId: userId, actorKind: "user", action: accept ? "tradein.accepted" : "tradein.declined", entityType: "TradeInRequest", entityId: id });
}

/** The device was received and matches the photos: the money goes to the wallet. */
export async function completeTradeIn(staff: Staff, id: string) {
  const r = await db.tradeInRequest.findUnique({ where: { id } });
  if (!r) throw new AppError("notFound");
  if (r.status !== "ACCEPTED" || !r.offeredValue) throw new AppError("conflict");
  await db.$transaction(async (tx) => {
    const ok = await tx.tradeInRequest.updateMany({ where: { id, status: "ACCEPTED" }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (ok.count !== 1) throw new AppError("conflict");
    await walletCredit(tx, r.userId, r.offeredValue!, "TRADE_IN", { refType: "tradein", refId: r.id, description: `Trade-in ${r.number}: ${r.deviceModel}` });
  });
  await audit({ actorId: staff.id, actorLogin: staff.login, actorKind: "staff", action: "tradein.completed", entityType: "TradeInRequest", entityId: id, meta: { paid: r.offeredValue } });
  await notify({ userId: r.userId, type: "tradein.paid", title: `Trade-in ${r.number}`, body: `+${groupDigits(r.offeredValue)} so‘m Anor Hamyonga o‘tkazildi.`, href: "/account/wallet", channels: ["sms", "push"] });
}

/** Daily: unanswered offers and devices never handed over close on their own. */
export async function expireTradeIns(now = new Date()) {
  const offers = await db.tradeInRequest.updateMany({ where: { status: "ESTIMATED", reviewedAt: { lt: new Date(now.getTime() - OFFER_VALID_DAYS * DAY) } }, data: { status: "REJECTED", staffNote: "offer_expired" } });
  const handover = await db.tradeInRequest.updateMany({ where: { status: "ACCEPTED", acceptedAt: { lt: new Date(now.getTime() - HANDOVER_DAYS * DAY) } }, data: { status: "REJECTED", staffNote: "not_handed_over" } });
  return { offersExpired: offers.count, handoverExpired: handover.count };
}
