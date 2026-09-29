# syntax=docker/dockerfile:1
#
# Built from the repo root (not this directory) — see apps/core/Dockerfile for why. Build with:
#   docker build -f apps/staff-bff/Dockerfile -t wagonwise-staff-bff .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/staff-bff/package.json apps/staff-bff/package.json
COPY apps/driver-app/package.json apps/driver-app/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/architecture/package.json packages/architecture/package.json
RUN pnpm install --frozen-lockfile --filter "@wagonwise/staff-bff..."

FROM deps AS build
COPY . .
RUN pnpm --filter "@wagonwise/staff-bff..." run build

FROM node:22-slim AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo .
WORKDIR /repo/apps/staff-bff
EXPOSE 3003
CMD ["node", "dist/main.js"]
