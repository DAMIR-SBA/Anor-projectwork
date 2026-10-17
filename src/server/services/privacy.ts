import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { verifySecret } from "@/server/security/crypto";
import { requestMeta } from "@/server/security/request";
import { CONSENT_COOKIE, CONSENT_VERSION, parseConsent, RETENTION_DAYS, serializeConsent, type CookieConsent } from "@/lib/consent";

const DAY = 86_400_000;

/** The visitor's cookie choice, or null before they chose. */
export async function cookieConsent(): Promise<CookieConsent | null> {
  return parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
}

/** Store the choice in a cookie and as consent records (signed-in user or anonymous visitor). */
export async function saveCookieConsent(c: CookieConsent, userId: string | null) {
  const jar = await cookies();
  const anonId = jar.get("anor_aid")?.value ?? null;
  const { ip } = await requestMeta();
  await db.consentRecord.createMany({
    data: [
      { userId, anonId: userId ? null : anonId, type: "COOKIES_ANALYTICS", granted: c.analytics, version: CONSENT_VERSION, ip },
      { userId, anonId: userId ? null : anonId, type: "COOKIES_MARKETING", granted: c.marketing, version: CONSENT_VERSION, ip },
    ],
  });
  jar.set(CONSENT_COOKIE, serializeConsent(c), { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 86_400 });
}

/** Everything we hold about a user, as a portable JSON document (no secrets, no other people's data). */
export async function exportUserData(userId: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { login: true, name: true, email: true, phone: true, locale: true, loyaltyTier: true, bonusBalance: true, nasiyaLimit: true, nasiyaUsed: true, marketingConsent: true, createdAt: true, telegramUsername: true },
  });
  const [addresses, orders, returns, reviews, questions, wallet, bonus, notifications, consents, messages, subscriptions, contracts, alerts, logins] = await Promise.all([
    db.address.findMany({ where: { userId }, select: { label: true, region: true, city: true, street: true, house: true, apartment: true, recipient: true, phone: true, createdAt: true } }),
    db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { number: true, status: true, total: true, paymentMethod: true, deliveryMethod: true, createdAt: true, deliveredAt: true, items: { select: { title: true, quantity: true, unitPrice: true } } } }),
    db.return.findMany({ where: { userId }, select: { number: true, status: true, reason: true, amount: true, createdAt: true } }),
    db.review.findMany({ where: { userId }, select: { rating: true, pros: true, cons: true, comment: true, status: true, createdAt: true, product: { select: { titleUz: true } } } }),
    db.question.findMany({ where: { userId }, select: { text: true, createdAt: true } }),
    db.wallet.findUnique({ where: { userId }, select: { balance: true, transactions: { orderBy: { createdAt: "desc" }, select: { type: true, amount: true, description: true, createdAt: true } } } }),
    db.bonusPoints.findMany({ where: { userId }, select: { amount: true, remaining: true, reason: true, expiresAt: true, createdAt: true } }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500, select: { title: true, body: true, createdAt: true } }),
    db.consentRecord.findMany({ where: { userId }, select: { type: true, granted: true, version: true, createdAt: true } }),
    db.message.findMany({ where: { senderId: userId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 2000, select: { conversationId: true, text: true, createdAt: true } }),
    db.subscription.findMany({ where: { userId }, select: { plan: true, status: true, price: true, startedAt: true, currentPeriodEnd: true } }),
    db.installmentContract.findMany({ where: { userId }, select: { number: true, status: true, total: true, months: true, signedAt: true } }),
    db.productAlert.findMany({ where: { userId }, select: { type: true, createdAt: true, product: { select: { titleUz: true } } } }),
    db.loginAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: { success: true, ip: true, userAgent: true, createdAt: true } }),
  ]);
  await audit({ actorId: userId, actorKind: "user", action: "privacy.data_exported", entityType: "User", entityId: userId });
  return { exportedAt: new Date().toISOString(), format: "anor-export/1", profile: u, addresses, orders, returns, reviews, questions, wallet, bonus, notifications, consents, messages, subscriptions, nasiyaContracts: contracts, alerts, loginHistory: logins };
}

