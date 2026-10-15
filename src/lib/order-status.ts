// Order state machine (pure). placed → confirmed → packed → shipped → delivered / cancelled / returned.
export type OrderStatus = "PENDING_PAYMENT" | "PLACED" | "CONFIRMED" | "PACKED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "RETURNED";
export type Actor = "buyer" | "seller" | "staff" | "courier" | "system";

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "CANCELLED"],
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

/** Who may move an order into a status. Staff and the system may do anything the graph allows. */
const ALLOWED: Record<Exclude<Actor, "staff" | "system">, OrderStatus[]> = {
  buyer: ["CANCELLED"],
  seller: ["CONFIRMED", "PACKED", "SHIPPED", "CANCELLED"],
  courier: ["DELIVERED"],
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (actor === "staff" || actor === "system") return true;
  if (!ALLOWED[actor].includes(to)) return false;
  // Buyers may cancel only before the parcel is packed.
  if (actor === "buyer" && to === "CANCELLED") return from === "PENDING_PAYMENT" || from === "PLACED" || from === "CONFIRMED";
  return true;
}

export const TIMELINE: OrderStatus[] = ["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

export function timelineIndex(status: OrderStatus): number {
  return TIMELINE.indexOf(status);
}

export const RETURN_WINDOW_DAYS = 14;

export function canRequestReturn(status: OrderStatus, deliveredAt: Date | null, now = new Date()): boolean {
  return status === "DELIVERED" && !!deliveredAt && now.getTime() - deliveredAt.getTime() <= RETURN_WINDOW_DAYS * 86_400_000;
}
