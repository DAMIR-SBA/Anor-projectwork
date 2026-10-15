import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

export type RateLimitResult = { success: boolean; remaining: number; resetAt: number };

// Fixed-window counters. Upstash REST when configured (shared across instances),
// otherwise a per-process Map (fine for a single server / dev).
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { success: true, remaining: limit - 1, resetAt: now + windowSec * 1000 };
  }
  entry.count++;
  return { success: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

async function upstashHit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${window}`;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowSec + 1)],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result: number }>;
  const count = Number(data[0]?.result ?? 0);
  return { success: count <= limit, remaining: Math.max(0, limit - count), resetAt: (window + 1) * windowSec * 1000 };
}

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const e = env();
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashHit(key, limit, windowSec);
    } catch (err) {
      log.warn("rate-limit: upstash unavailable, using memory", { err });
    }
  }
  return memoryHit(key, limit, windowSec);
}

/** Reset counters (e.g. after a successful login). Memory only; Upstash windows expire on their own. */
export function resetRateLimit(key: string) {
  memory.delete(key);
}

export const LIMITS = {
  loginIp: { limit: 30, window: 600 },
  loginAccount: { limit: 10, window: 900 },
  register: { limit: 10, window: 3600 },
  otpSend: { limit: 5, window: 3600 },
  staffLoginIp: { limit: 10, window: 900 },
  mutation: { limit: 120, window: 60 },
  chatSend: { limit: 40, window: 60 },
  upload: { limit: 30, window: 300 },
  review: { limit: 10, window: 3600 },
  assistant: { limit: 30, window: 300 },
  sellerApi: { limit: 600, window: 60 },
} as const;
