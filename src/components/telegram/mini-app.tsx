"use client";

import Script from "next/script";
import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button, Spinner } from "@/components/ui/button";

type TgWebApp = { initData: string; ready(): void; expand(): void; openTelegramLink?(url: string): void };
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

type Labels = { signingIn: string; notTelegram: string; failed: string; demo: string; open: string };

export function TelegramMiniApp({ configured, demo, labels }: { configured: boolean; demo: boolean; labels: Labels }) {
  const [state, setState] = useState<"loading" | "outside" | "failed">("loading");

  const signIn = useCallback(async (payload: { initData?: string; demo?: boolean }) => {
    const res = await fetch("/api/telegram/webapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string };
    if (data.ok && data.next) window.location.replace(data.next);
    else setState("failed");
  }, []);

  const onReady = useCallback(() => {
    const wa = window.Telegram?.WebApp;
    if (!wa?.initData) return setState("outside");
    wa.ready();
    wa.expand();
    void signIn({ initData: wa.initData });
  }, [signIn]);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={onReady} onError={() => setState("outside")} />
      {state === "loading" && (
        <p className="flex items-center gap-2 text-muted">
          <Spinner className="h-5 w-5" /> {labels.signingIn}
        </p>
      )}
      {state !== "loading" && (
        <div className="max-w-sm space-y-4">
          <p className="text-muted">{state === "failed" ? labels.failed : labels.notTelegram}</p>
          {!configured && demo && <Button onClick={() => signIn({ demo: true })}>{labels.demo}</Button>}
          <Link href="/" className="block font-semibold text-primary underline">
            {labels.open}
          </Link>
        </div>
      )}
    </>
  );
}
