import "server-only";
import { db } from "@/server/db";
import { sellerAnalytics } from "./analytics";
import { financeOverview } from "./finance";

/** Seller home: 7-day KPIs, a to-do list of things that need action now, and the next payout. */
export async function sellerDashboard(shopId: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 6 * 3_600_000);
  const [a, fin, placed, slaSoon, slaLate, returns, disputes, lowStock, outOfStock, unanswered, questions, drafts, campaigns, shop] = await Promise.all([
    sellerAnalytics(shopId, 30),
    financeOverview(shopId),
    db.order.count({ where: { shopId, status: "PLACED" } }),
    db.order.count({ where: { shopId, fulfillment: "FBS", status: { in: ["CONFIRMED", "PACKED"] }, slaDeadline: { gte: now, lt: soon } } }),
    db.order.count({ where: { shopId, fulfillment: "FBS", status: { in: ["CONFIRMED", "PACKED"] }, slaDeadline: { lt: now } } }),
    db.return.count({ where: { status: "REQUESTED", order: { shopId } } }),
    db.dispute.count({ where: { shopId, status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.variant.count({ where: { stock: { gt: 0, lte: 3 }, product: { shopId, status: "ACTIVE", deletedAt: null } } }),
    db.variant.count({ where: { stock: 0, product: { shopId, status: "ACTIVE", deletedAt: null } } }),
    db.review.count({ where: { product: { shopId }, status: "APPROVED", deletedAt: null, reply: { is: null } } }),
    db.question.count({ where: { product: { shopId }, status: "PUBLISHED", answers: { none: { isSeller: true } } } }),
    db.product.count({ where: { shopId, status: { in: ["DRAFT", "REJECTED"] }, deletedAt: null } }),
    db.campaign.count({ where: { status: { in: ["SCHEDULED", "ACTIVE"] }, endsAt: { gt: now }, products: { none: { shopId } } } }),
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { fulfillmentScore: true, rating: true, reviewCount: true, tier: true } }),
  ]);
  const week = a.series.slice(-7);
  const prevWeek = a.series.slice(-14, -7);
  const sum = (rows: typeof week, k: "revenue" | "orders") => rows.reduce((s, r) => s + r[k], 0);
  const delta = (c: number, p: number) => (p ? (c - p) / p : null);
  const todo = [
    { key: "placed", count: placed, href: "/seller/orders?tab=new", tone: "primary" },
    { key: "slaLate", count: slaLate, href: "/seller/orders?tab=confirmed", tone: "danger" },
    { key: "slaSoon", count: slaSoon, href: "/seller/orders?tab=confirmed", tone: "accent" },
    { key: "returns", count: returns, href: "/seller/returns", tone: "primary" },
    { key: "disputes", count: disputes, href: "/seller/returns?tab=disputed", tone: "info" },
    { key: "outOfStock", count: outOfStock, href: "/seller/stock?low=1", tone: "danger" },
    { key: "lowStock", count: lowStock, href: "/seller/stock?low=1", tone: "accent" },
    { key: "reviews", count: unanswered, href: "/seller/reviews", tone: "info" },
    { key: "questions", count: questions, href: "/seller/questions", tone: "info" },
    { key: "drafts", count: drafts, href: "/seller/products?status=DRAFT", tone: "neutral" },
    { key: "campaigns", count: campaigns, href: "/seller/promotions", tone: "success" },
  ] as const;
  return {
    kpi: {
      revenue: { value: sum(week, "revenue"), delta: delta(sum(week, "revenue"), sum(prevWeek, "revenue")) },
      orders: { value: sum(week, "orders"), delta: delta(sum(week, "orders"), sum(prevWeek, "orders")) },
      conversion: a.kpi.conversion,
      score: shop.fulfillmentScore,
      rating: shop.rating,
      reviewCount: shop.reviewCount,
    },
    series: a.series,
    top: a.top.slice(0, 5),
    todo: todo.filter((x) => x.count > 0),
    payout: { estimate: fin.current.net, nextAt: fin.nextPayout, pending: fin.pending },
    tier: shop.tier,
  };
}
