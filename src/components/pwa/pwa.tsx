"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellRing, Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { savePushSubscriptionAction } from "@/server/actions/wallet";

/** The service worker runs in production builds; NEXT_PUBLIC_ENABLE_SW=1 turns it on in dev. */
const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
const DISMISS_KEY = "anor_install_dismissed";
const DISMISS_DAYS = 14;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode: the prompt simply comes back next visit */
  }
}

/** Wipe cached pages and API responses (called on sign-out). */
export function clearOfflineCache() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage("anor:clear-private");
}

/** Registers /sw.js once per page load (or removes a stale one in dev). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!SW_ENABLED) {
      // A worker left over from a production run would serve stale chunks to the dev server.
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

const subscribeStandalone = (cb: () => void) => {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/**
 * "Install the app" card: Chrome/Edge/Samsung use the native prompt; iOS Safari gets the
 * Share → Add to Home Screen hint. Hidden when installed, inside Telegram, or dismissed lately.
 */
export function InstallPrompt({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("pwa");
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (disabled || readDismissed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Give iOS visitors a moment on the page before suggesting it.
    const timer = isIos() ? setTimeout(() => setIos(true), 15_000) : null;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, [disabled]);

  if (disabled || standalone || hidden || (!evt && !ios)) return null;
  const dismiss = () => {
    writeDismissed();
    setHidden(true);
  };
  return (
    <div role="dialog" aria-label={t("title")} className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-[16px] border border-border bg-surface p-3 shadow-lg md:bottom-4">
      <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{t("title")}</p>
        <p className="text-sm text-muted">
          {evt ? (
            t("text")
          ) : (
            <>
              {t("iosBefore")} <Share className="inline h-4 w-4 align-text-bottom" aria-label={t("share")} /> {t("iosAfter")}
            </>
          )}
        </p>
        {evt && (
          <Button
            size="sm"
            className="mt-2"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={async () => {
              await evt.prompt();
              const choice = await evt.userChoice;
              if (choice.outcome === "dismissed") writeDismissed();
              setHidden(true);
            }}
          >
            {t("install")}
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-surface-2" aria-label={t("later")}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const subscribeNothing = () => () => {};
const pushSupport = () => ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? Notification.permission : "unsupported");

/** Turn on push notifications for this device (Web Push with the server's VAPID key). */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const t = useTranslations("pwa");
  const toast = useToast();
  const permission = useSyncExternalStore(subscribeNothing, pushSupport, () => "unknown");
  const [on, setOn] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration().then(async (reg) => setOn(!!(await reg?.pushManager.getSubscription())));
  }, []);

  if (permission === "unknown") return null;
  if (permission === "unsupported") return <p className="text-sm text-muted">{t("pushUnsupported")}</p>;
  if (!vapidKey) return <p className="text-sm text-muted">{t("pushNotConfigured")}</p>;
  if (permission === "denied") return <p className="text-sm text-muted">{t("pushDenied")}</p>;
  if (on) return <p className="flex items-center gap-1.5 text-sm font-semibold text-success">{t("pushOn")}</p>;
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      leftIcon={<BellRing className="h-4 w-4" />}
      onClick={() =>
        start(async () => {
          if ((await Notification.requestPermission()) !== "granted") return void toast.error(t("pushDenied"));
          const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
          await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
          const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
          const r = await savePushSubscriptionAction({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
          if (!r.ok) return void toast.error(r.error);
          setOn(true);
          toast.success(t("pushOn"));
        })
      }
    >
      {t("pushEnable")}
    </Button>
  );
}
