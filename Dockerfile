FROM node:26-alpine AS build

RUN npm install --global pnpm@12.15.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/mixxx-sync/package.json apps/mixxx-sync/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --filter @led-matrix/web build

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    rm -rf node_modules packages/*/node_modules apps/*/node_modules \
    && pnpm install --frozen-lockfile --ignore-scripts --prod --filter @led-matrix/server...

FROM node:26-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    DATABASE_PATH=/data/led-matrix.db \
    WEB_ROOT=/app/apps/web/dist

USER node

EXPOSE 3000 7701/udp

CMD ["node", "apps/server/src/index.ts"]
