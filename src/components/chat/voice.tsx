"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Send, Trash2 } from "lucide-react";
import { downsample, formatDuration } from "@/lib/chat";
import { cn } from "@/lib/cn";

export type VoiceResult = { blob: Blob; mimeType: string; durationSec: number; waveform: number[] };

const MAX_SECONDS = 120;

/** Records a voice note with MediaRecorder and samples loudness for the waveform. */
export function VoiceRecorder({ onDone, onCancel }: { onDone: (r: VoiceResult) => void; onCancel: () => void }) {
  const t = useTranslations("chat");
  const [elapsed, setElapsed] = useState(0);
  const [bars, setBars] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const peaks = useRef<number[]>([]);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const sendOnStop = useRef(false);
  // The recording effect must run once; keep the latest callback/strings in refs.
  const done = useRef(onDone);
  const micDenied = useRef(t("micDenied"));
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
        const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          stream?.getTracks().forEach((tr) => tr.stop());
          if (!sendOnStop.current) return;
          const type = (r.mimeType || "audio/webm").split(";")[0];
          done.current({ blob: new Blob(chunks.current, { type }), mimeType: type, durationSec: (performance.now() - started.current) / 1000, waveform: downsample(peaks.current, 40) });
        };
        r.start(250);
        started.current = performance.now();
        let last = 0;
        const loop = (now: number) => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          if (now - last > 60) {
            last = now;
            peaks.current.push(Math.min(1, peak * 1.6));
            setBars(downsample(peaks.current.slice(-80), 32));
            const sec = (now - started.current) / 1000;
            setElapsed(sec);
            if (sec >= MAX_SECONDS) {
              sendOnStop.current = true;
              r.stop();
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setError(micDenied.current);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (rec.current?.state === "recording") rec.current.stop();
      stream?.getTracks().forEach((tr) => tr.stop());
      void ctx?.close();
    };
  }, []);

  const stop = (send: boolean) => {
    sendOnStop.current = send;
    if (rec.current?.state === "recording") rec.current.stop();
    if (!send) onCancel();
  };

  if (error)
    return (
      <div className="flex flex-1 items-center justify-between gap-2 rounded-[14px] bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
        <button type="button" onClick={onCancel} className="font-semibold underline">
          OK
        </button>
      </div>
    );

  return (
    <div className="flex flex-1 items-center gap-2" role="group" aria-label={t("recording")}>
      <button type="button" onClick={() => stop(false)} className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-danger" aria-label={t("cancelRecording")}>
        <Trash2 className="h-5 w-5" />
      </button>
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
      <span className="tabular w-10 text-sm font-semibold">{formatDuration(elapsed)}</span>
      <div className="flex h-8 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
        {bars.map((b, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full bg-primary" style={{ height: `${Math.max(12, b * 100)}%` }} />
        ))}
      </div>
      <button type="button" onClick={() => stop(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white" aria-label={t("sendVoice")}>
        <Send className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}

/** Voice note player: tap to play, waveform fills with progress, tap the bars to seek. */
export function VoicePlayer({ url, duration, waveform, mine }: { url: string; duration: number | null; waveform: number[] | null; mine: boolean }) {
  const t = useTranslations("chat");
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(duration ?? 0);
  const bars = waveform?.length ? waveform : downsample([], 40);
  return (
    <div className="flex min-w-[200px] items-center gap-2.5">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (length || e.currentTarget.duration || 1))}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      />
      <button
        type="button"
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play().then(() => setPlaying(true));
          else {
            a.pause();
            setPlaying(false);
          }
        }}
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", mine ? "bg-white text-primary" : "bg-primary text-white")}
        aria-label={playing ? t("pause") : t("play")}
      >
        {playing ? <Pause className="h-4.5 w-4.5" fill="currentColor" /> : <Play className="ml-0.5 h-4.5 w-4.5" fill="currentColor" />}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div
          className="flex h-7 cursor-pointer items-center gap-[2px]"
          onClick={(e) => {
            const a = audio.current;
            if (!a || !length) return;
            const r = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - r.left) / r.width) * length;
          }}
          aria-hidden
        >
          {bars.map((b, i) => (
            <span key={i} className={cn("w-[3px] shrink-0 rounded-full", i / bars.length < progress ? (mine ? "bg-white" : "bg-primary") : mine ? "bg-white/40" : "bg-primary/30")} style={{ height: `${Math.max(14, b * 100)}%` }} />
          ))}
        </div>
        <span className={cn("tabular text-[11px]", mine ? "text-white/80" : "text-muted")}>{formatDuration(playing ? progress * length : length)}</span>
      </div>
    </div>
  );
}
