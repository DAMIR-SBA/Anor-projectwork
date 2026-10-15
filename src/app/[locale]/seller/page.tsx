import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircleQuestion, MessageSquareQuote, Star, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { sellerQuestions, sellerReviews } from "@/server/services/review-queries";
import { PageHeader, StatCard } from "@/components/ui/display";

export default async function SellerHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, shops } = await requireSeller();
  const t = await getTranslations("seller");
  const [rv, qs] = await Promise.all([sellerReviews(user.id, "unanswered", 1, locale, 1), sellerQuestions(user.id, "unanswered", 1, 1)]);
  const rt = rv.stats.responseTimeMins;
  return (
    <div>
      <PageHeader title={shops[0]?.name ?? t("title")} description={t("soon")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("reviews.avg")} value={rv.stats.avg ? rv.stats.avg.toFixed(2) : "—"} hint={`${rv.stats.count}`} icon={<Star className="h-5 w-5" />} />
        <Link href="/seller/reviews">
          <StatCard label={t("reviews.tabs.unanswered")} value={rv.counts.unanswered} icon={<MessageSquareQuote className="h-5 w-5" />} />
        </Link>
        <Link href="/seller/questions">
          <StatCard label={t("questions.title")} value={qs.unanswered} icon={<MessageCircleQuestion className="h-5 w-5" />} />
        </Link>
        <StatCard label={t("reviews.responseTime")} value={rt == null ? "—" : rt < 120 ? t("reviews.minutes", { count: rt }) : t("reviews.hours", { count: Math.round(rt / 60) })} icon={<Timer className="h-5 w-5" />} />
      </div>
    </div>
  );
}
