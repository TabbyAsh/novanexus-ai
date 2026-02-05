FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy all shared libs
COPY libs ./libs
COPY services/tradebot ./services/tradebot
COPY tsconfig.json ./

# Install shared libs
WORKDIR /app/libs/shared
RUN npm install

WORKDIR /app/libs/telemetry
RUN npm install

WORKDIR /app/libs/bot-sdk
RUN npm install

WORKDIR /app/libs/nexus-core
RUN npm install

# Install tradebot dependencies
WORKDIR /app/services/tradebot
RUN npm install

# Install build tools globally
RUN npm install -g esbuild typescript @types/node @types/express

# Build the application
WORKDIR /app
RUN esbuild services/tradebot/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --external:pg-native \
  --external:openai \
  --tsconfig=services/tradebot/tsconfig.json

# Install runtime dependencies for external packages
RUN npm install openai axios

ENV NODE_ENV=production
EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:3010/health/live || exit 1

CMD ["node", "dist/index.js"]
