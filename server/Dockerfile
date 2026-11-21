# syntax=docker/dockerfile:1
# The game server: the REST API and the game, in one process.
# Build from the project root:  docker build -f server/Dockerfile -t game-server .

# Stage 1: production dependencies only. Copying just the package files first
# means this step is reused from cache until package-lock.json changes.
FROM node:24-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: the image that runs. No build tools, no dev dependencies, no tests.
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY shared ./shared
COPY server ./server
# The API description, served at /api/docs when the docs page is on (outside production).
COPY docs/openapi.yaml ./docs/openapi.yaml

# The files belong to root; the server runs as the unprivileged "node" user,
# so it can read its code but never change it.
USER node
WORKDIR /app/server
EXPOSE 3001

# /health checks Postgres and Redis too, so "healthy" means ready to serve.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]