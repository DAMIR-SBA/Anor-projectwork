import { getTranslations, setRequestLocale } from "next-intl/server";
import { Award, Lock, Medal, Target } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { rewardsOverview } from "@/server/services/gamification";
import { Avatar, Badge, Card, PageHeader, ProgressBar } from "@/components/ui/display";
import { CheckInCard, ClaimMission, SpinWheel } from "@/components/account/rewards-views";
import { loc } from "@/lib/localized";
import { groupDigits } from "@/lib/money";
import { tashkentDayKey } from "@/lib/dates";
import { cn } from "@/lib/cn";

/** Last seven Tashkent days ending today, with short weekday labels. */
function lastWeek(locale: string, done: string[]) {
  const today = tashkentDayKey();
  const fmt = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : locale === "uz-Cyrl" ? "uz-Cyrl" : "uz-Latn", { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    const day = d.toISOString().slice(0, 10);
    return { day, label: fmt.format(d).slice(0, 3), done: done.includes(day) };
  });
}

export default async function RewardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/rewards");
  const t = await getTranslations("rewards");
  const o = await rewardsOverview(user.id);
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle", { points: groupDigits(o.bonusBalance) })} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CheckInCard today={o.checkIn.today} streak={o.checkIn.streak} nextPoints={o.checkIn.nextPoints} week={lastWeek(locale, o.checkIn.days)} />
        {o.spin ? (
          <SpinWheel campaign={loc(o.spin.campaign, "name", locale)} spun={o.spin.result ? { prize: o.spin.result.prize, couponCode: o.spin.result.couponCode } : null} />
        ) : (
          <Card className="p-5">
            <h2 className="text-lg font-bold">{t("spin.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("spin.closed")}</p>
          </Card>
        )}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Target className="h-5 w-5 text-primary" /> {t("missions.title")}
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {o.missions.map((m) => (
            <li key={m.id} className="rounded-[14px] border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{loc(m, "title", locale)}</p>
                  <p className="text-sm text-muted">{loc(m, "desc", locale)}</p>
                </div>
                <Badge tone="neutral">{t(`missions.period.${m.period}`)}</Badge>
              </div>
              <ProgressBar className="mt-3" value={Math.min(m.progress, m.target)} max={m.target} label={loc(m, "title", locale)} tone={m.completedAt ? "success" : "primary"} />
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="tabular text-muted">
                  {Math.min(m.progress, m.target)} / {m.target}
                </span>
                {m.claimedAt ? <Badge tone="success">{t("missions.done")}</Badge> : m.completedAt && m.userMissionId ? <ClaimMission id={m.userMissionId} points={m.rewardPoints} /> : <span className="font-semibold text-primary">+{groupDigits(m.rewardPoints)}</span>}
              </div>
            </li>
          ))}
          {!o.missions.length && <li className="text-sm text-muted">{t("missions.none")}</li>}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Award className="h-5 w-5 text-accent" /> {t("achievements.title")}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {o.achievements.map((a) => (
              <li key={a.id} className={cn("flex gap-3 rounded-[14px] p-3", a.earnedAt ? "bg-accent-50 dark:bg-accent/10" : "bg-surface-2")}>
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl", a.earnedAt ? "bg-accent" : "bg-surface-3 grayscale")} aria-hidden>
                  {a.earnedAt ? a.icon : <Lock className="h-4 w-4 text-muted" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{loc(a, "name", locale)}</p>
                  <p className="text-xs text-muted">{loc(a, "desc", locale)}</p>
                  {!a.earnedAt && <ProgressBar className="mt-2 h-1.5" value={Math.round(a.progress * 100)} label={loc(a, "name", locale)} />}
                  <p className="mt-1 text-xs font-semibold">{a.earnedAt ? t("achievements.earned") : `+${groupDigits(a.points)}`}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Medal className="h-5 w-5 text-primary" /> {t("leaderboard.title")}
          </h2>
          <p className="mb-3 text-sm text-muted">{o.myRank ? t("leaderboard.you", { rank: o.myRank }) : t("leaderboard.join")}</p>
          <ol className="space-y-2">
            {o.leaderboard.map((r) => (
              <li key={r.rank} className={cn("flex items-center gap-3 rounded-[12px] px-2 py-1.5", r.me && "bg-primary-50 dark:bg-primary/15")}>
                <span className={cn("w-6 text-center font-extrabold tabular", r.rank <= 3 ? "text-accent" : "text-muted")}>{r.rank}</span>
                <Avatar name={r.name} src={r.avatarUrl} size={32} />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <span className="tabular text-sm">{t("leaderboard.reviews", { n: r.reviews })}</span>
              </li>
            ))}
            {!o.leaderboard.length && <li className="text-sm text-muted">{t("leaderboard.empty")}</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}
