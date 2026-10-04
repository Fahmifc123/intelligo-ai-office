# Worker image (Railway or Fly.io, exactly one instance). Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t intelligo-worker .
# The worker runs its TypeScript sources through tsx, like in development; there is no build step.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@intelligo/worker..."

FROM base AS runtime
ENV NODE_ENV=production HEALTH_PORT=8787
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY config ./config
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
