"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Mic, Search, TrendingUp, X, Camera } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type Suggestion = { type: "product" | "category" | "brand" | "query"; label: string; href?: string; image?: string | null };
type SuggestResponse = { suggestions: Suggestion[]; trending: string[]; history: string[] };

const HISTORY_KEY = "anor_search_history";

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function pushHistory(q: string) {
  try {
    const next = [q, ...readHistory().filter((x) => x !== q)].slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable */
  }
}

/** Header search with autocomplete (typo-tolerant suggestions), history, trending and voice input. */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [active, setActive] = useState(-1);
  const [listening, setListening] = useState(false);
  const wrap = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search/suggest?q=${encodeURIComponent(q)}&locale=${locale}`, { signal: ctrl.signal });
        if (res.ok) {
          const json = (await res.json()) as SuggestResponse;
          setData({ ...json, history: q ? [] : readHistory() });
          setActive(-1);
        }
      } catch {
        /* aborted or offline */
      }
    }, 150);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open, locale]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (query: string, href?: string) => {
    setOpen(false);
    if (href) return router.push(href);
    const clean = query.trim();
    if (!clean) return;
    pushHistory(clean);
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  const items: Suggestion[] = data ? [...data.history.map((h) => ({ type: "query" as const, label: h })), ...data.suggestions] : [];

  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = locale === "ru" ? "ru-RU" : "uz-UZ";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setQ(text);
      go(text);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <form
      ref={wrap}
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const sel = items[active];
        go(sel?.label ?? q, sel?.href);
      }}
    >
      <div className={cn("flex h-11 items-center rounded-[12px] border-2 bg-surface transition-colors", open ? "border-primary" : "border-primary/70")}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent pl-4 text-[15px] placeholder:text-muted focus:outline-none"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="p-2 text-muted hover:text-fg" aria-label={t("reset")}>
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={startVoice} className={cn("hidden p-2 text-muted hover:text-fg sm:block", listening && "animate-pulse text-primary")} aria-label="Voice search">
          <Mic className="h-4.5 w-4.5" />
        </button>
        <button type="button" onClick={() => router.push("/search/image")} className="hidden p-2 text-muted hover:text-fg sm:block" aria-label="Image search">
          <Camera className="h-4.5 w-4.5" />
        </button>
        <button type="submit" className="mr-1 flex h-8 items-center rounded-[9px] bg-primary px-3 text-white hover:bg-primary-dark" aria-label={t("search")}>
          <Search className="h-4.5 w-4.5" />
        </button>
      </div>
      {open && data && (items.length > 0 || data.trending.length > 0) && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[16px] border border-border bg-surface shadow-[var(--shadow-lift)]">
          <ul id={listId} role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.map((s, i) => (
              <li key={`${s.type}-${s.label}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(s.label, s.href)} className={cn("flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[15px]", i === active && "bg-surface-2")}>
                  {s.type === "query" ? <Clock className="h-4 w-4 shrink-0 text-muted" /> : s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <Search className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate">{s.label}</span>
                  {s.type !== "product" && s.type !== "query" && <span className="ml-auto text-xs text-muted">{s.type === "category" ? "▸" : "®"}</span>}
                </button>
              </li>
            ))}
          </ul>
          {!q && data.trending.length > 0 && (
            <div className="border-t border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <TrendingUp className="h-3.5 w-3.5" /> Trend
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.trending.map((tr) => (
                  <button key={tr} type="button" onClick={() => go(tr)} className="rounded-full bg-surface-2 px-3 py-1 text-sm hover:bg-surface-3">
                    {tr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
};
