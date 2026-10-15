import "server-only";
import { db } from "@/server/db";
import type { Permission } from "@/lib/rbac";

/** Counters shown next to admin nav items (pending moderation, open tickets...). */
export async function adminBadges(perms: Set<Permission>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const tasks: Array<Promise<void>> = [];
  if (perms.has("shops.moderate")) tasks.push(db.shop.count({ where: { status: "PENDING" } }).then((n) => void (out.shops = n)));
  if (perms.has("products.moderate")) tasks.push(db.product.count({ where: { status: "PENDING", deletedAt: null } }).then((n) => void (out.products = n)));
  if (perms.has("reviews.moderate"))
    tasks.push(
      Promise.all([
        db.review.count({ where: { deletedAt: null, OR: [{ status: "PENDING" }, { reports: { some: { status: "OPEN" } } }] } }),
        db.question.count({ where: { status: "PENDING" } }),
        db.answer.count({ where: { status: "PENDING" } }),
      ]).then((n) => void (out.reviews = n[0] + n[1] + n[2])),
    );
  if (perms.has("support.handle")) tasks.push(db.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }).then((n) => void (out.support = n)));
  if (perms.has("fraud.manage")) tasks.push(db.fraudFlag.count({ where: { status: "OPEN" } }).then((n) => void (out.fraud = n)));
  if (perms.has("disputes.manage")) tasks.push(db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }).then((n) => void (out.disputes = n)));
  if (perms.has("returns.manage")) tasks.push(db.return.count({ where: { status: "REQUESTED" } }).then((n) => void (out.returns = n)));
  await Promise.all(tasks);
  return out;
}
