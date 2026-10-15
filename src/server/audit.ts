import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { requestMeta } from "@/server/security/request";
import { log } from "@/server/log";

type AuditInput = {
  actorId?: string | null;
  actorLogin?: string | null;
  actorKind?: "staff" | "user" | "system" | "seller";
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
};

const SECRET_KEYS = /password|pin|code|secret|token|hash/i;

/** Drop secrets before anything is persisted in the audit trail. */
function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k && SECRET_KEYS.test(k) ? "[redacted]" : v)),
  ) as Prisma.InputJsonValue;
}

/** Append-only audit record (who, what, when, IP, before/after). Never throws. */
export async function audit(input: AuditInput, tx?: Tx) {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const m = await requestMeta();
      ip = m.ip;
      userAgent = m.userAgent;
    } catch {
      // Outside a request (jobs, scripts).
    }
    await (tx ?? db).auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorLogin: input.actorLogin ?? null,
        actorKind: input.actorKind ?? "staff",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ip,
        userAgent,
        before: scrub(input.before),
        after: scrub(input.after),
        meta: scrub(input.meta),
      },
    });
  } catch (err) {
    log.error("audit write failed", { err, action: input.action });
  }
}
