import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { mergePlatform, type PlatformSettings } from "@/lib/platform";

/** Platform settings (cached one minute; /admin/settings invalidates tag "settings"). */
export const platformSettings = unstable_cache(
  async (): Promise<PlatformSettings> => mergePlatform((await db.setting.findUnique({ where: { key: "platform" } }))?.value),
  ["platform-settings"],
  { revalidate: 60, tags: ["settings"] },
);

/** Read straight from the database: checkout must honour a pause the moment it is saved. */
export async function assertOrdersOpen() {
  const s = mergePlatform((await db.setting.findUnique({ where: { key: "platform" } }))?.value);
  if (s.ordersPaused.enabled) throw new AppError("ordersPaused");
}

export async function assertSellerSignupOpen() {
  const s = mergePlatform((await db.setting.findUnique({ where: { key: "platform" } }))?.value);
  if (!s.sellerSignupOpen) throw new AppError("sellerSignupClosed");
}
