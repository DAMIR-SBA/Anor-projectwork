"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Camera, CameraOff, Minus, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Radio } from "@/components/ui/form";
import { scanAdjustAction, scanLookupAction } from "@/server/actions/seller-stock";
import { cn } from "@/lib/cn";

type Item = { variantId: string; title: string; sku: string; barcode: string | null; image: string | null; sellerQty: number; total: number };
type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

/**
 * Stock scanner: camera barcode detection (BarcodeDetector, Chromium/Android) with manual entry as a
 * fallback. "Receive" mode adds one unit per scan; "count" mode sets the counted quantity.
 */
export function Scanner() {
  const t = useTranslations("sellerStock.scan");
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  // Server snapshot false; the client re-renders after hydration if the API exists.
  const supported = useSyncExternalStore(
    () => () => {},
    () => "BarcodeDetector" in window,
    () => false,
  );
  const [mode, setMode] = useState<"receive" | "count">("receive");
  const [code, setCode] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [count, setCount] = useState("");
  const [log, setLog] = useState<Array<{ at: string; text: string; ok: boolean }>>([]);
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const handleRef = useRef<(c: string) => void>(() => {});

  const push = (text: string, ok = true) => setLog((l) => [{ at: new Date().toLocaleTimeString("ru-RU"), text, ok }, ...l].slice(0, 20));

  const handle = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    const res = await scanLookupAction({ code: c });
    const found = res.ok ? (res.data as Item | null) : null;
    if (!found) {
      setItem(null);
      return push(t("notFound", { code: c }), false);
    }
    if (mode === "receive") {
      const adj = await scanAdjustAction({ variantId: found.variantId, delta: 1 });
      const q = adj.ok ? Number((adj.data as { quantity: number }).quantity) : found.sellerQty;
      setItem({ ...found, sellerQty: q });
      push(`+1 ${found.sku} → ${q}`);
      navigator.vibrate?.(60);
    } else {
      setItem(found);
      setCount(String(found.sellerQty));
    }
  };
  useEffect(() => {
    handleRef.current = (c) => void handle(c);
  });

  useEffect(() => {
    if (!camera || !supported) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current || stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "qr_code"] });
        const loop = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const v = codes[0]?.rawValue;
            // Ignore the same code for 1.5 s so one scan is one unit.
            if (v && (v !== lastCode.current.code || Date.now() - lastCode.current.at > 1500)) {
              lastCode.current = { code: v, at: Date.now() };
              handleRef.current(v);
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void loop());
        };
        void loop();
      } catch {
        setCamera(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [camera, supported]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex gap-4">
        <Radio name="mode" checked={mode === "receive"} onChange={() => setMode("receive")} label={t("receive")} />
        <Radio name="mode" checked={mode === "count"} onChange={() => setMode("count")} label={t("count")} />
      </div>
      <div className="relative overflow-hidden rounded-[16px] bg-black">
        {camera ? (
          <>
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <ScanLine className="pointer-events-none absolute inset-0 m-auto h-24 w-24 animate-pulse text-primary" />
          </>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/70">
            <CameraOff className="h-8 w-8" />
            {supported ? t("cameraOff") : t("unsupported")}
          </div>
        )}
      </div>
      {supported && (
        <Button variant={camera ? "secondary" : "primary"} className="w-full" leftIcon={<Camera className="h-4 w-4" />} onClick={() => setCamera((c) => !c)}>
          {camera ? t("stopCamera") : t("startCamera")}
        </Button>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handle(code);
          setCode("");
        }}
      >
        <Input aria-label={t("manual")} placeholder={t("manual")} value={code} onChange={(e) => setCode(e.target.value)} autoFocus inputMode="numeric" />
        <Button type="submit">{t("find")}</Button>
      </form>
      {item && (
        <div className="card flex items-center gap-3 p-4">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{item.image && <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />}</span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-semibold">{item.title}</p>
            <p className="text-xs text-muted">
              {item.sku} · {t("onHand")}: <b className="text-fg">{item.sellerQty}</b>
            </p>
          </div>
          {mode === "receive" ? (
            <div className="flex gap-1">
              <Button size="icon" variant="outline" aria-label="-1" onClick={async () => { const r = await scanAdjustAction({ variantId: item.variantId, delta: -1 }); if (r.ok) setItem({ ...item, sellerQty: Number((r.data as { quantity: number }).quantity) }); }}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button size="icon" aria-label="+1" onClick={async () => { const r = await scanAdjustAction({ variantId: item.variantId, delta: 1 }); if (r.ok) setItem({ ...item, sellerQty: Number((r.data as { quantity: number }).quantity) }); }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <form
              className="flex gap-1"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await scanAdjustAction({ variantId: item.variantId, set: Number(count) || 0 });
                if (r.ok) {
                  setItem({ ...item, sellerQty: Number((r.data as { quantity: number }).quantity) });
                  push(`= ${item.sku} → ${count}`);
                }
              }}
            >
              <Input aria-label={t("counted")} value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} className="w-20" inputMode="numeric" />
              <Button type="submit">{t("set")}</Button>
            </form>
          )}
        </div>
      )}
      {log.length > 0 && (
        <ul className="space-y-1 text-[13px]" aria-live="polite">
          {log.map((l, i) => (
            <li key={i} className={cn(l.ok ? "text-fg" : "text-danger")}>
              <span className="text-muted">{l.at}</span> {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
