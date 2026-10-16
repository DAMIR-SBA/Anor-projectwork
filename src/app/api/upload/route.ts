import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getStaffSession } from "@/server/auth/session";
import { isSameOrigin } from "@/server/security/request";
import { rateLimit, LIMITS } from "@/server/security/rate-limit";
import { putFile, scanFile, sniffMatches, validateUpload, type UploadKind } from "@/server/storage";

const FOLDERS = ["reviews", "chat", "returns", "products", "shops", "documents", "avatars", "tradein", "evidence", "banners"] as const;

/** POST multipart (file, kind, folder) → { url, name, size, type, scan }. Auth + CSRF + rate limit + type/size/magic checks. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) return NextResponse.json({ error: "csrf" }, { status: 403 });
  const user = (await getCurrentUser()) ?? (await getStaffSession())?.user ?? null;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.window);
  if (!rl.success) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image") as UploadKind;
  const folder = String(form.get("folder") ?? "misc");
  if (!(file instanceof File)) return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  if (!["image", "video", "audio", "document"].includes(kind) || !(FOLDERS as readonly string[]).includes(folder)) return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const type = file.type.split(";")[0];
  const bad = validateUpload(kind, { type, size: file.size });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffMatches(buf, type)) return NextResponse.json({ error: "fileType" }, { status: 400 });
  const scan = await scanFile(buf, type);
  if (scan === "INFECTED") return NextResponse.json({ error: "infected" }, { status: 400 });
  const stored = await putFile(folder, buf, type);
  return NextResponse.json({ url: stored.url, name: file.name.slice(0, 120), size: file.size, type, scan });
}
