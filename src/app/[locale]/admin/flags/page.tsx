import { getTranslations, setRequestLocale } from "next-intl/server";
import { RotateCcw, Trash2 } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { adminFlags } from "@/server/services/admin/platform";
import { deleteFlagAction, resetFlagStatsAction } from "@/server/actions/admin-platform";
import { Badge, PageHeader, Table } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { FlagEditor } from "@/components/admin/platform-tools";
import { KNOWN_FLAGS } from "@/lib/flags";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminFlagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("flags.manage");
  const t = await getTranslations("adminFlags");
  const flags = await adminFlags();
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<FlagEditor known={KNOWN_FLAGS} />} />
      <ul className="space-y-4">
        {flags.map((f) => {
          const total = f.variants.reduce((s, v) => s + v.weight, 0);
          return (
            <li key={f.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-bold">{f.key}</code>
                <Badge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? t("on") : t("off")}</Badge>
                {f.enabled && f.rolloutPercent < 100 && <Badge tone="info">{t("rolloutShort", { pct: f.rolloutPercent })}</Badge>}
                {f.variants.length > 1 && <Badge tone="accent">{t("abTest")}</Badge>}
                {!f.known && <Badge tone="neutral">{t("unused")}</Badge>}
                <span className="ml-auto flex flex-wrap gap-1">
                  <FlagEditor known={KNOWN_FLAGS} flag={{ id: f.id, key: f.key, description: f.description, enabled: f.enabled, rolloutPercent: f.rolloutPercent, variants: f.variants }} />
                  {f.stats.length > 0 && <ActionButton action={resetFlagStatsAction} input={{ id: f.id }} variant="ghost" icon={<RotateCcw className="h-4 w-4" />} label={t("resetStats")} confirm={t("resetStatsConfirm")} />}
                  <ActionButton action={deleteFlagAction} input={{ id: f.id }} variant="ghost" icon={<Trash2 className="h-4 w-4" />} label={t("delete")} confirm={t("deleteConfirm", { key: f.key })} />
                </span>
              </div>
              {f.description && <p className="mt-1.5 text-sm text-muted">{f.description}</p>}
              <p className="mt-1 text-[13px] text-muted">{t("updated", { at: fmtDateTime(f.updatedAt.toISOString(), locale) })}</p>

              {f.variants.length > 1 && (
                <div className="mt-3">
                  <h3 className="mb-1 text-sm font-semibold">{f.since ? t("resultsSince", { at: fmtDateTime(f.since.toISOString(), locale) }) : t("results")}</h3>
                  <Table head={[t("variant"), t("split"), t("visitors"), t("converters"), t("rate"), t("vsControl"), t("revenuePerVisitor")]}>
                    {f.stats.map((s, i) => {
                      const weight = f.variants.find((v) => v.key === s.variant)?.weight;
                      return (
                        <tr key={s.variant}>
                          <td>
                            <span className="font-semibold">{s.variant}</span> {i === 0 && <Badge tone="neutral">{t("control")}</Badge>}
                          </td>
                          <td className="tabular">{weight ? `${Math.round((weight / total) * 100)}%` : t("removed")}</td>
                          <td className="tabular">{s.visitors.toLocaleString("ru-RU")}</td>
                          <td className="tabular">{s.converters.toLocaleString("ru-RU")}</td>
                          <td className="tabular font-semibold">{pct(s.rate)}</td>
                          <td>
                            {i === 0 ? (
                              "—"
                            ) : s.vsControl ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className={`tabular font-semibold ${s.vsControl.lift >= 0 ? "text-success" : "text-danger"}`}>
                                  {s.vsControl.lift >= 0 ? "▲" : "▼"} {Math.abs(s.vsControl.lift * 100).toFixed(1)}%
                                </span>
                                <Badge tone={s.vsControl.significant ? "success" : "neutral"}>{s.vsControl.significant ? t("significant") : t("notYet")}</Badge>
                              </span>
                            ) : (
                              <span className="text-muted">{t("needData")}</span>
                            )}
                          </td>
                          <td className="tabular">{formatUZS(s.visitors ? Math.round(s.revenue / s.visitors) : 0, locale)}</td>
                        </tr>
                      );
                    })}
                  </Table>
                  <p className="mt-2 text-[13px] text-muted">{t("method")}</p>
                </div>
              )}
            </li>
          );
        })}
        {!flags.length && <li className="card p-8 text-center text-muted">{t("empty")}</li>}
      </ul>
    </div>
  );
}
