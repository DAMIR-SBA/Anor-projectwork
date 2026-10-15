import { getTranslations } from "next-intl/server";
import { env } from "@/server/env";
import { TelegramLogin } from "./telegram-login";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/** Google + Telegram sign-in. Hidden when not configured, mocked in DEMO_MODE. */
export async function SocialButtons({ next }: { next?: string }) {
  const t = await getTranslations("auth");
  const e = env();
  const google = !!e.GOOGLE_CLIENT_ID || e.DEMO_MODE;
  const telegram = !!e.TELEGRAM_BOT_TOKEN || e.DEMO_MODE;
  if (!google && !telegram) return null;
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("orContinueWith")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {google && (
          <a href={`/api/auth/google${q}`} className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface text-[15px] font-semibold hover:bg-surface-2">
            <GoogleIcon />
            {t("google")}
          </a>
        )}
        {telegram && <TelegramLogin label={t("telegram")} botUsername={e.TELEGRAM_BOT_TOKEN ? e.TELEGRAM_BOT_USERNAME : undefined} next={next} />}
      </div>
    </div>
  );
}
