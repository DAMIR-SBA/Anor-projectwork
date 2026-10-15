import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  return ORDER[(process.env.LOG_LEVEL as Level) || "info"] ?? 20;
}

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = { level, time: new Date().toISOString(), msg, ...ctx };
  const text = JSON.stringify(line, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v));
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

/** Structured JSON logger (one line per event, friendly to Vercel/Datadog/Loki). */
export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
