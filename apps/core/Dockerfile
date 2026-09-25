# syntax=docker/dockerfile:1
#
# Built from the repo root (not this directory) so pnpm can see the whole workspace —
# `apps/core` depends on `packages/contracts` via `workspace:*`, which only resolves
# correctly when the install sees every workspace manifest. Build with:
#   docker build -f apps/core/Dockerfile -t wagonwise-core .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# Manifests only, so this layer (the slow one) is cached across builds that only touch source.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/driver-bff/package.json apps/driver-bff/package.json
COPY apps/driver-app/package.json apps/driver-app/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/architecture/package.json packages/architecture/package.json
# `...` pulls in this package's workspace dependencies (packages/contracts) without installing
# the driver-app's much larger (Expo/React Native) dependency tree.
RUN pnpm install --frozen-lockfile --filter "@wagonwise/core..."

FROM deps AS build
COPY . .
RUN pnpm --filter "@wagonwise/core..." run build

FROM node:22-slim AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo .
WORKDIR /repo/apps/core
EXPOSE 3001
CMD ["node", "dist/main.js"]
