import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { Button } from "@/components/ui/button";
import { Badge, Card, StatCard, ProgressBar, Avatar } from "@/components/ui/display";
import { Input, Field, Checkbox, Switch, Select } from "@/components/ui/form";
import { formatUZS } from "@/lib/money";

export const metadata = { title: "Design system", robots: { index: false } };

const swatches = [
  ["Primary", "#C8102E"],
  ["Primary dark", "#8E0B22"],
  ["Accent gold", "#F5B301"],
  ["Surface", "#FFFFFF"],
  ["Surface 2", "#F6F6F8"],
  ["Text", "#1A1A1F"],
  ["Muted", "#6B6B76"],
  ["Success", "#1FA463"],
  ["Danger", "#E5484D"],
];

/** Living style guide for the ANOR design system (not linked from the storefront). */
export default async function DesignPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("brand");
  return (
    <main className="container-page space-y-8 py-10">
      <header className="flex flex-wrap items-center gap-6">
        <AnorLogo height={48} />
        <AnorLogo variant="symbol" height={48} />
        <div className="rounded-2xl bg-[#1A1A1F] p-4">
          <AnorLogo tone="white" height={40} />
        </div>
        <div className="rounded-2xl bg-primary p-4">
          <AnorLogo variant="symbol" tone="white" height={40} />
        </div>
        <p className="text-lg font-semibold text-muted">{t("tagline")}</p>
      </header>
      <section className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {swatches.map(([name, hex]) => (
          <div key={hex} className="card overflow-hidden">
            <div className="h-16" style={{ background: hex }} />
            <div className="p-2 text-xs">
              <div className="font-bold">{name}</div>
              <div className="text-muted">{hex}</div>
            </div>
          </div>
        ))}
      </section>
      <section className="flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Loading</Button>
        <Badge tone="primary">-25%</Badge>
        <Badge tone="accent">Hit</Badge>
        <Badge tone="success">Verified</Badge>
        <Badge tone="danger">Overdue</Badge>
        <Badge>Neutral</Badge>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Revenue" value={formatUZS(125_400_000, locale)} trend={12.4} hint="vs last week" />
        <StatCard label="Orders" value="1 284" trend={-3.1} />
        <Card className="space-y-3 p-4">
          <Field label="Login" htmlFor="d-login" hint="4-20 chars">
            <Input id="d-login" placeholder="anor_ali07" />
          </Field>
          <Select defaultValue="uz" aria-label="Locale">
            <option value="uz">O‘zbekcha</option>
            <option value="ru">Русский</option>
          </Select>
          <Checkbox label="Halal" />
          <Switch label="Dark mode" />
          <ProgressBar value={64} label="ProgressBar" />
          <div className="flex gap-2">
            <Avatar name="Aziza Karimova" online />
            <Avatar name="Bekzod T" />
          </div>
        </Card>
      </section>
      <p className="text-2xl font-extrabold">{formatUZS(1_250_000, locale)}</p>
    </main>
  );
}
