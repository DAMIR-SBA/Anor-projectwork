import { getTranslations } from "next-intl/server";
import { Badge, type BadgeTone } from "@/components/ui/display";
import type { OrderStatus } from "@/lib/order-status";

const TONE: Record<OrderStatus, BadgeTone> = { PENDING_PAYMENT: "accent", PLACED: "info", CONFIRMED: "info", PACKED: "info", SHIPPED: "primary", DELIVERED: "success", CANCELLED: "neutral", RETURNED: "neutral" };

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getTranslations("orders.status");
  return <Badge tone={TONE[status]}>{t(status)}</Badge>;
}
