import "server-only";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().default("dev-only-insecure-session-secret-change-me-please"),
  DEMO_MODE: bool,

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  STORAGE_SUPABASE_URL: z.string().optional(),
  STORAGE_SUPABASE_SERVICE_KEY: z.string().optional(),
  STORAGE_SUPABASE_BUCKET: z.string().default("anor"),
  STORAGE_MAX_UPLOAD_MB: z.coerce.number().default(10),

  EMAIL_DRIVER: z.enum(["console", "resend", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("ANOR <no-reply@anor.local>"),
  EMAIL_RESEND_API_KEY: z.string().optional(),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(1025),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASSWORD: z.string().optional(),

  SMS_DRIVER: z.enum(["console", "eskiz"]).default("console"),
  SMS_ESKIZ_BASE_URL: z.string().default("https://notify.eskiz.uz/api"),
  SMS_ESKIZ_EMAIL: z.string().optional(),
  SMS_ESKIZ_PASSWORD: z.string().optional(),
  SMS_SENDER: z.string().default("4546"),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  JOBS_DRIVER: z.enum(["inline", "pgboss"]).default("inline"),
  REALTIME_DRIVER: z.enum(["sse", "poll"]).default("sse"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-flash-lite"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_SELLER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_SELLER_BOT_USERNAME: z.string().optional(),
  TELEGRAM_OWNER_CHAT_ID: z.string().optional(),

  SUPER_ADMIN_LOGIN: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
  SUPER_ADMIN_ACCESS_CODE: z.string().optional(),
  OWNER_ALERT_EMAIL: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  // Deep links for future native apps (served from /.well-known).
  ANDROID_APP_PACKAGE: z.string().optional(),
  ANDROID_APP_SHA256: z.string().optional(),
  IOS_APP_ID: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@anor.local"),
  CRON_SECRET: z.string().optional(),
  VIRUS_SCAN_WEBHOOK_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

const PLACEHOLDER = /change[_-]?me|placeholder|your[_-]|example|^x+$/i;

export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || PLACEHOLDER.test(value);
}

/**
 * Refuse to boot a production server with default/placeholder secrets.
 * Called from instrumentation.register() (not during `next build`).
 */
export function assertProductionEnv() {
  const e = env();
  if (e.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (isPlaceholder(e.SESSION_SECRET) || e.SESSION_SECRET.length < 32) problems.push("SESSION_SECRET must be a random string of 32+ chars");
  if (isPlaceholder(e.SUPER_ADMIN_LOGIN)) problems.push("SUPER_ADMIN_LOGIN is a placeholder");
  if (isPlaceholder(e.SUPER_ADMIN_PASSWORD) || (e.SUPER_ADMIN_PASSWORD?.length ?? 0) < 12) problems.push("SUPER_ADMIN_PASSWORD is a placeholder or shorter than 12 chars");
  if (isPlaceholder(e.SUPER_ADMIN_ACCESS_CODE) || (e.SUPER_ADMIN_ACCESS_CODE?.length ?? 0) < 6) problems.push("SUPER_ADMIN_ACCESS_CODE is a placeholder or shorter than 6 chars");
  if (problems.length) {
    throw new Error(`[anor] Refusing to start in production:\n - ${problems.join("\n - ")}`);
  }
}

export const isDemo = () => env().DEMO_MODE;
