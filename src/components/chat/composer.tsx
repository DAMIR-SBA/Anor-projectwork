"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Paperclip, Pencil, Reply, SendHorizontal, Smile, X } from "lucide-react";
import { uploadFile } from "@/components/ui/uploader";
import { VoiceRecorder, type VoiceResult } from "./voice";
import { EMOJI, matchCanned } from "@/lib/chat";
import type { ChatMessage } from "@/server/services/chat";
import { cn } from "@/lib/cn";

export type OutgoingAttachment = { url: string; fileName: string; mimeType: string; size: number; kind: "IMAGE" | "FILE" | "VOICE" | "VIDEO"; durationSec?: number; waveform?: number[] };
export type Canned = { id: string; title: string; shortcut: string; textUz: string; textRu: string };

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip";

function kindFor(mime: string): { upload: "image" | "video" | "document"; kind: OutgoingAttachment["kind"] } {
  if (mime.startsWith("image/")) return { upload: "image", kind: "IMAGE" };
  if (mime.startsWith("video/")) return { upload: "video", kind: "VIDEO" };
  return { upload: "document", kind: "FILE" };
}

export function Composer({
  disabled,
  replyTo,
  editing,
  canned = [],
  onCancelContext,
  onSend,
  onEdit,
  onTyping,
}: {
  disabled?: boolean;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  canned?: Canned[];
  onCancelContext: () => void;
  onSend: (text: string, attachments: OutgoingAttachment[]) => Promise<boolean>;
  onEdit: (m: ChatMessage, text: string) => Promise<boolean>;
  onTyping: () => void;
}) {
  const t = useTranslations("chat");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  // Entering edit mode loads the message text once (derived during render, no effect needed).
  if (editing && editing.id !== editingId) {
    setEditingId(editing.id);
    setText(editing.text ?? "");
  } else if (!editing && editingId) {
    setEditingId(null);
    setText("");
  }

  const suggestions = matchCanned(text, canned);

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = async () => {
    if (busy || uploading) return;
    const value = text.trim();
    if (!value && !pending.length) return;
    setBusy(true);
    setError(null);
    const ok = editing ? await onEdit(editing, value) : await onSend(value, pending);
    setBusy(false);
    if (ok) {
      setText("");
      setPending([]);
      requestAnimationFrame(resize);
      area.current?.focus();
    }
  };

  const upload = async (files: File[]) => {
    setUploading(true);
    setError(null);
    for (const f of files.slice(0, 10 - pending.length)) {
      const k = kindFor(f.type);
      try {
        const r = await uploadFile(f, k.upload, "chat");
        setPending((p) => [...p, { url: r.url, fileName: f.name, mimeType: r.type, size: r.size, kind: k.kind }]);
      } catch (err) {
        const code = (err as Error).message;
        setError(te.has(code) ? te(code) : te("generic"));
      }
    }
    setUploading(false);
    // Return focus so Enter sends the attachment right away.
    area.current?.focus();
  };

  const sendVoice = async (v: VoiceResult) => {
    setRecording(false);
    setUploading(true);
    try {
      const f = new File([v.blob], `voice-${Date.now()}.${v.mimeType.includes("mp4") ? "m4a" : "webm"}`, { type: v.mimeType });
      const r = await uploadFile(f, "audio", "chat");
      await onSend("", [{ url: r.url, fileName: f.name, mimeType: r.type, size: r.size, kind: "VOICE", durationSec: Math.round(v.durationSec * 10) / 10, waveform: v.waveform }]);
    } catch (err) {
      const code = (err as Error).message;
      setError(te.has(code) ? te(code) : te("generic"));
    }
    setUploading(false);
  };

  if (disabled) return <p className="border-t border-border bg-surface-2 px-4 py-3 text-center text-sm text-muted">{t("cannotWrite")}</p>;

  return (
    <div className="relative border-t border-border bg-surface px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 sm:px-3">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-[10px] bg-surface-2 px-3 py-1.5 text-sm">
          {editing ? <Pencil className="h-4 w-4 shrink-0 text-primary" /> : <Reply className="h-4 w-4 shrink-0 text-primary" />}
          <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
            <p className="text-[12px] font-bold text-primary">{editing ? t("editing") : t("replyingTo", { name: replyTo?.sender?.name ?? "—" })}</p>
            <p className="truncate text-muted">{(editing ?? replyTo)?.text ?? t("attachment")}</p>
          </div>
          <button type="button" onClick={onCancelContext} className="rounded-full p-1 hover:bg-surface-3" aria-label={t("cancel")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {pending.map((a) => (
            <li key={a.url} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-[13px]">
              <span className="max-w-40 truncate">{a.fileName}</span>
              <button type="button" onClick={() => setPending((p) => p.filter((x) => x.url !== a.url))} className="rounded-full p-0.5 hover:bg-surface-3" aria-label={t("remove")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-[12px] border border-border bg-surface shadow-[var(--shadow-lift)]" role="listbox" aria-label={t("canned")}>
          {suggestions.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setText(locale === "ru" ? c.textRu : c.textUz);
                  requestAnimationFrame(resize);
                  area.current?.focus();
                }}
              >
                <span className="font-bold">/{c.shortcut}</span> <span className="text-muted">— {c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mb-1 px-1 text-sm text-danger">{error}</p>}
      <div className="flex items-end gap-1">
        {recording ? (
          <VoiceRecorder onDone={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <>
            <div className="relative">
              <button type="button" onClick={() => setEmoji((v) => !v)} className="rounded-full p-2.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("emoji")} aria-expanded={emoji}>
                <Smile className="h-5.5 w-5.5" />
              </button>
              {emoji && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setEmoji(false)} aria-hidden />
                  <div className="absolute bottom-full left-0 z-40 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-[14px] border border-border bg-surface p-2 shadow-[var(--shadow-lift)]">
                    {EMOJI.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className="rounded-[8px] p-1 text-xl hover:bg-surface-2"
                        onClick={() => {
                          const el = area.current;
                          const pos = el?.selectionStart ?? text.length;
                          setText(text.slice(0, pos) + e + text.slice(pos));
                          setEmoji(false);
                          el?.focus();
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {!editing && (
              <button type="button" onClick={() => file.current?.click()} className="rounded-full p-2.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("attach")} disabled={uploading}>
                {uploading ? <Loader2 className="h-5.5 w-5.5 animate-spin" /> : <Paperclip className="h-5.5 w-5.5" />}
              </button>
            )}
            <input ref={file} type="file" hidden multiple accept={ACCEPT} onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ""))} />
            <label className="sr-only" htmlFor="chat-input">
              {t("placeholder")}
            </label>
            <textarea
              id="chat-input"
              ref={area}
              rows={1}
              value={text}
              maxLength={4000}
              placeholder={t("placeholder")}
              onChange={(e) => {
                setText(e.target.value);
                resize();
                const now = Date.now();
                if (now - lastTyping.current > 3000) {
                  lastTyping.current = now;
                  onTyping();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
                if (e.key === "Escape" && (replyTo || editing)) onCancelContext();
              }}
              onPaste={(e) => {
                const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                if (imgs.length) {
                  e.preventDefault();
                  void upload(imgs);
                }
              }}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-[20px] border border-border bg-surface-2 px-4 py-2.5 text-[15px] outline-none focus:border-primary focus:bg-surface"
            />
            {text.trim() || pending.length || editing ? (
              <button type="button" onClick={() => void submit()} disabled={busy || uploading} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform active:scale-95 disabled:opacity-60")} aria-label={editing ? t("save") : t("send")}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
              </button>
            ) : (
              <button type="button" onClick={() => setRecording(true)} disabled={uploading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("recordVoice")}>
                <Mic className="h-5.5 w-5.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
