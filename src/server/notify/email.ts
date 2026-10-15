import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

/** Email driver: console | resend | smtp (Mailpit in docker-compose). */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const e = env();
  try {
    if (e.EMAIL_DRIVER === "resend" && e.EMAIL_RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.EMAIL_RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: e.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      return true;
    }
    if (e.EMAIL_DRIVER === "smtp" && e.EMAIL_SMTP_HOST) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: e.EMAIL_SMTP_HOST,
        port: e.EMAIL_SMTP_PORT,
        secure: e.EMAIL_SMTP_PORT === 465,
        auth: e.EMAIL_SMTP_USER ? { user: e.EMAIL_SMTP_USER, pass: e.EMAIL_SMTP_PASSWORD } : undefined,
      });
      await transport.sendMail({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return true;
    }
    log.info("email (console driver)", { to: msg.to, subject: msg.subject, text: msg.text });
    return true;
  } catch (err) {
    log.error("email send failed", { err, to: msg.to });
    return false;
  }
}
