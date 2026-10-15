import { requireUser } from "@/server/auth/guards";
import { AccountNav } from "@/components/account/account-nav";

export const metadata = { robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/account");
  return (
    <div className="container-page grid gap-6 py-6 md:grid-cols-[240px_minmax(0,1fr)] md:py-8">
      <aside className="md:sticky md:top-32 md:self-start">
        <AccountNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
