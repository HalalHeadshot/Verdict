# syntax=docker/dockerfile:1

# ─── base: pin the exact pnpm version the workspace declares ──────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ─── builder: full workspace, install all deps (incl. dev), build, then ───────
# extract this one package into a self-contained deployable directory —
# pnpm deploy resolves workspace:* deps into real files instead of the
# symlinks pnpm normally uses, which is what makes a single package out of
# a pnpm monorepo actually portable into a plain Docker image.
FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @verdict/api build
RUN pnpm --filter @verdict/api deploy --prod /deploy

# ─── runtime: only the deployed output, no build tools, no dev deps ───────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
EXPOSE 3001
CMD ["node", "dist/index.js"]
