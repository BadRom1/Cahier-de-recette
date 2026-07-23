# ---- Build stage -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /build

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY apps ./apps

RUN pnpm --filter @cahier/web build \
 && pnpm --filter @cahier/server build \
 && pnpm --filter @cahier/server --prod deploy --legacy /prod/server

# ---- Runtime stage ----------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/server /app
COPY --from=build /build/apps/web/dist /app/web
COPY recipes /app/seed-recipes

# The recipes live on a mounted volume in production (Railway: mount at /data).
ENV RECIPES_DIR=/data/recipes \
    SEED_RECIPES_DIR=/app/seed-recipes \
    WEB_DIST_DIR=/app/web \
    PORT=3000 \
    HOST=0.0.0.0

RUN useradd --system --create-home appuser \
 && mkdir -p /data/recipes \
 && chown -R appuser /data
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "dist/main.js"]
