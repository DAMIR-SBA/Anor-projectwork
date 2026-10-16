"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

type TgUser = Record<string, string | number>;

/**
 * Telegram Login Widget. With a configured bot it loads telegram-widget.js and posts the
 * signed payload to /api/auth/telegram; without one (demo) it signs in a test Telegram user.
 */
export function TelegramLogin({ label, botUsername, next }: { label: string; botUsername?: string; next?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [widget, setWidget] = useState(false);

  useEffect(() => {
    if (!botUsername || !widget || !holder.current) return;
    (window as unknown as { onTelegramAuth: (u: TgUser) => void }).onTelegramAuth = (u: TgUser) => {
      const params = new URLSearchParams(Object.entries(u).map(([k, v]) => [k, String(v)]));
      if (next) params.set("next", next);
      // A full navigation: the API route sets the session cookie and redirects.
      window.location.assign(new URL(`/api/auth/telegram?${params.toString()}`, window.location.origin).href);
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", botUsername);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "12");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-request-access", "write");
    holder.current.appendChild(s);
  }, [botUsername, widget, next]);

  if (botUsername && widget) return <div ref={holder} className="flex h-11 items-center justify-center" />;

  return (
    <button
      type="button"
      onClick={() => {
        if (botUsername) setWidget(true);
        // Demo sign-in goes through the same API route (full navigation, it sets the cookie).
        else window.location.assign(new URL(`/api/auth/telegram?demo=1${next ? `&next=${encodeURIComponent(next)}` : ""}`, window.location.origin).href);
      }}
      className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#1A6FA8] text-[15px] font-semibold text-white hover:brightness-95"
    >
      <Send className="h-4.5 w-4.5" aria-hidden />
      {label}
    </button>
  );
}
