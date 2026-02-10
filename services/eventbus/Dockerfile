FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy root manifests first for better caching
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy all workspace package.json files needed
COPY libs/shared/package.json ./libs/shared/
COPY libs/telemetry/package.json ./libs/telemetry/
COPY libs/eventing/package.json ./libs/eventing/
COPY services/eventbus/package.json ./services/eventbus/

# Install all dependencies from root (workspace install)
RUN npm ci --ignore-scripts || npm install --legacy-peer-deps

# Copy full source
COPY libs ./libs
COPY services/eventbus ./services/eventbus

# Build workspace dependencies (turbo handles dependency order)
RUN npx turbo run build --filter=@nova/shared --filter=@nova/telemetry --filter=@nova/eventing --no-cache || true

# Install esbuild for bundling
RUN npm install -g esbuild

# Bundle eventbus with esbuild
RUN esbuild services/eventbus/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --external:pg-native \
  --tsconfig=services/eventbus/tsconfig.json

ENV NODE_ENV=production
EXPOSE 3003

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3003/health || exit 1

CMD ["node", "dist/index.js"]
