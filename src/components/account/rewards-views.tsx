"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, Flame, Gift } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { checkInAction, claimMissionAction, spinAction } from "@/server/actions/rewards";
import { WHEEL } from "@/lib/gamification";
import { groupDigits } from "@/lib/money";
import { cn } from "@/lib/cn";

export function CheckInCard({ today, streak, nextPoints, week }: { today: boolean; streak: number; nextPoints: number; week: Array<{ day: string; label: string; done: boolean }> }) {
  const t = useTranslations("rewards");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarCheck className="h-5 w-5 text-primary" /> {t("checkin.title")}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Flame className="h-4 w-4 text-accent" /> {t("checkin.streak", { n: streak })}
          </p>
        </div>
        <Button
          disabled={today}
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await checkInAction({});
              if (!res.ok) return void toast.error(res.error ?? "");
              const d = res.data as { points: number; streak: number };
              toast.success(t("checkin.done", { points: groupDigits(d.points) }));
              router.refresh();
            })
          }
        >
          {today ? t("checkin.doneToday") : t("checkin.button", { points: groupDigits(nextPoints) })}
        </Button>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label={t("checkin.week")}>
        {week.map((d) => (
          <li key={d.day} className={cn("rounded-[10px] py-2 text-center text-xs font-semibold", d.done ? "bg-primary text-white" : "bg-surface-2 text-muted")}>
            {d.label}
            <span className="sr-only">{d.done ? ` ✓` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">{t("checkin.rule")}</p>
    </div>
  );
}

const SEG = 360 / WHEEL.length;

/** Wheel of fortune: the prize is drawn on the server, then the wheel spins to it. */
export function SpinWheel({ campaign, spun }: { campaign: string; spun: { prize: string; couponCode: string | null } | null }) {
  const t = useTranslations("rewards");
  const router = useRouter();
  const toast = useToast();
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState(spun);
  const [pending, start] = useTransition();
  const label = (key: string) => t(`prizes.${key}`);

  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Gift className="h-5 w-5 text-accent" /> {t("spin.title")}
      </h2>
      <p className="mt-1 text-sm text-muted">{t("spin.subtitle", { campaign })}</p>
      <div className="relative mx-auto mt-4 aspect-square w-full max-w-[280px]">
        <div className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-[#1A1A1F] dark:border-t-white" aria-hidden />
        <svg viewBox="-100 -100 200 200" className="h-full w-full motion-safe:transition-transform motion-safe:duration-[4000ms] motion-safe:ease-out" style={{ transform: `rotate(${angle}deg)` }} role="img" aria-label={t("spin.title")}>
          {WHEEL.map((p, i) => {
            const a0 = ((i * SEG - 90 - SEG / 2) * Math.PI) / 180;
            const a1 = (((i + 1) * SEG - 90 - SEG / 2) * Math.PI) / 180;
            const mid = ((i * SEG - 90) * Math.PI) / 180;
            return (
              <g key={p.key}>
                <path d={`M0,0 L${96 * Math.cos(a0)},${96 * Math.sin(a0)} A96,96 0 0,1 ${96 * Math.cos(a1)},${96 * Math.sin(a1)} Z`} fill={i % 2 ? "#F5B301" : "#C8102E"} stroke="var(--surface, #fff)" strokeWidth="2" />
                <text x={58 * Math.cos(mid)} y={58 * Math.sin(mid)} fill={i % 2 ? "#1A1A1F" : "#fff"} fontSize="9" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${i * SEG + (i * SEG > 90 && i * SEG < 270 ? 180 : 0)}, ${58 * Math.cos(mid)}, ${58 * Math.sin(mid)})`}>
                  {t(`prizesShort.${p.key}`)}
                </text>
              </g>
            );
          })}
          <circle r="14" fill="#1A1A1F" />
        </svg>
      </div>
      {result ? (
        <div className="mt-4 rounded-[12px] bg-surface-2 p-3 text-center" role="status">
          <p className="font-bold">{label(result.prize)}</p>
          {result.couponCode && (
            <p className="mt-1 text-sm">
              {t("spin.code")} <code className="rounded bg-surface px-2 py-0.5 font-bold">{result.couponCode}</code>
            </p>
          )}
          <p className="mt-1 text-xs text-muted">{t("spin.tomorrow")}</p>
        </div>
      ) : (
        <Button
          className="mt-4 w-full"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await spinAction({});
              if (!res.ok) return void toast.error(res.error ?? "");
              const d = res.data as { prize: string; couponCode: string | null };
              const idx = WHEEL.findIndex((p) => p.key === d.prize);
              // Land the prize's segment under the pointer after five full turns.
              setAngle(360 * 5 + (360 - idx * SEG));
              setTimeout(() => {
                setResult({ prize: d.prize, couponCode: d.couponCode });
                router.refresh();
              }, 4100);
            })
          }
        >
          {t("spin.button")}
        </Button>
      )}
    </div>
  );
}

export function ClaimMission({ id, points }: { id: string; points: number }) {
  const t = useTranslations("rewards");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await claimMissionAction({ id });
          if (!res.ok) return void toast.error(res.error ?? "");
          toast.success(t("missions.claimed", { points: groupDigits(points) }));
          router.refresh();
        })
      }
    >
      {t("missions.claim", { points: groupDigits(points) })}
    </Button>
  );
}
