import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getCategoryTree } from "./categories";

export const GUEST_CART_COOKIE = "anor_cart";

export async function getHeaderData() {
  const user = await getCurrentUser();
  const guestToken = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  const [categories, cart, wishlist, unread, notifications, shop] = await Promise.all([
    getCategoryTree(),
    user
      ? db.cartItem.aggregate({ _sum: { quantity: true }, where: { cart: { userId: user.id } } })
      : guestToken
        ? db.cartItem.aggregate({ _sum: { quantity: true }, where: { cart: { guestToken } } })
        : null,
    user ? db.wishlistItem.count({ where: { wishlist: { userId: user.id } } }) : 0,
    user ? db.conversationMember.aggregate({ _sum: { unreadCount: true }, where: { userId: user.id, hiddenAt: null } }) : null,
    user ? db.notification.count({ where: { userId: user.id, readAt: null } }) : 0,
    user ? db.shop.findFirst({ where: { ownerId: user.id }, select: { id: true } }) : null,
  ]);
  return {
    categories,
    user: user ? { login: user.login, name: user.name, avatarUrl: user.avatarUrl, isPlus: user.isPlus, hasShop: !!shop } : null,
    counts: { cart: cart?._sum.quantity ?? 0, wishlist, unread: unread?._sum.unreadCount ?? 0, notifications },
  };
}
