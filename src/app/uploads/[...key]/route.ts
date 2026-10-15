import { readLocalFile } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", pdf: "application/pdf", csv: "text/csv", txt: "text/plain" };

/** Serves files written by the local storage driver. Non-media types download as attachments. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const rel = key.join("/");
  const buf = await readLocalFile(rel);
  if (!buf) return new Response("Not found", { status: 404 });
  const ext = rel.split(".").pop() ?? "";
  const type = TYPES[ext] ?? "application/octet-stream";
  const inline = /^(image|video|audio)\//.test(type) || type === "application/pdf";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'",
      "Content-Disposition": inline ? "inline" : `attachment; filename="${rel.split("/").pop()}"`,
    },
  });
}
