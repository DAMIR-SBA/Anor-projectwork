"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bot, GitCompare, MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product/product-card";
import { askAssistantAction } from "@/server/actions/assistant";
import type { AssistantReply } from "@/server/services/assistant";
import type { Intent } from "@/lib/assistant";
import { cn } from "@/lib/cn";

type Msg = { id: number; role: "user" | "assistant"; text: string; reply?: AssistantReply };

export function AssistantChat({ aiOn, starters }: { aiOn: boolean; starters: string[] }) {
  const t = useTranslations("assistant");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [context, setContext] = useState<{ id: string; title: string } | null>(null);
  const [prev, setPrev] = useState<Intent | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, pending]);

  const send = (message: string, contextIds?: string[]) => {
    const m = message.trim();
    if (!m || pending) return;
    const history = msgs.map((x) => ({ role: x.role, text: x.text })).slice(-10);
    setMsgs((cur) => [...cur, { id: ++seq.current, role: "user", text: m }]);
    setText("");
    start(async () => {
      const res = await askAssistantAction({ message: m, history, contextIds: contextIds ?? (context ? [context.id] : []), prev });
      if (!res.ok) return setMsgs((cur) => [...cur, { id: ++seq.current, role: "assistant", text: res.error ?? t("error") }]);
      const reply = res.data as AssistantReply;
      if (reply.intent.kind === "search") setPrev(reply.intent);
      setMsgs((cur) => [...cur, { id: ++seq.current, role: "assistant", text: reply.text, reply }]);
    });
  };
  const lastProducts = [...msgs].reverse().find((m) => m.reply?.products.length)?.reply?.products ?? [];

  return (
    <div className="flex min-h-[70vh] flex-col rounded-[20px] bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold">{t("title")}</p>
          <p className="text-xs text-muted">{aiOn ? t("modeAi") : t("modeBasic")}</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {!msgs.length && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-accent" />
            <p className="mt-2 text-lg font-bold">{t("hello")}</p>
            <p className="mt-1 text-sm text-muted">{t("helloText")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-full", m.role === "user" ? "max-w-[85%]" : "w-full")}>
              <p className={cn("whitespace-pre-line rounded-[16px] px-4 py-2.5 text-[15px]", m.role === "user" ? "ml-auto w-fit bg-primary text-white" : "w-fit bg-surface-2")}>{m.text}</p>
              {m.reply?.compare && (
                <div className="mt-3 overflow-x-auto rounded-[14px] border border-border">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="bg-surface-2 text-left">
                        <th className="p-2" />
                        {m.reply.compare.columns.map((c) => (
                          <th key={c.id} className="p-2 font-semibold">
                            <Link href={`/p/${c.slug}`} className="line-clamp-2 hover:underline">
                              {c.title}
                            </Link>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.reply.compare.rows.map((r) => (
                        <tr key={r.label} className="border-t border-border">
                          <th scope="row" className="p-2 text-left font-medium text-muted">
                            {r.label}
                          </th>
                          {r.values.map((v, i) => (
                            <td key={i} className="p-2 tabular">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!!m.reply?.products.length && !m.reply.compare && (
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {m.reply.products.map((p) => (
                    <li key={p.id} className="space-y-1">
                      <ProductCard p={p} />
                      <button type="button" onClick={() => setContext({ id: p.id, title: p.title })} className="flex w-full items-center justify-center gap-1 rounded-[10px] py-1 text-xs font-semibold text-primary hover:bg-surface-2">
                        <MessageCircleQuestion className="h-3.5 w-3.5" /> {t("askAbout")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {m.role === "assistant" && m.reply && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.reply.products.length >= 2 && !m.reply.compare && (
                    <button type="button" onClick={() => send(t("sCompare"), m.reply!.products.slice(0, 3).map((p) => p.id))} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-surface-3">
                      <GitCompare className="h-3.5 w-3.5" /> {t("compareTop")}
                    </button>
                  )}
                  {m.reply.suggestions.filter((s) => s !== t("sCompare")).map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-surface-3">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && <p className="w-fit animate-pulse rounded-[16px] bg-surface-2 px-4 py-2.5 text-sm text-muted">{t("thinking")}</p>}
        <div ref={end} />
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {context && (
          <p className="mb-2 flex w-fit items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary dark:bg-primary/15">
            {t("aboutProduct", { title: context.title.slice(0, 40) })}
            <button type="button" onClick={() => setContext(null)} aria-label={t("clearContext")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            {t("placeholder")}
          </label>
          <input id="assistant-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={context ? t("placeholderProduct") : t("placeholder")} className="h-11 flex-1 rounded-[12px] border border-border bg-surface px-3 text-[15px] outline-none focus:border-primary" />
          <Button type="submit" disabled={!text.trim()} loading={pending} aria-label={t("send")}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {lastProducts.length > 0 && !context && <p className="mt-1.5 text-xs text-muted">{t("hintAsk")}</p>}
      </form>
    </div>
  );
}
