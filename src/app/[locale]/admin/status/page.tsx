import { getTranslations, setRequestLocale } from "next-intl/server";
import { CircleCheck, CircleX, Play, RefreshCw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { RESET_PHRASE, systemStatus } from "@/server/services/admin/system";
import { runJobAction } from "@/server/actions/admin-platform";
import { Badge, Card, KeyValue, PageHeader, Table } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { DemoReset } from "@/components/admin/platform-tools";
import { buttonClasses } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";

/** Pages that can take a while (demo reset re-seeds the database). */
export const maxDuration = 300;

const tone = (s: string | undefined) => (s === "OK" ? "success" : s === "FAILED" || s === "STUCK" ? "danger" : s === "RUNNING" ? "info" : "neutral");
const jobKey = (name: string) => name.replace(/[.-]/g, "_");

function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export default async function AdminStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("system.status");
  const t = await getTranslations("adminStatus");
  const s = await systemStatus();
  const at = (d: Date) => fmtDateTime(d.toISOString(), locale);
  const jobLabel = (name: string) => (t.has(`jobs.${jobKey(name)}`) ? t(`jobs.${jobKey(name)}`) : name);
  const failing = s.jobs.filter((j) => j.last?.status === "FAILED" || j.last?.status === "STUCK").length;
  const healthy = failing === 0 && s.errors24 === 0;
  const up = s.runtime.uptimeSec;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Link href="/admin/status" className={buttonClasses("secondary", "md")}>
            <RefreshCw className="h-4 w-4" /> {t("refresh")}
          </Link>
        }
      />

      <div className={`flex items-center gap-3 rounded-[14px] p-4 font-semibold ${healthy ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`} role="status">
        {healthy ? <CircleCheck className="h-5 w-5" /> : <CircleX className="h-5 w-5" />}
        {healthy ? t("allGood") : t("attention", { jobs: failing, errors: s.errors24 })}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("database")}</h2>
          <KeyValue
            items={[
              [t("latency"), `${s.db.latencyMs} ms`],
              [t("version"), s.db.version],
              [t("size"), `${(s.db.sizeBytes / 1048576).toFixed(1)} MB`],
              [t("connections"), s.db.connections],
              [t("migrations"), s.db.migrations],
            ]}
          />
          {s.db.lastMigration && <p className="mt-2 break-all text-xs text-muted">{s.db.lastMigration}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("runtime")}</h2>
          <KeyValue
            items={[
              ["Node.js", s.runtime.node],
              [t("environment"), s.runtime.env],
              [t("demoMode"), s.runtime.demo ? t("yes") : t("no")],
              [t("uptime"), t("uptimeValue", { h: Math.floor(up / 3600), m: Math.floor((up % 3600) / 60) })],
              [t("memory"), `${s.runtime.rssMb} MB (heap ${s.runtime.heapMb} MB)`],
            ]}
          />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("drivers")}</h2>
          <KeyValue items={s.drivers.map((d) => [t(`driver.${d.key}`), <code key={d.key} className="text-[13px]">{d.value}</code>])} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("integrations")}</h2>
          <ul className="space-y-1.5 text-sm">
            {s.integrations.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-2">
                <span>{t(`integration.${i.key}`)}</span>
                <Badge tone={i.on ? "success" : "neutral"}>{i.on ? t("configured") : t("notConfigured")}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t("noSecrets")}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">{t("jobsTitle")}</h2>
          <p className="text-[13px] text-muted">{s.queue ? t("queue", { list: Object.entries(s.queue).map(([k, v]) => `${k}: ${v}`).join(", ") || "—" }) : t("inline")}</p>
        </div>
        <Table head={[t("job"), t("schedule"), t("lastRun"), t("duration"), t("failed24"), ""]}>
          {s.jobs.map((j) => (
            <tr key={j.name}>
              <td>
                <p className="font-semibold">{jobLabel(j.name)}</p>
                <code className="text-xs text-muted">{j.name}</code>
              </td>
              <td>{j.cron ? <code className="text-[13px]">{j.cron}</code> : <span className="text-muted">{t("onDemand")}</span>}</td>
              <td>
                {j.last ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={tone(j.last.status)}>{t(`runStatus.${j.last.status}`)}</Badge>
                    <span className="text-[13px] text-muted">{at(j.last.startedAt)}</span>
                  </span>
                ) : (
                  <span className="text-muted">{t("never")}</span>
                )}
                {j.last?.error && <p className="mt-1 max-w-md truncate text-xs text-danger" title={j.last.error}>{j.last.error}</p>}
              </td>
              <td className="tabular">{duration(j.last?.durationMs)}</td>
              <td className={`tabular ${j.failed24 ? "font-bold text-danger" : ""}`}>{j.failed24}</td>
              <td className="text-right">{j.cron && <ActionButton action={runJobAction} input={{ name: j.name }} icon={<Play className="h-4 w-4" />} label={t("runNow")} success={t("ran")} />}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="min-w-0 p-5">
          <h2 className="mb-3 font-bold">{t("recentRuns")}</h2>
          <Table head={[t("job"), t("status"), t("started"), t("duration")]}>
            {s.recentRuns.map((r) => (
              <tr key={r.id}>
                <td>
                  <code className="text-[13px]">{r.name}</code>
                  {r.error && <p className="max-w-xs truncate text-xs text-danger" title={r.error}>{r.error}</p>}
                </td>
                <td>
                  <Badge tone={tone(r.status)}>{t(`runStatus.${r.status === "RUNNING" || r.status === "OK" || r.status === "FAILED" ? r.status : "OK"}`)}</Badge>
                </td>
                <td className="text-[13px]">{at(r.startedAt)}</td>
                <td className="tabular">{duration(r.durationMs)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="min-w-0 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">{t("errors")}</h2>
            <span className="text-[13px] text-muted">{t("errors24", { n: s.errors24 })}</span>
          </div>
          <ul className="divide-y divide-border">
            {s.errors.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.level === "error" ? "danger" : "accent"}>{e.level}</Badge>
                  <span className="text-[13px] text-muted">{at(e.createdAt)}</span>
                </div>
                <p className="mt-1 break-words font-medium">{e.message}</p>
                {e.context && Object.keys(e.context as object).length > 0 && <p className="mt-0.5 truncate text-xs text-muted">{JSON.stringify(e.context).slice(0, 200)}</p>}
              </li>
            ))}
            {!s.errors.length && <li className="py-6 text-center text-sm text-muted">{t("noErrors")}</li>}
          </ul>
          <p className="mt-3 text-[13px] text-muted">{t("webhooks", { ok: s.webhooks.DELIVERED ?? 0, failed: s.webhooks.FAILED ?? 0, pending: s.webhooks.PENDING ?? 0 })}</p>
        </Card>
      </div>

      {s.runtime.demo && staff.permissions.has("system.demo_reset") && (
        <Card className="border-danger/40 p-5">
          <h2 className="mb-1 font-bold text-danger">{t("reset.title")}</h2>
          <p className="mb-3 text-sm text-muted">{t("reset.hint")}</p>
          <DemoReset phrase={RESET_PHRASE} />
        </Card>
      )}
    </div>
  );
}
