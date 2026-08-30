ARG NODE_VERSION=22.20.0
ARG ALPINE_VERSION=3.22
ARG PNPM_VERSION=11.5.3

# Base stage
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

RUN apk add --no-cache libc6-compat

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Toolchain stage
FROM base AS toolchain

ARG PNPM_VERSION

RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

# Dependencies stage (install dependencies)
FROM toolchain AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install \
    --frozen-lockfile \
    --prefer-offline \
    --trust-lockfile \
    --network-concurrency=6 \
    --store-dir=/pnpm/store

# Builder stage
FROM toolchain AS builder

ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN SESSION_SECRET=build-only-placeholder-not-a-runtime-secret pnpm build

# Runner stage
FROM base AS runner

RUN apk add --no-cache dumb-init \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
