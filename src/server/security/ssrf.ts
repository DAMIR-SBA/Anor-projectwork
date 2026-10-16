import "server-only";
import https from "node:https";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { isPrivateIp, validateWebhookUrl } from "@/lib/seller";

/**
 * DNS lookup that refuses private/loopback/link-local targets. Runs at connect time, so a
 * hostname that re-resolves to an internal address after validation (DNS rebinding) still fails.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    const cb = callback as (e: NodeJS.ErrnoException | null, a: string | dns.LookupAddress[], f?: number) => void;
    if (err) return cb(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error("blocked_address"), { code: "EBLOCKED" }), "", 4);
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

/** Outbound POST to a seller-controlled URL: HTTPS only, public IPs only, no redirects, 10 s timeout. */
export function safePost(url: string, headers: Record<string, string>, body: string, timeoutMs = 10_000): Promise<{ status: number; error?: string }> {
  if (!validateWebhookUrl(url)) return Promise.resolve({ status: 0, error: "blocked_url" });
  return new Promise((resolve) => {
    const req = https.request(url, { method: "POST", headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)), "User-Agent": "ANOR-Webhooks/1.0" }, timeout: timeoutMs, lookup: publicLookup }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e: NodeJS.ErrnoException) => resolve({ status: 0, error: e.code === "EBLOCKED" || e.message === "blocked_address" ? "blocked_address" : e.message.slice(0, 120) }));
    req.end(body);
  });
}