/** Why the account cannot be deleted right now (empty = it can). */
export async function deletionBlockers(userId: string) {
  const [orders, contracts, returns, shops] = await Promise.all([
    db.order.count({ where: { userId, status: { in: ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PACKED", "SHIPPED"] } } }),
    db.installmentContract.count({ where: { userId, status: { in: ["ACTIVE", "OVERDUE"] } } }),
    db.return.count({ where: { userId, status: { in: ["REQUESTED", "APPROVED", "RECEIVED", "DISPUTED"] } } }),
    db.shop.count({ where: { ownerId: userId, status: { in: ["APPROVED", "PENDING"] } } }),
  ]);
  return [orders && "orders", contracts && "nasiya", returns && "returns", shops && "shop"].filter(Boolean) as string[];
}

/**
 * Delete = anonymize. Personal data and credentials go; orders, payments and receipts stay
 * (accounting law) but no longer point to a person. Reviews stay, shown as anonymous.
 */
export async function deleteAccount(userId: string, confirm: { password?: string; login?: string }) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true, passwordHash: true, staffProfile: { select: { id: true } } } });
  if (u.staffProfile) throw new AppError("staffAccount");
  const ok = u.passwordHash ? await verifySecret(u.passwordHash, confirm.password ?? "") : confirm.login === u.login;
  if (!ok) throw new AppError("invalidCredentials", undefined, u.passwordHash ? "password" : "login");
  const blockers = await deletionBlockers(userId);
  if (blockers.length) throw new AppError("deletionBlocked", { what: blockers.join(", ") });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.address.deleteMany({ where: { userId } });
    await tx.device.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.savedCard.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.productAlert.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.productView.deleteMany({ where: { userId } });
    await tx.searchQuery.deleteMany({ where: { userId } });
    await tx.review.updateMany({ where: { userId }, data: { isAnonymous: true, displayName: null } });
    await tx.subscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { autoRenew: false, status: "CANCELLED", cancelledAt: now } });
    await tx.user.update({
      where: { id: userId },
      data: { login: `deleted_${userId.slice(-12)}`, name: null, email: null, emailVerifiedAt: null, phone: null, phoneVerifiedAt: null, avatarUrl: null, googleId: null, telegramId: null, telegramUsername: null, passwordHash: null, pinHash: null, notifyPrefs: undefined, marketingConsent: false, status: "DELETED", deletedAt: now },
    });
  });
  await audit({ actorId: userId, actorKind: "user", action: "privacy.account_deleted", entityType: "User", entityId: userId, meta: { login: u.login } });
}

/** Daily retention: delete what the privacy policy says we no longer keep. */
export async function retentionPurge(now = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  const R = RETENTION_DAYS;
  const [notifications, views, searches, logins, errors, runs, audits] = await Promise.all([
    db.notification.deleteMany({ where: { createdAt: { lt: before(R.notifications) } } }),
    db.productView.deleteMany({ where: { createdAt: { lt: before(R.productViews) } } }),
    db.searchQuery.deleteMany({ where: { createdAt: { lt: before(R.searchQueries) } } }),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: before(R.loginAttempts) } } }),
    db.errorEvent.deleteMany({ where: { createdAt: { lt: before(R.errorEvents) } } }),
    db.jobRun.deleteMany({ where: { startedAt: { lt: before(R.jobRuns) }, status: { not: "RUNNING" } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: before(R.auditLog) } } }),
  ]);
  // Resolved support threads: messages go after the retention period; the ticket stays as a record.
  const oldThreads = await db.ticket.findMany({ where: { status: "RESOLVED", updatedAt: { lt: before(R.resolvedSupportChats) } }, select: { conversationId: true }, take: 1000 });
  const chats = oldThreads.length ? await db.message.deleteMany({ where: { conversationId: { in: oldThreads.map((t) => t.conversationId) } } }) : { count: 0 };
  return { notifications: notifications.count, views: views.count, searches: searches.count, logins: logins.count, errors: errors.count, runs: runs.count, audits: audits.count, chatMessages: chats.count };
}
