# ANOR — Hamma narsa bir joyda

A multi-vendor marketplace for Uzbekistan. Buyers shop in Uzbek (Latin and Cyrillic) or Russian
and pay in so‘m. Sellers run their shops from a cabinet with FBO/FBS/DBS fulfilment. Staff
moderate, support and operate the platform from an admin panel with role-based permissions.

- **Storefront:** catalog, search, product pages, cart, checkout, orders, returns, reviews,
  chat with sellers, support, wallet, Nasiya instalments, ANOR Plus, rewards, B2B quotes and
  invoices, short videos, live shopping, trade-in, an AI shopping assistant, a Telegram bot and
  Mini App, and an installable PWA.
- **Seller cabinet** (`/seller`): products, stock and warehouses, orders with SLA timers,
  promotions, ads, analytics, payouts, quotes, videos and live streams, plus an API with
  webhooks.
- **Admin panel** (`/admin`, sign-in at the hidden `/staff/login`):
  - moderation, operations, logistics, campaigns, loyalty, the fraud desk and finance;
  - analytics, feature flags, platform settings and the status page;
  - staff, roles and the audit log.

[`docs/PHASES.md`](docs/PHASES.md) lists what each build phase delivered and what is mocked.
[`docs/BACKUP.md`](docs/BACKUP.md) covers backup and restore.

## Stack

| | |
|---|---|
| App | Next.js 16 (App Router, Turbopack, server actions), React 19, TypeScript |
| UI | Tailwind CSS v4 design tokens, light and dark themes, WCAG AA (checked with axe in e2e) |
| Data | PostgreSQL 15+ through Prisma 7 (`@prisma/adapter-pg`) |
| i18n | next-intl: `uz` (Latin, default), `oz` (Cyrillic, generated from Latin), `ru` |
| Jobs | job registry with an `inline` driver or `pg-boss` (`npm run worker`), or Vercel Cron |
| Realtime | Server-Sent Events with Postgres LISTEN/NOTIFY, or polling on serverless |
| Tests | Vitest (unit), Playwright and axe-core (end-to-end and accessibility) |

## Quick start (local)

Requirements: Node.js 20.19+ (22 recommended), npm, and either Docker or a local PostgreSQL 15+.

```bash
cp .env.example .env
#  1. Replace every CHANGE_ME value. Generate secrets with: openssl rand -base64 48
#  2. Put the same POSTGRES_PASSWORD into DATABASE_URL and DIRECT_URL
#  3. Keep DEMO_MODE=true and NEXT_PUBLIC_DEMO_MODE=true for the demo data and one-click logins

docker compose up -d          # Postgres :5432, Redis REST :8079, Mailpit :1025 / http://localhost:8025
npm install
npx prisma migrate deploy
npm run db:seed               # idempotent; safe to run again
npm run dev                   # http://localhost:3000
```

Optional, to use the compose services from the app:
- `EMAIL_DRIVER=smtp` sends mail to Mailpit.
- `UPSTASH_REDIS_REST_URL=http://localhost:8079` and `UPSTASH_REDIS_REST_TOKEN=<REDIS_REST_TOKEN>` keep rate limits in Redis.
- `JOBS_DRIVER=pgboss` together with `npm run worker` in a second terminal runs the scheduled jobs.

With `JOBS_DRIVER=inline`, jobs run in-process when triggered. In that mode, scheduled jobs only run from **Admin → Status → Run now** or through `/api/cron/<job>`.

### Demo accounts (DEMO_MODE only)

The sign-in page (`/auth/login`) shows one-click demo accounts:

| Account | Use it for |
|---|---|
| Xaridor | buyer with orders, a wallet, Nasiya, rewards and a saved address |
| Sotuvchi | seller of the "Moda Bazar" shop |
| Pro sotuvchi | "TechHub" on the Pro tier (ads, A/B tests, API) |
| Hunarmand | artisan shop (Made in Uzbekistan) |
| Biznes xaridor | verified business buyer (quotes, invoices, bank transfer) |

`/staff/login` has one-click buttons for SUPER_ADMIN, FINANCE, SUPPORT and MODERATOR demo staff. These accounts get random passwords at seed time.

The platform owner is the account from `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_ACCESS_CODE`. There are no default credentials in the repository.

Test payment and code values are mocks:
- Mock card gateway (`/pay/<id>`): any card number and expiry, SMS code `000000`.
- In demo mode, SMS codes appear in a toast and in the server log.

Turn `DEMO_MODE` off for a real deployment. That hides demo logins, the demo reset and visible OTP codes.

## Environment

Every variable is documented in [`.env.example`](.env.example). Only placeholders are committed.

