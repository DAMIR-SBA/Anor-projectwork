import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser, getStaffSession, type CurrentUser, type StaffContext } from "@/server/auth/session";
import { isSameOrigin, requestMeta, type RequestMeta } from "@/server/security/request";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/log";
import type { Permission } from "@/lib/rbac";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const SECRET_FIELD = /pass|pin|code|confirm|secret|token|totp/i;

/** Echo non-secret form values back on failure so React's post-action form reset keeps them. */
function echoValues(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && !SECRET_FIELD.test(k) && v.length < 2000) out[k] = v;
  }
  return out;
}

/** Throw from services; `code` is a key of the "errors" message namespace. */
export class AppError extends Error {
  constructor(
    public code: string,
    public values?: Record<string, string | number>,
    public field?: string,
  ) {
    super(code);
  }
}

type AuthMode = "public" | "user" | "staff";

type Ctx<A extends AuthMode> = {
  meta: RequestMeta;
  user: A extends "user" ? CurrentUser : CurrentUser | null;
  staff: A extends "staff" ? StaffContext : null;
};

type Options<S extends z.ZodType, A extends AuthMode> = {
  schema?: S;
  auth?: A;
  permission?: Permission;
  /** Rate limit bucket: limit per window (seconds), keyed by user or IP. */
  rateLimit?: { key: string; limit: number; window: number };
};

async function translateIssue(issue: z.core.$ZodIssue, t: Awaited<ReturnType<typeof getTranslations>>): Promise<string> {
  // Schemas may carry a message key (`{ error: "password_short" }`).
  if (issue.message && t.has(issue.message)) return t(issue.message);
  const i = issue as z.core.$ZodIssue & { minimum?: number | bigint; maximum?: number | bigint; origin?: string; format?: string };
  switch (issue.code) {
    case "too_small":
      return i.origin === "string" ? t("tooShort", { min: Number(i.minimum) }) : t("tooSmall", { min: Number(i.minimum) });
    case "too_big":
      return i.origin === "string" ? t("tooLong", { max: Number(i.maximum) }) : t("tooBig", { max: Number(i.maximum) });
    case "invalid_format":
      return i.format === "email" ? t("invalidEmail") : t("invalidFormat");
    case "invalid_type":
      return t("required");
    default:
      return t("invalidFormat");
  }
}

async function run<S extends z.ZodType, A extends AuthMode, R>(
  opts: Options<S, A>,
  raw: unknown,
  handler: (input: z.infer<S>, ctx: Ctx<A>) => Promise<ActionResult<R> | void>,
): Promise<ActionResult<R>> {
  const result = await runInner(opts, raw, handler);
  return result.ok ? result : { ...result, values: echoValues(raw) };
}

async function runInner<S extends z.ZodType, A extends AuthMode, R>(
  opts: Options<S, A>,
  raw: unknown,
  handler: (input: z.infer<S>, ctx: Ctx<A>) => Promise<ActionResult<R> | void>,
): Promise<ActionResult<R>> {
  const t = await getTranslations("errors");
  try {
    const h = await headers();
    if (!isSameOrigin(h)) return { ok: false, code: "csrf", error: t("csrf") };
    const meta = await requestMeta();

    const auth = opts.auth ?? "user";
    let user: CurrentUser | null = null;
    let staff: StaffContext | null = null;
    if (auth === "staff") {
      staff = await getStaffSession();
      if (!staff) return { ok: false, code: "unauthorized", error: t("unauthorized") };
      if (opts.permission && !staff.permissions.has(opts.permission)) return { ok: false, code: "forbidden", error: t("forbidden") };
    } else {
      user = await getCurrentUser();
      if (auth === "user" && !user) return { ok: false, code: "unauthorized", error: t("unauthorized") };
    }

    if (opts.rateLimit) {
      const who = staff?.user.id ?? user?.id ?? meta.ip;
      const rl = await rateLimit(`${opts.rateLimit.key}:${who}`, opts.rateLimit.limit, opts.rateLimit.window);
      if (!rl.success) return { ok: false, code: "rate_limited", error: t("rateLimited") };
    }

    let input: z.infer<S> = raw as z.infer<S>;
    if (opts.schema) {
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          if (!fieldErrors[key]) fieldErrors[key] = await translateIssue(issue, t);
        }
        return { ok: false, code: "invalid_input", error: t("invalidInput"), fieldErrors };
      }
      input = parsed.data;
    }

    const result = await handler(input, { meta, user, staff } as Ctx<A>);
    return (result ?? { ok: true }) as ActionResult<R>;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) {
      const message = t.has(err.code) ? t(err.code, err.values) : t("generic");
      return { ok: false, code: err.code, error: message, ...(err.field ? { fieldErrors: { [err.field]: message } } : {}) };
    }
    log.error("action failed", { err });
    return { ok: false, code: "generic", error: t("generic") };
  }
}

/** Server action callable with a typed object. */
export function action<S extends z.ZodType, A extends AuthMode = "user", R = unknown>(
  opts: Options<S, A>,
  handler: (input: z.infer<S>, ctx: Ctx<A>) => Promise<ActionResult<R> | void>,
) {
  return async (input: z.input<S>) => run(opts, input, handler);
}

/** Server action for <form action> with useActionState: (prevState, FormData). */
export function formAction<S extends z.ZodType, A extends AuthMode = "user", R = unknown>(
  opts: Options<S, A>,
  handler: (input: z.infer<S>, ctx: Ctx<A>) => Promise<ActionResult<R> | void>,
) {
  return async (_prev: ActionResult<R> | null, formData: FormData) => run(opts, formDataToObject(formData), handler);
}

/** FormData → plain object. Keys ending in [] become arrays; "on" checkboxes become true. */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      (out[k] as unknown[] | undefined) ? (out[k] as unknown[]).push(value) : (out[k] = [value]);
    } else {
      out[key] = value === "on" ? true : value;
    }
  }
  return out;
}

// Reusable field schemas.
export const zLogin = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{4,20}$/, { error: "loginFormat" })
  .transform((s) => s.toLowerCase());
export const zPassword = z.string().min(10, { error: "passwordShort" }).max(128);
export const zPin = z.string().regex(/^\d{6}$/, { error: "pinFormat" });
export const zPhone = z
  .string()
  .trim()
  .transform((s) => normalizePhone(s) ?? "")
  .pipe(z.string().regex(/^\+998\d{9}$/, { error: "phoneFormat" }));
export const zBool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());
export const zInt = (min = 0, max = Number.MAX_SAFE_INTEGER) => z.coerce.number().int().min(min).max(max);
export const zId = z.string().min(10).max(40);

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return null;
}
