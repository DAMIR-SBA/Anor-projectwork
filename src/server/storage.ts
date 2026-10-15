import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "@/server/security/crypto";
import { env } from "@/server/env";
import { log } from "@/server/log";

export type StoredFile = { url: string; key: string };

export const UPLOAD_KINDS = {
  image: { types: ["image/jpeg", "image/png", "image/webp", "image/gif"], maxMb: 10 },
  video: { types: ["video/mp4", "video/webm", "video/quicktime"], maxMb: 50 },
  audio: { types: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"], maxMb: 10 },
  document: { types: ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain", "application/zip"], maxMb: 20 },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "application/pdf": "pdf", "text/csv": "csv", "text/plain": "txt",
  "application/zip": "zip", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** Check the leading bytes agree with the declared type (blocks HTML/SVG disguised as images). */
export function sniffMatches(buf: Buffer, mime: string): boolean {
  const hex = buf.subarray(0, 12).toString("hex");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "application/pdf") return buf.subarray(0, 4).toString() === "%PDF";
  // Other types: reject anything that looks like markup.
  const head = buf.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return !(head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<svg") || head.startsWith("<script"));
}

export function validateUpload(kind: UploadKind, file: { type: string; size: number }): string | null {
  const rule = UPLOAD_KINDS[kind];
  const cap = Math.min(rule.maxMb, kind === "image" ? env().STORAGE_MAX_UPLOAD_MB : rule.maxMb);
  if (!(rule.types as readonly string[]).includes(file.type)) return "fileType";
  if (file.size > cap * 1024 * 1024) return "fileSize";
  return null;
}

/** Store bytes under `folder/` with a random name. local → ./storage (served by /uploads), supabase → public bucket. */
export async function putFile(folder: string, buf: Buffer, mime: string): Promise<StoredFile> {
  const e = env();
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${EXT[mime] ?? "bin"}`;
  if (e.STORAGE_DRIVER === "supabase" && e.STORAGE_SUPABASE_URL && e.STORAGE_SUPABASE_SERVICE_KEY) {
    const res = await fetch(`${e.STORAGE_SUPABASE_URL}/storage/v1/object/${e.STORAGE_SUPABASE_BUCKET}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.STORAGE_SUPABASE_SERVICE_KEY}`, "Content-Type": mime, "x-upsert": "false", "Cache-Control": "31536000" },
      body: new Uint8Array(buf),
    });
    if (!res.ok) throw new Error(`supabase upload ${res.status}: ${await res.text()}`);
    return { key, url: `${e.STORAGE_SUPABASE_URL}/storage/v1/object/public/${e.STORAGE_SUPABASE_BUCKET}/${key}` };
  }
  const full = path.resolve(e.STORAGE_LOCAL_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { key, url: `/uploads/${key}` };
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) return null; // path traversal guard
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

/** Optional antivirus hook: POST the file to VIRUS_SCAN_WEBHOOK_URL, expect {"clean": boolean}. */
export async function scanFile(buf: Buffer, mime: string): Promise<"CLEAN" | "INFECTED" | "SKIPPED"> {
  const url = env().VIRUS_SCAN_WEBHOOK_URL;
  if (!url) return "SKIPPED";
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": mime }, body: new Uint8Array(buf), signal: AbortSignal.timeout(15_000) });
    const data = (await res.json()) as { clean?: boolean };
    return data.clean === false ? "INFECTED" : "CLEAN";
  } catch (err) {
    log.warn("virus scan unavailable", { err });
    return "SKIPPED";
  }
}
