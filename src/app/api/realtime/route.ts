import { type NextRequest } from "next/server";
import { subscribe } from "@/server/realtime/bus";
import { db } from "@/server/db";
import { markDelivered } from "@/server/services/chat";
import { realtimeChannels } from "./channels";

export const dynamic = "force-dynamic";

const PING_MS = 25_000;

/** Server-Sent Events stream of the caller's realtime channels. `?as=staff` uses the staff session. */
export async function GET(req: NextRequest) {
  const who = await realtimeChannels(req.nextUrl.searchParams.get("as") === "staff");
  if (!who) return new Response("Unauthorized", { status: 401 });
  const enc = new TextEncoder();
  const touch = () => db.user.update({ where: { id: who.userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      const unsub = subscribe(who.channels, (_ch, e) => write(`event: ${e.type}\ndata: ${JSON.stringify({ ...((e.data as object) ?? {}), at: e.at })}\n\n`));
      const ping = setInterval(() => {
        write(`: ping\n\n`);
        void touch();
      }, PING_MS);
      cleanup = () => {
        unsub();
        clearInterval(ping);
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
  void touch();
  if (!who.staff) void markDelivered(who.userId);
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
