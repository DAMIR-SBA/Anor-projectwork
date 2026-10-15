import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

let eskizToken: { value: string; expiresAt: number } | null = null;

async function getEskizToken(): Promise<string> {
  if (eskizToken && eskizToken.expiresAt > Date.now()) return eskizToken.value;
  const e = env();
  const form = new FormData();
  form.set("email", e.SMS_ESKIZ_EMAIL ?? "");
  form.set("password", e.SMS_ESKIZ_PASSWORD ?? "");
  const res = await fetch(`${e.SMS_ESKIZ_BASE_URL}/auth/login`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`eskiz auth ${res.status}`);
  const data = (await res.json()) as { data?: { token?: string } };
  const token = data.data?.token;
  if (!token) throw new Error("eskiz: no token");
  // Tokens live 30 days; refresh well before that.
  eskizToken = { value: token, expiresAt: Date.now() + 20 * 86_400_000 };
  return token;
}

/** SMS driver: console | eskiz (Eskiz-compatible HTTP API). Phone in +998XXXXXXXXX format. */
export async function sendSms(phone: string, text: string): Promise<boolean> {
  const e = env();
  try {
    if (e.SMS_DRIVER === "eskiz" && e.SMS_ESKIZ_EMAIL) {
      const token = await getEskizToken();
      const form = new FormData();
      form.set("mobile_phone", phone.replace(/^\+/, ""));
      form.set("message", text);
      form.set("from", e.SMS_SENDER);
      const res = await fetch(`${e.SMS_ESKIZ_BASE_URL}/message/sms/send`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (res.status === 401) eskizToken = null;
      if (!res.ok) throw new Error(`eskiz send ${res.status}`);
      return true;
    }
    log.info("sms (console driver)", { phone, text });
    return true;
  } catch (err) {
    log.error("sms send failed", { err, phone });
    return false;
  }
}
