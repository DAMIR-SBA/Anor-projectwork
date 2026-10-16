import { NextResponse, type NextRequest } from "next/server";
import { recent, subscribe } from "@/server/realtime/bus";
import { db } from "@/server/db";
import { liveChannel, viewerDelta } from "@/server/services/live";

export const dynamic = "force-dynamic";

const PING_MS = 25_000;

/**
 * GET /api/live/:id/events — public event stream of one live broadcast (chat, prices, the
 * product on screen, likes, viewers). `?since=<ms>` returns recent events as JSON instead,
 * for clients that cannot keep a stream open.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const stream = await db.liveStream.findUnique({ where: { id }, select: { status: true } });
  if (!stream) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const channel = liveChannel(id);
  const since = req.nextUrl.searchParams.get("since");
  if (since !== null) return NextResponse.json({ events: recent([channel], Number(since) || 0), now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  if (stream.status === "ENDED") return NextResponse.json({ error: "ended" }, { status: 410 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      const unsub = subscribe([channel], (_ch, e) => write(`event: ${e.type}\ndata: ${JSON.stringify({ ...((e.data as object) ?? {}), at: e.at })}\n\n`));
      const ping = setInterval(() => write(`: ping\n\n`), PING_MS);
      void viewerDelta(id, 1);
      cleanup = () => {
        unsub();
        clearInterval(ping);
        void viewerDelta(id, -1);
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
