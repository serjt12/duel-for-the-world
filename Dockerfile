# Builds and runs the online-play game server (packages/duel-server) for
# deployment (see docs/SERVER.md). Not used by the Android app or the
# offline/vs-computer game, which never touch this image.
#
# The server runs straight from TypeScript via tsx (same as `pnpm --filter
# @duel-for-the-world/duel-server start` locally) -- no separate compile
# step, since the whole point is one small process holding open a handful
# of in-memory WebSocket rooms, not a build artifact to optimize.
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# A separate layer for just the manifests: this is the layer Docker
# caches, so an ordinary code change doesn't force a full `pnpm install`
# on every deploy -- only a change to a package.json or the lockfile does.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/duel-web/package.json apps/duel-web/package.json
COPY packages/duel-content/package.json packages/duel-content/package.json
COPY packages/duel-engine/package.json packages/duel-engine/package.json
COPY packages/duel-server/package.json packages/duel-server/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
# The rest of the workspace (duel-web's source, tests, docs, branding,
# etc.) rides along too -- .dockerignore trims the heaviest parts that
# the server never needs (node_modules, the Android project, git
# history). It's a small text-only monorepo; shipping a bit more than
# strictly necessary is simpler and safer than a fragile hand-pruned copy.
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@duel-for-the-world/duel-server", "start"]
