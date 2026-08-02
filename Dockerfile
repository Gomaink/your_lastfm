FROM node:22-bookworm-slim AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  libcairo2-dev \
  libgif-dev \
  libjpeg-dev \
  libpango1.0-dev \
  librsvg2-dev \
  python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  libcairo2 \
  libgif7 \
  libjpeg62-turbo \
  libpango-1.0-0 \
  librsvg2-2 \
  && npm install --global pm2@5.4.3 \
  && npm cache clean --force \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 1533

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:1533/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
