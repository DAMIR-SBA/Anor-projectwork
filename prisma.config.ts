import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrate/seed) prefers DIRECT_URL: on Supabase/PgBouncer the pooled
// DATABASE_URL cannot run migrations. The app runtime always uses DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --tsconfig tsconfig.json prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
