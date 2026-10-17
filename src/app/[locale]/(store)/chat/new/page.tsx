import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { openShopChat } from "@/server/services/chat";

/** /chat/new?shop=…&product=…&order=… opens (or creates) the buyer↔shop thread and posts the context card. */
export default async function NewChat({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ shop?: string; product?: string; order?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as Array<[string, string]>).toString();
  const user = await requireUser(`/chat/new?${qs}`);
  if (!sp.shop) notFound();
  let id: string;
  try {
    id = await openShopChat(user.id, sp.shop, { productId: sp.product, orderId: sp.order });
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }
  redirect({ href: `/chat/${id}`, locale });
}
