FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

# Copy root manifests first for better caching
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy workspace package.json files
COPY libs/shared/package.json ./libs/shared/
COPY apps/web/package.json ./apps/web/

# Install all dependencies from root (workspace install)
RUN npm ci --ignore-scripts || npm install --legacy-peer-deps

# Copy full source
COPY libs ./libs
COPY apps/web ./apps/web

# Build shared libs
RUN npm run build -w @nova/shared || true

# Build Next.js app
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production settings
ENV NODE_ENV=production
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run Next.js start directly (uses built .next folder)
CMD ["npx", "next", "start", "-p", "3000"]