When `NODE_ENV=production`, the server **refuses to start** if any of these is missing or still a placeholder:

| Variable | Rule |
|---|---|
| `SESSION_SECRET` | random, 32+ characters; signs cookies and derives encryption keys |
| `SUPER_ADMIN_LOGIN` | owner login (4–20 letters, digits, `_`) |
| `SUPER_ADMIN_PASSWORD` | 12+ characters |
| `SUPER_ADMIN_ACCESS_CODE` | 6+ characters, the third factor at staff sign-in |

The seed also refuses to create the owner from placeholders in production.

| Group | Variables | Without them |
|---|---|---|
| Core | `APP_URL`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` | required |
| Storage | `STORAGE_DRIVER` (`local` / `supabase`), `STORAGE_SUPABASE_*` | local disk under `storage/uploads` |
| Email | `EMAIL_DRIVER` (`console` / `smtp` / `resend`), `EMAIL_*` | printed to the server log |
| SMS | `SMS_DRIVER` (`console` / `eskiz`), `SMS_ESKIZ_*` | printed to the log |
| Rate limits | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | per-process memory |
| Jobs, realtime | `JOBS_DRIVER` (`inline` / `pgboss`), `REALTIME_DRIVER` (`sse` / `poll`) | inline, SSE |
| Sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google button hidden |
| AI | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | keyword and rule fallbacks |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SELLER_BOT_*`, … | messages logged, Mini App demo sign-in |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push toggle says "not configured" |
| Monitoring | `SENTRY_DSN`, `LOG_LEVEL`, `VIRUS_SCAN_WEBHOOK_URL` | errors kept in the database and logs |
| Apps, SEO | `ANDROID_APP_*`, `IOS_APP_ID`, `NOINDEX` | no app links; indexable |

Secrets are read on the server only. The browser sees only `NEXT_PUBLIC_*` values, which contain no secrets.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | build messages, then `next dev` on :3000 |
| `npm run build` / `npm start` | production build (messages, Prisma client, `next build`) and server |
| `npm run lint` / `npm run typecheck` | ESLint (incl. React Compiler rules) / `tsc --noEmit` |
| `npm test` | Vitest unit tests (`src/**/__tests__`) |
| `npm run test:e2e` | Playwright end-to-end tests (see below) |
| `npm run i18n` | merge `src/messages/{uz,ru}/*.json`, generate Uzbek Cyrillic, fail on key conflicts |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | idempotent seed: permissions, roles, owner, and demo data when `DEMO_MODE=true` |
| `npm run worker` | pg-boss worker: queued jobs and cron schedules in Asia/Tashkent |
| `npm run job -- <name>` | run one job now (`--scheduled` for all cron jobs, `--list` to list them) |
| `npm run telegram:setup` | register bot webhooks, the menu button and commands |

## Tests

```bash
npm test                                   # unit
npx playwright install chromium            # once
npm run test:e2e                           # against `npm run dev` (started automatically)
E2E_PROD=1 npm run test:e2e                # against `npm start` after `npm run build`
E2E_BASE_URL=https://staging.example npm run test:e2e   # against a running deployment
```

The end-to-end suite needs the seeded demo database (`DEMO_MODE=true`) and the same `DATABASE_URL` the app uses. It resets the demo rows it touches, so it can run repeatedly against the same database. It runs one worker at a time because the specs share that database. It covers:
- the guest-to-paid buy flow (card and cash on delivery) on desktop and a phone viewport;
- buyer–seller chat;
- the staff invite flow (invite, claim, sign-in, revoke);
- B2B quotes and invoices;
- videos, live shopping and trade-in;
- SEO and PWA endpoints, including the offline page in production mode;
- an axe accessibility scan of key pages in both themes, which also fails if a page scrolls sideways.

To use an installed Chromium, set `CHROMIUM_PATH=/path/to/chromium`.

CI (`.github/workflows/ci.yml`) has two jobs:
1. lint, typecheck and unit tests;
2. a production build plus the end-to-end suite, against a Postgres service with per-run secrets.

## Docker

```bash
docker compose up -d                       # infrastructure only (for npm run dev)
docker compose --profile app up --build    # everything: migrate + seed, web on :3000, worker
```

The `Dockerfile` builds two images:
- `runner` is the default target: the standalone Next.js server, running as a non-root user with a `HEALTHCHECK` on `/api/health`.
- `tools` runs `prisma migrate deploy`, the seed and the pg-boss worker.

`NEXT_PUBLIC_*` values are inlined at build time, so pass them as build args (compose does that from `.env`). Everything else is read at run time.

