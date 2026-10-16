"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, CalendarClock, CreditCard, Gift, MapPin, Plus, Store, Truck, Wallet, Zap } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { placeOrderAction, quoteCheckoutAction } from "@/server/actions/checkout";
import { formatUZS, groupDigits } from "@/lib/money";
import { deliverySlots } from "@/lib/delivery";
import { buildSchedule, quote, type Plan } from "@/lib/installment";
import { fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";
import { PvzExplorer, type Pvz } from "./pvz-explorer";
import { AddressForm, type AddressData } from "./address-form";

type Totals = { listTotal: number; subtotal: number; productDiscount: number; promoDiscount: number; couponDiscount: number; deliveryFee: number; bonusApplied: number; total: number; cashback: number; itemsCount: number; freeDelivery: boolean };
type Group = { shopId: string; shopName: string; eta: string; fulfillment: string; count: number };
type Line = { variantId: string; title: string; variantTitle: string; image: string | null; quantity: number; unitPrice: number };

type Props = {
  cartId: string | null;
  lines: Line[];
  initial: { totals: Totals; groups: Group[]; expressAllowed: boolean; plans: Plan[] };
  addresses: AddressData[];
  pickupPoints: Pvz[];
  cards: Array<{ id: string; brand: string; last4: string; provider: string }>;
  walletBalance: number;
  bonusBalance: number;
  nasiyaAvailable: number;
  user: { name: string | null; phone: string | null };
};

const ONLINE = [
  { m: "CLICK", label: "Click" },
  { m: "PAYME", label: "Payme" },
  { m: "UZCARD", label: "Uzcard" },
  { m: "HUMO", label: "Humo" },
  { m: "CARD", label: "Visa / Mastercard" },
] as const;

export function CheckoutView(props: Props) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const fmt = (v: number) => formatUZS(v, locale);

  const [method, setMethod] = useState<"PICKUP" | "COURIER" | "EXPRESS">(props.addresses.length ? "COURIER" : "PICKUP");
  const [addressId, setAddressId] = useState(props.addresses.find((a) => a.isDefault)?.id ?? props.addresses[0]?.id ?? null);
  const [addresses, setAddresses] = useState(props.addresses);
  const [pvz, setPvz] = useState<Pvz | null>(null);
  const [pvzOpen, setPvzOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [gift, setGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [hidePrice, setHidePrice] = useState(true);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [payment, setPayment] = useState<string>("CLICK");
  const [cardId, setCardId] = useState<string | null>(null);
  const [months, setMonths] = useState<number | null>(props.initial.plans.at(-1)?.months ?? null);
  const [bonus, setBonus] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [accepted, setAccepted] = useState(false);
  /** Contract preview opened at this instant (schedule dates count from signing). */
  const [contractAt, setContractAt] = useState<Date | null>(null);
  const [data, setData] = useState(props.initial);
  const [quoting, startQuote] = useTransition();
  const [placing, startPlace] = useTransition();
  const seq = useRef(0);

  // New addresses arrive via router.refresh() → fresh server props.
  useEffect(() => setAddresses(props.addresses), [props.addresses]);

  useEffect(() => {
    const id = ++seq.current;
    const handle = setTimeout(() => {
      startQuote(async () => {
        const r = await quoteCheckoutAction({ cartId: props.cartId, deliveryMethod: method, addressId: method === "PICKUP" ? null : addressId, pickupPointId: method === "PICKUP" ? (pvz?.id ?? null) : null, bonus });
        if (id !== seq.current) return;
        if (r.ok) setData(r.data as Props["initial"]);
        else toast.error(r.error);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [method, addressId, pvz, bonus, props.cartId, toast]);

  const totals = data.totals;
  const walletUse = useWallet || payment === "WALLET" ? Math.min(props.walletBalance, totals.total) : 0;
  const toPay = totals.total - walletUse;
  const maxBonus = Math.min(props.bonusBalance, Math.floor((totals.subtotal - totals.promoDiscount - totals.couponDiscount) * 0.3));
  const earliest = useMemo(() => (data.groups.length ? new Date(Math.min(...data.groups.map((g) => new Date(g.eta).getTime()))) : new Date()), [data.groups]);
  const slots = useMemo(() => deliverySlots(new Date(Math.max(Date.now() + 2 * 3_600_000, earliest.getTime() - 10 * 3_600_000)), 3).slice(0, 12), [earliest]);
  const plan = data.plans.find((p) => p.months === months) ?? null;

  const place = () =>
    startPlace(async () => {
      const r = await placeOrderAction({
        cartId: props.cartId,
        deliveryMethod: method,
        addressId: method === "PICKUP" ? null : addressId,
        pickupPointId: method === "PICKUP" ? (pvz?.id ?? null) : null,
        slotStart: method === "COURIER" ? slot : null,
        isGift: gift,
        giftMessage: gift ? giftMessage : null,
        hidePrice: gift && hidePrice,
        recipientName: gift ? recipientName : null,
        recipientPhone: gift ? recipientPhone : null,
        paymentMethod: payment as "CLICK",
        savedCardId: cardId,
        installmentMonths: payment === "INSTALLMENT" ? months : null,
        bonus,
        useWallet: useWallet || payment === "WALLET",
        acceptContract: payment === "INSTALLMENT" && accepted,
      });
      if (!r.ok) return void toast.error(r.error);
      const d = r.data as { groupId: string; redirectUrl: string | null };
      router.push(d.redirectUrl ?? `/checkout/success/${d.groupId}`);
    });

  const methodCard = (m: "PICKUP" | "COURIER" | "EXPRESS", Icon: typeof Truck, title: string, text: string, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setMethod(m)}
      aria-pressed={method === m}
      className={cn("flex flex-1 flex-col items-start gap-1 rounded-[14px] border-2 p-3 text-left transition-colors disabled:opacity-40", method === m ? "border-primary bg-primary-50 dark:bg-primary/10" : "border-border bg-surface hover:border-muted")}
    >
      <Icon className={cn("h-5 w-5", method === m ? "text-primary" : "text-muted")} />
      <span className="font-bold">{title}</span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );

  const payOption = (value: string, title: React.ReactNode, sub?: React.ReactNode, extra?: { cardId?: string }) => {
    const selected = payment === value && (extra?.cardId ?? null) === cardId;
    return (
      <label key={`${value}-${extra?.cardId ?? ""}`} className={cn("flex cursor-pointer items-center gap-3 rounded-[14px] border-2 p-3", selected ? "border-primary bg-primary-50 dark:bg-primary/10" : "border-border")}>
        <input
          type="radio"
          name="payment"
          className="h-5 w-5 accent-[#C8102E]"
          checked={selected}
          onChange={() => {
            setPayment(value);
            setCardId(extra?.cardId ?? null);
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
      </label>
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <section className="card space-y-4 p-4 md:p-5">
          <h2 className="text-lg font-extrabold">{t("delivery")}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            {methodCard("PICKUP", Store, t("pickup"), t("pickupText"))}
            {methodCard("COURIER", Truck, t("courier"), t("courierText"))}
            {methodCard("EXPRESS", Zap, t("express"), data.expressAllowed ? t("expressText") : t("expressUnavailable"), !data.expressAllowed)}
          </div>
          {method === "PICKUP" ? (
            <div className="rounded-[14px] bg-surface-2 p-3">
              {pvz ? (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{pvz.name}</p>
                    <p className="text-sm text-muted">
                      {pvz.city}, {pvz.address}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPvzOpen(true)}>
                    {t("changePickup")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setPvzOpen(true)} leftIcon={<MapPin className="h-4 w-4" />}>
                  {t("choosePickup")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("address")}</p>
              {addresses.map((a) => (
                <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] border-2 p-3", addressId === a.id ? "border-primary" : "border-border")}>
                  <input type="radio" name="address" className="mt-1 h-4.5 w-4.5 accent-[#C8102E]" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span className="text-sm">
                    <b>{a.label || a.recipient}</b> · {a.phone}
                    <span className="block text-muted">
                      {a.city}, {a.street} {a.house}
                      {a.apartment ? `, ${a.apartment}` : ""}
                    </span>
                  </span>
                </label>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setAddrOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
                {t("addAddress")}
              </Button>
            </div>
          )}
          {method === "COURIER" && addressId && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t("slot")}</p>
              <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
                {slots.map((s) => (
                  <button key={s.start.toISOString()} type="button" onClick={() => setSlot(s.start.toISOString())} className={cn("shrink-0 rounded-[12px] border-2 px-3 py-2 text-left text-sm", slot === s.start.toISOString() ? "border-primary bg-primary-50 dark:bg-primary/10" : "border-border")}>
                    <span className="block text-xs text-muted">{fmtDay(s.start, locale)}</span>
                    <b className="tabular">{s.label}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {data.groups.map((g) => (
              <li key={g.shopId} className="flex justify-between gap-2">
                <span className="text-muted">{g.shopName}</span>
                <span className="font-semibold">{fmtDay(g.eta, locale)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-3 p-4 md:p-5">
          <label className="flex cursor-pointer items-center gap-3">
            <Gift className="h-5 w-5 text-primary" />
            <span className="flex-1">
              <b className="block">{t("gift")}</b>
              <span className="text-sm text-muted">{t("giftText")}</span>
            </span>
            <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} className="h-5 w-5 accent-[#C8102E]" />
          </label>
          {gift && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder={t("recipientName")} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} aria-label={t("recipientName")} />
              <Input placeholder={t("recipientPhone")} value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} aria-label={t("recipientPhone")} type="tel" />
              <Textarea className="sm:col-span-2" rows={2} maxLength={300} placeholder={t("giftMessage")} value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} aria-label={t("giftMessage")} />
              <Checkbox checked={hidePrice} onChange={(e) => setHidePrice(e.target.checked)} label={t("hidePrice")} />
            </div>
          )}
        </section>

        <section className="card space-y-3 p-4 md:p-5">
          <h2 className="text-lg font-extrabold">{t("payment")}</h2>
          {props.cards.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted">{t("savedCards")}</p>
              {props.cards.map((c) => payOption(c.provider, <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {c.brand} •••• {c.last4}</span>, undefined, { cardId: c.id }))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {ONLINE.map((o) => payOption(o.m, o.label))}
            {payOption("COD", <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> {t("cod")}</span>, t("codText"))}
            {payOption("WALLET", <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {t("wallet")}</span>, t("walletBalance", { amount: fmt(props.walletBalance) }))}
          </div>
          {data.plans.length > 0 && props.nasiyaAvailable > 0 ? (
            <div className={cn("rounded-[14px] border-2 p-3", payment === "INSTALLMENT" ? "border-accent bg-accent-50 dark:bg-accent/10" : "border-border")}>
              {payOption("INSTALLMENT", <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> {t("installment")}</span>, t("installmentLimit", { amount: fmt(props.nasiyaAvailable) }))}
              {payment === "INSTALLMENT" && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {data.plans.map((p) => {
                    const q = quote(toPay, p);
                    return (
                      <button key={p.months} type="button" onClick={() => setMonths(p.months)} className={cn("rounded-[10px] py-2 text-center text-xs", months === p.months ? "bg-[#1A1A1F] text-white" : "bg-surface")}>
                        <b className="block text-sm">{p.months}</b>
                        {groupDigits(q.monthly)}
                      </button>
                    );
                  })}
                </div>
              )}
              {payment === "INSTALLMENT" && plan && (
                <div className="mt-3 space-y-2 text-sm">
                  <button type="button" className="font-semibold text-primary underline" onClick={() => setContractAt(new Date())}>
                    {t("contractView")}
                  </button>
                  <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} label={t("contractAccept")} />
                </div>
              )}
            </div>
          ) : (
            <Link href="/nasiya" className="block rounded-[14px] border border-dashed border-border p-3 text-sm text-muted">
              <CalendarClock className="mr-1 inline h-4 w-4" /> {data.plans.length ? t("installmentApply") : t("installmentNotEligible")}
            </Link>
          )}
          {props.walletBalance > 0 && payment !== "WALLET" && <Checkbox checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} label={`${t("useWallet")} (${fmt(props.walletBalance)})`} />}
          {props.bonusBalance > 0 && (
            <div className="rounded-[14px] bg-surface-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <b>{t("bonusUse")}</b>
                <span className="text-muted">{t("bonusAvailable", { amount: groupDigits(props.bonusBalance) })}</span>
              </div>
              <input type="range" min={0} max={Math.max(0, maxBonus)} step={1000} value={Math.min(bonus, maxBonus)} onChange={(e) => setBonus(Number(e.target.value))} className="mt-2 w-full accent-[#C8102E]" aria-label={t("bonusUse")} />
              <p className="text-xs text-muted">
                {groupDigits(Math.min(bonus, maxBonus))} · {t("bonusMax")}
              </p>
            </div>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className={cn("card space-y-4 p-5 transition-opacity", quoting && "opacity-70")}>
          <h2 className="text-xl font-extrabold">{t("summary")}</h2>
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {props.lines.map((l) => (
              <li key={l.variantId} className="flex items-center gap-3 text-sm">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{l.image && <Image src={l.image} alt="" fill sizes="48px" className="object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1">{l.title}</span>
                  <span className="text-xs text-muted">
                    {l.variantTitle} × {l.quantity}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-border pt-3 text-[15px]">
            <Row label={`${t("items")} (${totals.itemsCount})`} value={fmt(totals.listTotal)} />
            {totals.productDiscount + totals.promoDiscount + totals.couponDiscount > 0 && <Row label={tc("sale")} value={`−${fmt(totals.productDiscount + totals.promoDiscount + totals.couponDiscount)}`} accent />}
            <Row label={t("deliveryFee")} value={totals.deliveryFee ? fmt(totals.deliveryFee) : t("free")} />
            {totals.bonusApplied > 0 && <Row label={t("bonusApplied")} value={`−${fmt(totals.bonusApplied)}`} accent />}
            {walletUse > 0 && <Row label={t("walletApplied")} value={`−${fmt(walletUse)}`} accent />}
          </dl>
          <div className="flex items-end justify-between border-t border-border pt-3">
            <span className="text-lg font-bold">{t("toPay")}</span>
            <span className="tabular text-2xl font-extrabold">{fmt(toPay)}</span>
          </div>
          {payment === "INSTALLMENT" && plan && <p className="text-right text-sm font-semibold text-[#7a5600] dark:text-accent">{t("installmentText", { months: plan.months, amount: fmt(quote(toPay, plan).monthly) })}</p>}
          {totals.cashback > 0 && <p className="text-sm text-success">{t("cashback", { amount: groupDigits(totals.cashback) })}</p>}
          <Button size="lg" className="w-full" loading={placing} disabled={quoting || (method === "PICKUP" ? !pvz : !addressId) || (payment === "INSTALLMENT" && !accepted)} onClick={place}>
            {["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"].includes(payment) && toPay > 0 ? t("placeOrderPay", { amount: fmt(toPay) }) : t("placeOrder")}
          </Button>
          <p className="text-center text-xs text-muted">{t("agree")}</p>
        </div>
      </aside>

      {contractAt && plan && (
        <Dialog
          open
          onClose={() => setContractAt(null)}
          title={t("contractTitle")}
          footer={
            <Button
              onClick={() => {
                setAccepted(true);
                setContractAt(null);
              }}
            >
              {t("contractAgree")}
            </Button>
          }
        >
          {(() => {
            const q = quote(toPay, plan);
            return (
              <div className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted">{t("contractPrincipal")}</dt>
                  <dd className="tabular text-right font-semibold">{fmt(q.principal)}</dd>
                  <dt className="text-muted">{t("contractMarkup", { pct: Math.round(plan.markupPercent * 100) })}</dt>
                  <dd className="tabular text-right font-semibold">{fmt(q.markup)}</dd>
                  <dt className="text-muted">{t("contractTotal")}</dt>
                  <dd className="tabular text-right font-bold">{fmt(q.total)}</dd>
                  <dt className="text-muted">{t("contractMonths")}</dt>
                  <dd className="tabular text-right font-semibold">{q.months}</dd>
                </dl>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 font-semibold">#</th>
                      <th className="py-1 font-semibold">{t("contractDue")}</th>
                      <th className="py-1 text-right font-semibold">{t("contractAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildSchedule(q, contractAt).map((r) => (
                      <tr key={r.index} className="border-t border-border">
                        <td className="py-1 tabular">{r.index}</td>
                        <td className="py-1">{fmtDay(r.dueDate.toISOString(), locale)}</td>
                        <td className="py-1 text-right tabular">{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  <li>{t("contractTerm1")}</li>
                  <li>{t("contractTerm2")}</li>
                  <li>{t("contractTerm3")}</li>
                </ul>
              </div>
            );
          })()}
        </Dialog>
      )}

      <Dialog open={pvzOpen} onClose={() => setPvzOpen(false)} title={t("choosePickup")} className="w-[min(960px,calc(100vw-24px))]">
        <PvzExplorer
          compact
          points={props.pickupPoints}
          selectedId={pvz?.id}
          onSelect={(p) => {
            setPvz(p);
            setPvzOpen(false);
          }}
        />
      </Dialog>
      <Dialog open={addrOpen} onClose={() => setAddrOpen(false)} title={t("addAddress")}>
        <AddressForm
          defaults={{ recipient: props.user.name, phone: props.user.phone }}
          onSaved={(id) => {
            setAddrOpen(false);
            setAddressId(id);
            router.refresh();
          }}
        />
      </Dialog>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", accent && "text-brand-ink")}>{value}</dd>
    </div>
  );
}
