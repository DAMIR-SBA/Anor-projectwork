"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Heart, Send, ShoppingCart, Zap } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/toast";
import { Countdown } from "@/components/ui/interactive";
import { addToCartAction } from "@/server/actions/cart";
import { liveChatAction, liveControlAction, liveLikeAction } from "@/server/actions/content";
import { formatUZS, groupDigits } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";
import { videoSources } from "@/lib/media";
import type { TimedPrice } from "@/lib/live";
import type { ProductCardData } from "@/lib/types";

export type LiveMessage = { id: string; name: string; text: string; at: string; mine?: boolean };

type Props = {
  stream: {
    id: string;
    title: string;
    status: "SCHEDULED" | "LIVE" | "ENDED";
    startsAt: string;
    streamUrl: string | null;
    posterUrl: string | null;
    viewers: number;
    likes: number;
    currentProductId: string | null;
    shop: { name: string; slug: string; logoUrl: string | null };
    products: ProductCardData[];
    timedPrices: TimedPrice[];
    messages: LiveMessage[];
  };
  me: { id: string } | null;
  /** The host's own console: moderation buttons on messages. */
  host?: boolean;
};

type Handler = (type: string, data: Record<string, unknown>) => void;

/** Live events over SSE, falling back to polling (`?since=`) when the stream cannot stay open. */
function useLiveEvents(streamId: string, enabled: boolean, onEvent: Handler) {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => {
    if (!enabled) return;
    const types = ["live.chat", "live.hide", "live.price", "live.product", "live.likes", "live.viewers", "live.status"];
    let since = Date.now() - 1000;
    let stop = false;
    let poll: ReturnType<typeof setTimeout> | null = null;
    const startPolling = () => {
      const tick = async () => {
        try {
          const res = await fetch(`/api/live/${streamId}/events?since=${since}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as { events: Array<{ type: string; data: Record<string, unknown>; at: number }>; now: number };
            for (const e of body.events) ref.current(e.type, e.data);
            since = Math.max(since, body.now - 1000);
          }
        } catch {
          /* offline: try again */
        }
        if (!stop) poll = setTimeout(tick, 3000);
      };
      void tick();
    };
    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        stop = true;
        if (poll) clearTimeout(poll);
      };
    }
    const es = new EventSource(`/api/live/${streamId}/events`);
    let failures = 0;
    es.addEventListener("ready", () => (failures = 0));
    for (const type of types) es.addEventListener(type, (e) => ref.current(type, JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      if (++failures >= 3) {
        es.close();
        startPolling();
      }
    };
    return () => {
      stop = true;
      es.close();
      if (poll) clearTimeout(poll);
    };
  }, [streamId, enabled]);
}

export function LiveRoom({ stream, me, host = false }: Props) {
  const t = useTranslations("live");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState(stream.messages);
  const [prices, setPrices] = useState(stream.timedPrices);
  const [current, setCurrent] = useState(stream.currentProductId);
  const [likes, setLikes] = useState(stream.likes);
  const [viewers, setViewers] = useState(stream.viewers);
  const [text, setText] = useState("");
  const [hearts, setHearts] = useState<number[]>([]);
  const [pending, start] = useTransition();
  const list = useRef<HTMLOListElement>(null);

  useLiveEvents(stream.id, stream.status !== "ENDED", (type, d) => {
    if (type === "live.chat") setMessages((m) => (m.some((x) => x.id === d.id) ? m : [...m.slice(-199), d as unknown as LiveMessage]));
    if (type === "live.hide") setMessages((m) => m.filter((x) => x.id !== d.id));
    if (type === "live.price") {
      const p = d as unknown as TimedPrice;
      setPrices((list) => [...list.filter((x) => x.productId !== p.productId), p]);
      setCurrent(p.productId);
    }
    if (type === "live.product") setCurrent(String(d.productId));
    if (type === "live.likes") setLikes(Number(d.likes));
    if (type === "live.viewers") setViewers(Number(d.viewers));
    if (type === "live.status") router.refresh();
  });

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  const send = () =>
    start(async () => {
      const r = await liveChatAction({ streamId: stream.id, text });
      if (!r.ok) return void toast.error(r.error);
      setText("");
      const m = r.data as LiveMessage;
      // The echo from the channel may arrive first; keep one copy, marked as ours.
      setMessages((list) => [...list.filter((x) => x.id !== m.id), m]);
    });
  const like = () => {
    setHearts((h) => [...h.slice(-8), Math.random()]);
    void liveLikeAction({ streamId: stream.id });
  };
  const add = (p: ProductCardData) =>
    start(async () => {
      if (!p.variantId || p.variantCount > 1) return router.push(`/p/${p.slug}`);
      const r = await addToCartAction({ variantId: p.variantId, quantity: 1 });
      if (r.ok) toast.success(t("added"), p.title);
      else toast.error(r.error);
    });
  const priceOf = (id: string) => prices.find((x) => x.productId === id) ?? null;
  const shown = stream.products.find((p) => p.id === current) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="relative mx-auto aspect-[9/16] max-h-[72vh] overflow-hidden rounded-[20px] bg-[#1A1A1F]">
          {stream.status === "LIVE" && stream.streamUrl ? (
            <video poster={stream.posterUrl ?? undefined} className="h-full w-full object-cover" autoPlay muted loop playsInline aria-label={stream.title}>
              {videoSources(stream.streamUrl).map((s) => (
                <source key={s.src} src={s.src} type={s.type} />
              ))}
            </video>
          ) : (
            stream.posterUrl && <Image src={stream.posterUrl} alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className={cn("object-cover", stream.status !== "LIVE" && "opacity-60")} />
          )}
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {stream.status === "LIVE" && <span className="rounded bg-[#C8102E] px-2 py-0.5 text-xs font-extrabold text-white">LIVE</span>}
            <span className="flex items-center gap-1 rounded bg-black/55 px-2 py-0.5 text-xs font-bold text-white" aria-label={t("viewers", { count: viewers, n: groupDigits(viewers) })}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {viewers}
            </span>
          </div>
          {stream.status === "SCHEDULED" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/90">{t("startsIn")}</p>
                <Countdown to={stream.startsAt} className="text-3xl font-extrabold" onDone={() => router.refresh()} />
                <p className="text-sm text-white/90">{fmtDateTime(stream.startsAt, locale)}</p>
              </div>
            </div>
          )}
          {stream.status === "ENDED" && <p className="absolute inset-0 grid place-items-center text-lg font-bold text-white">{t("endedLong")}</p>}
          {stream.status === "LIVE" && (
            <>
              <div className="pointer-events-none absolute bottom-24 right-4 h-48 w-12" aria-hidden="true">
                {hearts.map((h) => (
                  <Heart key={h} className="live-heart absolute bottom-0 h-6 w-6 fill-[#C8102E] text-[#C8102E]" style={{ left: `${Math.round(h * 24)}px` }} />
                ))}
              </div>
              <button type="button" onClick={like} className="absolute bottom-4 right-4 flex flex-col items-center gap-0.5 text-xs font-bold text-white" aria-label={t("like")}>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45">
                  <Heart className="h-6 w-6" />
                </span>
                {likes}
              </button>
            </>
          )}
          {shown && stream.status === "LIVE" && (
            <div className="absolute inset-x-3 bottom-4 mr-16 flex items-center gap-2 rounded-[14px] bg-white/95 p-2 text-[#1A1A1F]">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{shown.image && <Image src={shown.image} alt="" fill sizes="44px" className="object-cover" />}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-semibold">{shown.title}</span>
                <span className="text-sm font-extrabold text-[#C8102E]">{formatUZS(priceOf(shown.id)?.price ?? shown.price, locale)}</span>
              </span>
              <button type="button" onClick={() => add(shown)} disabled={pending} className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#C8102E] text-white" aria-label={t("addToCart")}>
                <ShoppingCart className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/shop/${stream.shop.slug}`} className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-3 font-bold">
            {stream.shop.logoUrl ? <Image src={stream.shop.logoUrl} alt="" fill sizes="40px" className="object-cover" /> : stream.shop.name.slice(0, 1)}
          </Link>
          <div className="min-w-0">
            <h1 className="line-clamp-2 text-lg font-extrabold leading-tight">{stream.title}</h1>
            <Link href={`/shop/${stream.shop.slug}`} className="text-sm text-muted hover:text-fg">
              {stream.shop.name}
            </Link>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="card p-3" aria-labelledby="live-products">
          <h2 id="live-products" className="mb-2 px-1 font-bold">
            {t("products")}
          </h2>
          <ul className="max-h-[320px] space-y-2 overflow-y-auto">
            {stream.products.map((p) => {
              const lp = priceOf(p.id);
              return (
                <li key={p.id} className={cn("flex items-center gap-2 rounded-[12px] p-2", current === p.id && stream.status === "LIVE" ? "bg-primary-50 ring-1 ring-primary dark:bg-primary/10" : "bg-surface-2")}>
                  <Link href={`/p/${p.slug}`} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface">
                    {p.image && <Image src={p.image} alt="" fill sizes="56px" className="object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    {current === p.id && stream.status === "LIVE" && <span className="text-[11px] font-extrabold uppercase text-primary">{t("onScreen")}</span>}
                    <Link href={`/p/${p.slug}`} className="line-clamp-1 text-sm font-semibold hover:text-primary">
                      {p.title}
                    </Link>
                    {lp ? (
                      <p className="text-sm">
                        <b className="text-[#C8102E]">{formatUZS(lp.price, locale)}</b> <s className="text-xs text-muted">{formatUZS(p.price, locale)}</s>
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-semibold text-muted">
                          <Zap className="h-3 w-3" aria-hidden="true" /> <Countdown to={lp.to} onDone={() => setPrices((list) => list.filter((x) => x !== lp))} />
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm font-bold">{formatUZS(p.price, locale)}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => add(p)} disabled={pending || !p.inStock} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#C8102E] text-white disabled:opacity-40" aria-label={`${t("addToCart")}: ${p.title}`}>
                    <ShoppingCart className="h-5 w-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card flex min-h-[320px] flex-1 flex-col p-3" aria-labelledby="live-chat">
          <h2 id="live-chat" className="mb-2 px-1 font-bold">
            {t("chat")}
          </h2>
          <ol ref={list} className="max-h-[360px] flex-1 space-y-1.5 overflow-y-auto px-1 text-sm" aria-live="polite">
            {messages.length === 0 && <li className="text-muted">{t("chatEmpty")}</li>}
            {messages.map((m) => (
              <li key={m.id} className="group flex items-start gap-1.5">
                <span className="min-w-0 flex-1 break-words">
                  <b className={cn(m.mine && "text-primary")}>{m.name}</b> {m.text}
                </span>
                {host && (
                  <button type="button" className="shrink-0 text-xs text-muted hover:text-danger" onClick={() => void liveControlAction({ op: "hide", streamId: stream.id, messageId: m.id })}>
                    {t("hide")}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {stream.status === "LIVE" &&
            (me ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) send();
                }}
              >
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t("chatPlaceholder")} aria-label={t("chatPlaceholder")} className="h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm outline-none focus:border-primary" />
                <button type="submit" disabled={pending || !text.trim()} className="grid h-11 w-11 place-items-center rounded-[12px] bg-[#C8102E] text-white disabled:opacity-40" aria-label={t("send")}>
                  <Send className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <Link href={`/auth/login?next=/live/${stream.id}`} className="mt-2 block rounded-[12px] bg-surface-2 p-3 text-center text-sm font-semibold text-primary">
                {t("signInToChat")}
              </Link>
            ))}
        </section>
      </div>
    </div>
  );
}
