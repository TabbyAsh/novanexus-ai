FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY libs ./libs
COPY services/gateway ./services/gateway
COPY tsconfig.json ./

WORKDIR /app/libs/shared
RUN npm install

WORKDIR /app/services/gateway
RUN npm install

RUN npm install -g esbuild typescript @types/node @types/express

WORKDIR /app
RUN esbuild services/gateway/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --external:pg-native \
  --tsconfig=services/gateway/tsconfig.json

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
