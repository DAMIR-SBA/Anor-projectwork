# syntax=docker/dockerfile:1.7
# ANOR production image (Next.js standalone server) plus a "tools" image for migrations,
# the seed and the pg-boss worker. Build: docker build -t anor .
# No secrets are baked in: everything comes from the environment at run time, except the
# NEXT_PUBLIC_* values, which Next.js inlines into the browser bundle at build time.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# ── Dependencies (cached until package-lock.json or the Prisma schema changes) ─────────
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── Full source with the generated Prisma client ───────────────────────────────────────
FROM base AS source
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run i18n && npx prisma generate

# ── Tools: `prisma migrate deploy`, `prisma db seed`, `npm run worker` ────────────────
FROM source AS tools
RUN mkdir -p storage/uploads && chown -R node:node storage
USER node
CMD ["npm", "run", "worker"]

# ── Build ──────────────────────────────────────────────────────────────────────────────
FROM source AS builder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_TIMEZONE=Asia/Tashkent
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_ENABLE_SW=
ARG NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ARG NEXT_PUBLIC_MAP_ATTRIBUTION="&copy; OpenStreetMap contributors"
ARG NEXT_PUBLIC_MAP_DEFAULT_LAT=41.3111
ARG NEXT_PUBLIC_MAP_DEFAULT_LNG=69.2797
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_TIMEZONE=$NEXT_PUBLIC_APP_TIMEZONE \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_ENABLE_SW=$NEXT_PUBLIC_ENABLE_SW \
    NEXT_PUBLIC_MAP_TILE_URL=$NEXT_PUBLIC_MAP_TILE_URL \
    NEXT_PUBLIC_MAP_ATTRIBUTION=$NEXT_PUBLIC_MAP_ATTRIBUTION \
    NEXT_PUBLIC_MAP_DEFAULT_LAT=$NEXT_PUBLIC_MAP_DEFAULT_LAT \
    NEXT_PUBLIC_MAP_DEFAULT_LNG=$NEXT_PUBLIC_MAP_DEFAULT_LNG \
    BUILD_STANDALONE=1
# `next build` never queries the database; the client only needs a syntactically valid URL.
RUN DATABASE_URL="postgresql://build@127.0.0.1:1/build" npx next build

# ── Runtime ────────────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/app/storage/uploads
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# PDF receipts, invoices and OG cards read these fonts at run time.
COPY --from=builder --chown=node:node /app/assets/fonts ./assets/fonts
RUN mkdir -p storage/uploads && chown -R node:node storage
USER node
EXPOSE 3000
# /api/health answers 503 when the database is unreachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
