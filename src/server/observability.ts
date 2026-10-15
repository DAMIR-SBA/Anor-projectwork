import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { log } from "@/server/log";

/** Parse a Sentry DSN: https://<key>@<host>/<projectId> */
function sentryTarget(dsn: string) {
  const u = new URL(dsn);
  const projectId = u.pathname.replace(/^\//, "");
  return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
}

/**
 * Report a server error: structured log + ErrorEvent row (status page) + Sentry envelope
 * when SENTRY_DSN is set. Lightweight on purpose — no SDK on the hot path.
 */
export async function reportError(err: unknown, context: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  log.error(e.message, { err: e, ...context });
  try {
    await db.errorEvent.create({ data: { level: "error", message: e.message.slice(0, 500), stack: e.stack?.slice(0, 4000), context: context as object } });
  } catch {
    /* DB may be the thing that failed */
  }
  const dsn = env().SENTRY_DSN;
  if (!dsn) return;
  try {
    const { url, key } = sentryTarget(dsn);
    const eventId = randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      environment: env().NODE_ENV,
      exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: (e.stack ?? "").split("\n").slice(1, 30).map((l) => ({ function: l.trim() })).reverse() } }] },
      tags: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)])),
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=anor/1.0` }, body });
  } catch {
    /* never throw from the reporter */
  }
}
