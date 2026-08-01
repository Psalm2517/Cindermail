# Multi-stage so the final image doesn't carry build tools needed only to
# compile better-sqlite3's native binding.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci \
    && apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

FROM node:22-bookworm-slim
WORKDIR /app
RUN useradd --system --create-home cinderbox
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY schema.sql ./
COPY src ./src

# SMTP_PORT defaults to an unprivileged port so the process never needs root.
# Map the real port 25 to it at the `docker run -p` / compose level instead
# of binding privileged ports inside the container.
ENV SMTP_PORT=2525
ENV HTTP_PORT=8787
ENV SQLITE_PATH=/data/cinderbox.db

RUN mkdir -p /data && chown cinderbox:cinderbox /data
VOLUME /data
USER cinderbox

EXPOSE 2525 8787
CMD ["node", "--experimental-strip-types", "src/node/index.ts"]
