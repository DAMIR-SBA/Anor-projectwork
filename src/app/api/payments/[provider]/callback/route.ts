import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { completePayment } from "@/server/payments/service";
import { verifyCallback } from "@/server/payments/providers";
import { log } from "@/server/log";

const Body = z.object({ paymentId: z.string(), status: z.enum(["PAID", "FAILED"]), amount: z.number().int(), signature: z.string() });

/**
 * Server-to-server provider callback (Click/Payme/acquirer shape). Signed with HMAC; idempotent —
 * repeated callbacks for a settled payment are acknowledged without side effects.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { paymentId, status, amount, signature } = parsed.data;
  if (!verifyCallback(paymentId, status, amount, signature)) return NextResponse.json({ error: "signature" }, { status: 401 });
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.method.toLowerCase() !== provider.toLowerCase() || payment.amount !== amount) return NextResponse.json({ error: "mismatch" }, { status: 400 });
  await completePayment(paymentId, status === "PAID");
  log.info("payment callback", { provider, paymentId, status });
  return NextResponse.json({ ok: true });
}
