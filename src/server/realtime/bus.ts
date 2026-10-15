import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { log } from "@/server/log";

export type RealtimeEvent = { type: string; data: unknown; at: number };

// Process-local fan-out + Postgres LISTEN/NOTIFY so events reach SSE clients connected
// to any instance. Channels: "user:<id>", "conv:<id>", "staff:support", "broadcast".
const globalBus = globalThis as unknown as { __anorBus?: EventEmitter; __anorPg?: Promise<Client | null>; __anorInstance?: string };
const bus = (globalBus.__anorBus ??= new EventEmitter());
bus.setMaxListeners(10_000);
const INSTANCE = (globalBus.__anorInstance ??= Math.random().toString(36).slice(2));
const PG_CHANNEL = "anor_realtime";

function listener(): Promise<Client | null> {
  if (globalBus.__anorPg) return globalBus.__anorPg;
  globalBus.__anorPg = (async () => {
    if (process.env.REALTIME_DRIVER === "poll") return null;
    try {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const { origin, channel, event } = JSON.parse(msg.payload) as { origin: string; channel: string; event: RealtimeEvent };
          if (origin !== INSTANCE) bus.emit(channel, event);
        } catch {
          /* ignore malformed */
        }
      });
      client.on("error", (err) => {
        log.warn("realtime listener error", { err });
        globalBus.__anorPg = undefined;
      });
      return client;
    } catch (err) {
      log.warn("realtime: LISTEN unavailable, single-instance mode", { err });
      return null;
    }
  })();
  return globalBus.__anorPg;
}

export async function publish(channel: string, type: string, data: unknown) {
  const event: RealtimeEvent = { type, data, at: Date.now() };
  bus.emit(channel, event);
  const client = await listener();
  if (!client) return;
  const payload = JSON.stringify({ origin: INSTANCE, channel, event });
  // NOTIFY payloads are limited to 8000 bytes; large events carry ids and clients refetch.
  if (payload.length < 7900) await client.query("SELECT pg_notify($1, $2)", [PG_CHANNEL, payload]).catch(() => {});
}

export function subscribe(channels: string[], handler: (channel: string, e: RealtimeEvent) => void): () => void {
  void listener();
  const fns = channels.map((ch) => {
    const fn = (e: RealtimeEvent) => handler(ch, e);
    bus.on(ch, fn);
    return [ch, fn] as const;
  });
  return () => fns.forEach(([ch, fn]) => bus.off(ch, fn));
}
