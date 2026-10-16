import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Clock, PackageX, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { logisticsOverview } from "@/server/services/admin/operations";
import { advanceSupplyAction, rejectSupplyAction } from "@/server/actions/admin-operations";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { SUPPLY_TONE } from "@/components/admin/tones";
import { CourierAssign, PickupPointEditor, SupplyReceive, WarehouseEditor } from "@/components/admin/logistics-tools";
import { REGIONS } from "@/lib/delivery";
import { fmtDateTime, fmtDay } from "@/lib/format-date";

const TABS = ["monitor", "supplies", "couriers", "points", "warehouses"] as const;

export default async function AdminLogisticsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("logistics.manage");
  const t = await getTranslations("adminLogistics");
  const ts = await getTranslations("sellerStock.supplyStatus");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "monitor";
  const d = await logisticsOverview();
  const region = (k: string) => REGIONS.find((r) => r.key === k)?.[locale === "ru" ? "ru" : "uz"] ?? k;
  const couriers = d.couriers.map((c) => ({ id: c.id, name: c.name ?? c.login, load: c._count.shipmentsAssigned }));
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs
        active={tab}
        tabs={TABS.map((k) => ({ key: k, href: `/admin/logistics?tab=${k}`, label: t(`tabs.${k}`), count: k === "monitor" ? d.lateHandover.length + d.lateDelivery.length : k === "supplies" ? d.supplies.length : k === "couriers" ? d.unassigned.length : undefined }))}
      />

      {tab === "monitor" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                [t("lateHandover"), d.lateHandover.length, Timer, "danger"],
                [t("lateDelivery"), d.lateDelivery.length, AlertTriangle, "danger"],
                [t("unconfirmed"), d.unconfirmed, Clock, "accent"],
                [t("expiringPickups"), d.expiringPickups, PackageX, "accent"],
              ] as const
            ).map(([label, n, Icon, tone]) => (
              <Card key={label} className="p-4">
                <p className="flex items-center justify-between text-[13px] text-muted">
                  {label} <Icon className={n ? (tone === "danger" ? "h-4 w-4 text-danger" : "h-4 w-4 text-accent") : "h-4 w-4"} />
                </p>
                <p className="tabular mt-1 text-2xl font-extrabold">{n}</p>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("lateHandover")}</h2>
              <ul className="divide-y divide-border text-sm">
                {d.lateHandover.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/admin/orders/${s.order.id}`} className="font-semibold underline">
                      №{s.order.number}
                    </Link>
                    <Link href={`/admin/moderation/shops/${s.order.shop.id}`} className="text-muted hover:underline">
                      {s.order.shop.name}
                    </Link>
                    <span className="ml-auto text-[13px] text-danger">{t("deadline", { date: fmtDateTime(s.handoverDeadline!.toISOString(), locale) })}</span>
                  </li>
                ))}
                {!d.lateHandover.length && <li className="py-2 text-muted">{t("none")}</li>}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("lateDelivery")}</h2>
              <ul className="divide-y divide-border text-sm">
                {d.lateDelivery.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold underline">
                      №{o.number}
                    </Link>
                    <span className="text-muted">
                      {region(o.region)} · {o.deliveryMethod}
                    </span>
                    <span className="ml-auto text-[13px] text-danger">{t("eta", { date: fmtDay(o.estimatedDeliveryAt!.toISOString(), locale) })}</span>
                  </li>
                ))}
                {!d.lateDelivery.length && <li className="py-2 text-muted">{t("none")}</li>}
              </ul>
            </Card>
          </div>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("inTransitByRegion")}</h2>
            <ul className="space-y-1.5 text-sm">
              {d.byRegion.map((r) => {
                const max = d.byRegion[0]?.count || 1;
                return (
                  <li key={r.region} className="grid grid-cols-[160px_1fr_40px] items-center gap-2">
                    <span className="truncate">{region(r.region)}</span>
                    <span className="h-2.5 rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
                    </span>
                    <span className="tabular text-right font-semibold">{r.count}</span>
                  </li>
                );
              })}
              {!d.byRegion.length && <li className="text-muted">{t("none")}</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === "supplies" && (
        <ul className="space-y-3">
          {d.supplies.map((s) => (
            <li key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <b>{s.number}</b>
                <Badge tone={SUPPLY_TONE[s.status]}>{ts(s.status)}</Badge>
                <span className="text-sm text-muted">
                  {s.shop.name} → {s.warehouse.code}
                  {s.plannedAt && ` · ${fmtDay(s.plannedAt.toISOString(), locale)}`}
                </span>
                <span className="ml-auto text-sm">{t("units", { n: s.items.reduce((a, i) => a + i.quantity, 0) })}</span>
              </div>
              {s.note && <p className="mt-1 text-[13px] text-muted">{s.note}</p>}
              {s.status === "ACCEPTED" ? (
                <SupplyReceive supplyId={s.id} items={s.items.map((i) => ({ id: i.id, sku: i.variant.sku, title: i.variant.product.titleUz, quantity: i.quantity }))} />
              ) : (
                <ul className="mt-2 space-y-0.5 text-[13px]">
                  {s.items.map((i) => (
                    <li key={i.id}>
                      <span className="font-mono">{i.variant.sku}</span> {i.variant.product.titleUz} × {i.quantity}
                      {i.receivedQty !== null && <span className={i.receivedQty < i.quantity ? "text-danger" : "text-success"}> ✓ {i.receivedQty}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {s.status === "CREATED" && <ActionButton action={advanceSupplyAction} input={{ id: s.id }} label={t("accept")} variant="primary" />}
                {s.status === "RECEIVED" && <ActionButton action={advanceSupplyAction} input={{ id: s.id }} label={t("putInStock")} variant="success" />}
                {["CREATED", "ACCEPTED"].includes(s.status) && <ActionButton action={rejectSupplyAction} input={{ id: s.id }} label={t("rejectSupply")} variant="ghost" className="text-danger" reason={{ title: t("rejectSupplyTitle") }} />}
              </div>
            </li>
          ))}
          {!d.supplies.length && <li className="card p-8 text-center text-muted">{t("noSupplies")}</li>}
        </ul>
      )}

      {tab === "couriers" && (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("unassignedTitle")}</h2>
            <ul className="divide-y divide-border text-sm">
              {d.unassigned.map((s) => {
                const a = s.order.address as { city?: string; street?: string; house?: string } | null;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/orders/${s.order.id}`} className="font-semibold underline">
                        №{s.order.number}
                      </Link>{" "}
                      <span className="font-mono text-[12px] text-muted">{s.trackingNumber}</span>
                      <span className="block text-[13px] text-muted">
                        {region(s.order.region)} · {[a?.city, a?.street, a?.house].filter(Boolean).join(", ")}
                        {s.failedReason && <span className="text-danger"> · {s.failedReason}</span>}
                      </span>
                    </div>
                    <CourierAssign shipmentId={s.id} couriers={couriers} current={s.courierId} />
                  </li>
                );
              })}
              {!d.unassigned.length && <li className="py-2 text-muted">{t("none")}</li>}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("couriers")}</h2>
            <ul className="space-y-2 text-sm">
              {couriers.map((c, i) => (
                <li key={c.id} className="flex justify-between">
                  <span>
                    {c.name}
                    <span className="block text-[12px] text-muted">{d.couriers[i].lastSeenAt ? t("lastSeen", { date: fmtDateTime(d.couriers[i].lastSeenAt!.toISOString(), locale) }) : "—"}</span>
                  </span>
                  <Badge tone={c.load ? "info" : "neutral"}>{t("load", { n: c.load })}</Badge>
                </li>
              ))}
              {!couriers.length && <li className="text-muted">{t("noCouriers")}</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === "points" && (
        <div>
          <div className="mb-3">
            <PickupPointEditor />
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">{t("code")}</th>
                  <th className="px-3 py-2.5">{t("name")}</th>
                  <th className="px-3 py-2.5">{t("region")}</th>
                  <th className="px-3 py-2.5 text-right">{t("waiting")}</th>
                  <th className="px-3 py-2.5">{t("storageDays")}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.points.map((p) => (
                  <tr key={p.id} className={p.isActive ? "" : "opacity-55"}>
                    <td className="px-4 py-2 font-mono text-[13px]">{p.code}</td>
                    <td className="px-3 py-2">
                      {p.name}
                      <span className="block text-[12px] text-muted">{p.address}</span>
                    </td>
                    <td className="px-3 py-2">
                      {region(p.region)} · {p.district}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{p._count.orders}</td>
                    <td className="px-3 py-2">{p.storageDays}</td>
                    <td className="px-3 py-2 text-right">
                      <PickupPointEditor point={{ id: p.id, code: p.code, name: p.name, region: p.region, city: p.city, district: p.district, address: p.address, lat: p.lat, lng: p.lng, hours: p.hours as Record<string, string>, phone: p.phone, storageDays: p.storageDays, hasFitting: p.hasFitting, isActive: p.isActive }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "warehouses" && (
        <div>
          <div className="mb-3">
            <WarehouseEditor />
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {d.warehouses.map((w) => (
              <li key={w.id} className={w.isActive ? "card p-4" : "card p-4 opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {w.name} <span className="font-mono text-[12px] text-muted">{w.code}</span>
                    </p>
                    <p className="text-[13px] text-muted">
                      {region(w.region)}, {w.city}, {w.address}
                    </p>
                    <p className="mt-1 text-[13px]">{t("whStats", { skus: w._count.stocks, supplies: w._count.supplies })}</p>
                  </div>
                  <WarehouseEditor warehouse={{ id: w.id, code: w.code, name: w.name, region: w.region, city: w.city, address: w.address, isActive: w.isActive }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
