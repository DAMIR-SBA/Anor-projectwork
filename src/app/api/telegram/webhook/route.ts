import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { safeEqual } from "@/server/security/crypto";
import { handleBuyerUpdate, type TgUpdate } from "@/server/telegram/bot";

/** Buyer bot webhook. Telegram sends the secret set via setWebhook in X-Telegram-Bot-Api-Secret-Token. */
export async function POST(req: NextRequest) {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await handleBuyerUpdate((await req.json()) as TgUpdate);
  } catch (err) {
    // Always 200: a non-200 makes Telegram redeliver the same update in a loop.
    log.error("telegram update failed", { err });
  }
  return NextResponse.json({ ok: true });
}
