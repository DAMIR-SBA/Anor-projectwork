"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, X } from "lucide-react";

/** Uploads files to /api/upload and returns their URLs. Validates on the server too. */
export async function uploadFile(file: File, kind: "image" | "video" | "audio" | "document", folder: string): Promise<{ url: string; name: string; size: number; type: string }> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", kind);
  fd.set("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json()) as { url?: string; name: string; size: number; type: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "upload");
  return data as { url: string; name: string; size: number; type: string };
}

export function ImageUploader({ value, onChange, folder, max = 6, accept = "image/jpeg,image/png,image/webp", kind = "image" }: { value: string[]; onChange: (urls: string[]) => void; folder: string; max?: number; accept?: string; kind?: "image" | "video" }) {
  const te = useTranslations("errors");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <span key={url} className="relative h-20 w-20 overflow-hidden rounded-[12px] bg-surface-2">
            {kind === "video" || url.endsWith(".mp4") || url.endsWith(".webm") ? <video src={url} className="h-full w-full object-cover" muted /> : <Image src={url} alt="" fill sizes="80px" className="object-cover" />}
            <button type="button" onClick={() => onChange(value.filter((u) => u !== url))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="remove">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => input.current?.click()} className="flex h-20 w-20 items-center justify-center rounded-[12px] border-2 border-dashed border-border text-muted hover:border-primary hover:text-primary" disabled={busy} aria-label="upload">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, max - value.length);
          e.target.value = "";
          setBusy(true);
          setError(null);
          const urls: string[] = [];
          for (const f of files) {
            try {
              urls.push((await uploadFile(f, kind, folder)).url);
            } catch (err) {
              const code = (err as Error).message;
              setError(te.has(code) ? te(code) : te("generic"));
            }
          }
          onChange([...value, ...urls]);
          setBusy(false);
        }}
      />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
