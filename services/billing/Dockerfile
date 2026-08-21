FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy root manifests first for better caching
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy all workspace package.json files needed
COPY libs/shared/package.json ./libs/shared/
COPY libs/telemetry/package.json ./libs/telemetry/
COPY libs/eventing/package.json ./libs/eventing/
COPY libs/proof-core/package.json ./libs/proof-core/
COPY services/billing/package.json ./services/billing/

# Install all dependencies from root (workspace install)
RUN npm ci --ignore-scripts || npm install --legacy-peer-deps

# Copy full source
COPY libs ./libs
COPY services/billing ./services/billing

# Build workspace dependencies (turbo handles dependency order). Billing imports
# proof-core through its compiled package entrypoint, so this build must not be
# allowed to fail silently.
RUN npx turbo run build --filter=@nova/shared --filter=@nova/telemetry --filter=@nova/eventing --filter=@nova/proof-core --no-cache

# Install esbuild for bundling
RUN npm install -g esbuild

# Bundle billing with esbuild
RUN esbuild services/billing/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --external:pg-native \
  --external:stripe \
  --tsconfig=services/billing/tsconfig.json

ENV NODE_ENV=production
EXPOSE 3006

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3006/health || exit 1

CMD ["node", "dist/index.js"]
