// Badge tones for statuses shown across admin pages.
export const ORDER_TONE = { PENDING_PAYMENT: "neutral", PLACED: "primary", CONFIRMED: "info", PACKED: "accent", SHIPPED: "info", DELIVERED: "success", CANCELLED: "neutral", RETURNED: "dark" } as const;
export const RETURN_TONE = { REQUESTED: "accent", APPROVED: "info", REJECTED: "danger", RECEIVED: "info", REFUNDED: "success", DISPUTED: "primary" } as const;
export const DISPUTE_TONE = { OPEN: "accent", UNDER_REVIEW: "info", RESOLVED_BUYER: "success", RESOLVED_SELLER: "dark" } as const;
export const SUPPLY_TONE = { CREATED: "neutral", ACCEPTED: "info", RECEIVED: "accent", IN_STOCK: "success", CANCELLED: "dark" } as const;
