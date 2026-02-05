FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy source
COPY libs ./libs
COPY services/eventbus ./services/eventbus
COPY tsconfig.json ./

# Install all deps from shared lib (has all DB/redis deps)
WORKDIR /app/libs/shared
RUN npm install

# Install eventbus deps (express)
WORKDIR /app/services/eventbus  
RUN npm install

# Install esbuild and bundle everything
RUN npm install -g esbuild typescript @types/node @types/express

# Bundle with esbuild - includes all local libs
WORKDIR /app
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
