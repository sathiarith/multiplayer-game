# syntax=docker/dockerfile:1
# The web front: the built React client served by nginx, which also forwards
# /api and /socket.io to the game server.
# Build from the project root:  docker build -f client/Dockerfile -t game-web .

# Stage 1: build the client. This needs the dev dependencies (Vite itself).
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts
COPY shared /app/shared
COPY client ./
RUN npm run build

# Stage 2: only the built files, served by nginx as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1