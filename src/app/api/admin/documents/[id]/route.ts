import { db } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { getStaffSession } from "@/server/auth/session";
import { readLocalFile } from "@/server/storage";

const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Staff-only, audited access to a shop's KYC document. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession();
  if (!staff || !(staff.permissions.has("shops.view") || staff.permissions.has("shops.moderate"))) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const doc = await db.shopDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const e = env();
  let buf: Buffer | null = null;
  if (doc.fileUrl.startsWith("/uploads/")) buf = await readLocalFile(doc.fileUrl.slice("/uploads/".length));
  else if (e.STORAGE_SUPABASE_URL && e.STORAGE_SUPABASE_SERVICE_KEY) {
    const key = doc.fileUrl.split(`/${e.STORAGE_SUPABASE_BUCKET}/`)[1];
    const res = key ? await fetch(`${e.STORAGE_SUPABASE_URL}/storage/v1/object/${e.STORAGE_SUPABASE_BUCKET}/${key}`, { headers: { Authorization: `Bearer ${e.STORAGE_SUPABASE_SERVICE_KEY}` } }) : null;
    if (res?.ok) buf = Buffer.from(await res.arrayBuffer());
  }
  if (!buf) return new Response("Not found", { status: 404 });
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, actorKind: "staff", action: "shop.document_viewed", entityType: "Shop", entityId: doc.shopId, meta: { documentId: doc.id, type: doc.type } });
  const ext = doc.fileUrl.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Disposition": TYPES[ext] ? "inline" : `attachment; filename="${doc.fileName.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}
