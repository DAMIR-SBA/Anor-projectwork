import "server-only";
import { PgBoss } from "pg-boss";

const g = globalThis as unknown as { __boss?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  g.__boss ??= (async () => {
    const boss = new PgBoss({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL!, schema: "pgboss" });
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    return boss;
  })();
  return g.__boss;
}
