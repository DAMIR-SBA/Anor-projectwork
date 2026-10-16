// Register Telegram webhooks (buyer + seller bots) and the Mini App menu button.
//   npm run telegram:setup
// Needs APP_URL (public HTTPS), TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET; TELEGRAM_SELLER_BOT_TOKEN optional.
import "dotenv/config";

async function call(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as { ok: boolean; description?: string };
  console.log(`${method}: ${data.ok ? "ok" : data.description}`);
}

async function main() {
  const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const buyer = process.env.TELEGRAM_BOT_TOKEN;
  const seller = process.env.TELEGRAM_SELLER_BOT_TOKEN;
  if (!app.startsWith("https://") || !secret || !buyer) throw new Error("APP_URL (https), TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required");
  const updates = ["message", "callback_query"];
  await call(buyer, "setWebhook", { url: `${app}/api/telegram/webhook`, secret_token: secret, allowed_updates: updates, drop_pending_updates: true });
  await call(buyer, "setChatMenuButton", { menu_button: { type: "web_app", text: "ANOR", web_app: { url: `${app}/tg` } } });
  await call(buyer, "setMyCommands", { commands: [{ command: "orders", description: "Buyurtmalarim / Мои заказы" }, { command: "help", description: "Yordam / Помощь" }, { command: "unlink", description: "Akkauntni uzish / Отвязать" }] });
  if (seller && seller !== buyer) await call(seller, "setWebhook", { url: `${app}/api/telegram/seller`, secret_token: secret, allowed_updates: updates, drop_pending_updates: true });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
