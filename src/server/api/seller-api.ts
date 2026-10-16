import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError } from "@/server/action";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { reportError } from "@/server/observability";
import { resolveApiKey } from "@/server/services/seller/api";
import { bearerToken, type ApiScope } from "@/lib/seller";

export type ApiContext = NonNullable<Awaited<ReturnType<typeof resolveApiKey>>>;

const STATUS: Record<string, number> = { notFound: 404, forbidden: 403, invalidTransition: 409, fboPlatform: 409, oldPriceLow: 422, invalidInput: 422, noWarehouse: 409, outOfStock: 409 };
const MESSAGES: Record<string, string> = {
  notFound: "Resource not found",
  forbidden: "Not allowed for this shop",
  invalidTransition: "Status change not allowed from the current status",
  fboPlatform: "FBO items are handled by the ANOR warehouse",
  oldPriceLow: "old_price must be greater than price",
  noWarehouse: "The shop has no seller warehouse",
};

function fail(status: number, code: string, message: string, headers: Record<string, string> = {}, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

/**
 * Wraps a public seller API route: bearer key → shop, per-key rate limit (headers on every
 * response), scope check, JSON errors with stable codes. Handlers return the `data` payload.
 */
export function sellerApi<P = Record<string, never>>(scope: ApiScope, handler: (req: Request, ctx: ApiContext, params: P) => Promise<unknown>) {
  return async (req: Request, route: { params: Promise<P> }) => {
    const token = bearerToken(req.headers.get("authorization"));
    if (!token) return fail(401, "unauthorized", "Missing or malformed bearer token", { "WWW-Authenticate": "Bearer" });
    const ctx = await resolveApiKey(token);
    if (!ctx) return fail(401, "unauthorized", "Invalid or revoked API key", { "WWW-Authenticate": "Bearer" });
    const rl = await rateLimit(`sellerapi:${ctx.keyId}`, LIMITS.sellerApi.limit, LIMITS.sellerApi.window);
    const headers = { "X-RateLimit-Limit": String(LIMITS.sellerApi.limit), "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)), "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)) };
    if (!rl.success) return fail(429, "rate_limited", "Too many requests", { ...headers, "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) });
    if (!ctx.scopes.includes(scope)) return fail(403, "insufficient_scope", `This key lacks the ${scope} scope`, headers);
    try {
      const data = await handler(req, ctx, await route.params);
      return NextResponse.json({ data }, { headers: { ...headers, "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ZodError) return fail(422, "validation_failed", "Request validation failed", headers, e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      if (e instanceof SyntaxError) return fail(400, "invalid_json", "Body must be valid JSON", headers);
      if (e instanceof AppError) return fail(STATUS[e.code] ?? 400, e.code, MESSAGES[e.code] ?? e.code, headers);
      await reportError(e, { route: new URL(req.url).pathname, shopId: ctx.shop.id });
      return fail(500, "internal", "Internal error", headers);
    }
  };
}

export const zPage = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), per_page: z.coerce.number().int().min(1).max(100).default(50) });

export const searchParams = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);

/** JSON body with a size cap (bulk stock is the largest legitimate payload). */
export async function jsonBody(req: Request, maxBytes = 256_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("invalidInput");
  return JSON.parse(text);
}
