FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy root package files for workspace setup
COPY package.json package-lock.json ./
COPY libs ./libs
COPY services/billing ./services/billing
COPY tsconfig.json ./

# Install with workspaces - this properly links @nova/* packages
RUN npm ci --workspace=@nova/shared --workspace=@nova/telemetry --workspace=@nova/billing-service --ignore-scripts || npm install --legacy-peer-deps

# Build shared libs first
WORKDIR /app/libs/shared
RUN npx tsc || true

WORKDIR /app/libs/telemetry  
RUN npx tsc || true

RUN npm install -g esbuild

WORKDIR /app
RUN esbuild services/billing/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --external:pg-native \
  --external:stripe

ENV NODE_ENV=production
EXPOSE 3006

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3006/health || exit 1

CMD ["node", "dist/index.js"]
