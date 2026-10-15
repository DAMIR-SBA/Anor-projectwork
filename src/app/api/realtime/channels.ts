import "server-only";
import { getCurrentUser, getStaffSession } from "@/server/auth/session";

/** Which realtime channels the caller may listen to: their own user channel, the support desk, global broadcasts. */
export async function realtimeChannels(asStaff: boolean): Promise<{ userId: string; channels: string[]; staff: boolean } | null> {
  if (asStaff) {
    const staff = await getStaffSession();
    if (!staff) return null;
    return { userId: staff.user.id, staff: true, channels: [`user:${staff.user.id}`, ...(staff.permissions.has("support.handle") ? ["staff:support"] : []), "broadcast"] };
  }
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, staff: false, channels: [`user:${user.id}`, "broadcast"] };
}