Uploads live in the `uploads` volume, and the database in `pgdata`. All ports bind to 127.0.0.1.

To run one job by hand: `docker compose --profile app run --rm worker npm run job -- campaigns.tick`.

## Deploy: Vercel + Supabase

1. **Supabase.** Create a project.
   - Under *Project settings → Database*, copy the **Transaction pooler** URL (port 6543) into `DATABASE_URL` and add `?pgbouncer=true&connection_limit=1`.
   - Copy the **direct** or **Session** URL (port 5432) into `DIRECT_URL`.
   - Create a public Storage bucket named `anor` (or set `STORAGE_SUPABASE_BUCKET`).
2. **Schema and seed.** Run these once from your machine, with `.env` pointing at Supabase:
   ```bash
   npx prisma migrate deploy
   npm run db:seed        # DEMO_MODE=false for a clean production database
   ```
   Re-run `npx prisma migrate deploy` before each deploy that adds a migration. Doing that in CI or locally keeps migrations out of the build.
3. **Vercel.** Import the repository; the framework preset and `npm run build` work as they are. Then set the environment variables:
   - core: `APP_URL` and `NEXT_PUBLIC_APP_URL` (the production domain), `SESSION_SECRET`, `SUPER_ADMIN_*`, `CRON_SECRET`;
   - database: `DATABASE_URL`, `DIRECT_URL`;
   - storage: `STORAGE_DRIVER=supabase`, `STORAGE_SUPABASE_URL`, `STORAGE_SUPABASE_SERVICE_KEY` (server-only);
   - drivers: `JOBS_DRIVER=inline`, `REALTIME_DRIVER=poll`;
   - email and SMS providers, `UPSTASH_REDIS_REST_*` (rate limits shared across instances), and any optional integrations.
   - Set `NOINDEX=1` on preview deployments.
4. **Cron.** `vercel.json` schedules every job at `/api/cron/<job>`. Vercel sends `Authorization: Bearer $CRON_SECRET`, which the route checks.
   - Schedules are in UTC. They match the Asia/Tashkent times the worker uses, which are 5 hours ahead.
   - Some jobs run every 5–15 minutes, which needs a Vercel plan that allows sub-daily crons. On other plans, run `npm run worker` on any always-on host, or call the cron URLs from an external scheduler.
5. **Integrations.**
   - Google OAuth redirect: `https://<domain>/api/auth/google/callback`.
   - Telegram: run `npm run telegram:setup` with the bot tokens and a public `APP_URL`.
   - Web push: generate VAPID keys with `npx web-push generate-vapid-keys`.
6. **Check.** Open `https://<domain>/health` (JSON at `/api/health`), then sign in at `/staff/login` with the owner account and open **Admin → Status**.

Serverless notes:
- Local uploads are not persistent on Vercel, so use the Supabase driver.
- The admin "reset demo data" button needs the seed sources, so it reports "unavailable" there.
- SSE connections are short-lived on serverless; `REALTIME_DRIVER=poll` avoids reconnect churn.

## Project layout

```
prisma/                schema, migrations, seed (prisma/seed/*.ts per area)
src/app/[locale]/      pages: (store), (auth), seller, admin, courier, staff, tg
src/app/api/           route handlers: auth, payments mock, cron, seller API v1, public API v1, OG, health
src/server/            services, server actions, auth and RBAC, jobs, realtime, storage, integrations
src/lib/               pure helpers shared with the client (money, dates, pricing, i18n, …), unit tested
src/components/        UI kit (src/components/ui) and feature components
src/messages/{uz,ru}/  message catalogs; uz-Cyrl is generated
e2e/                   Playwright specs
```

API docs for developers are at `/developers`, and the OpenAPI 3.1 spec is at `/api/v1/openapi.json`.

## Security

- Passwords, PINs and staff access codes are hashed with argon2id. Login is rate-limited with lockouts, and new devices can require a PIN.
- Staff sessions are separate from buyer sessions, with idle and absolute timeouts.
- Every server action and mutating route checks Origin and Sec-Fetch-Site, plus the RBAC permission it needs.
- Admins cannot escalate privileges, and the last SUPER_ADMIN cannot be removed.
- Staff can read buyer–seller chats only through a logged moderation-access action.
- The audit log records before and after values, with secrets redacted.
- Uploads are checked for type, size and magic bytes, with an optional antivirus hook. KYC documents are served only through permission-checked routes.
- Outbound webhooks go only to public HTTPS addresses (DNS-rebinding safe). Structured logs redact credential fields.
- Compliance: data export and account deletion requests are supported, as are cookie consent and retention jobs.
