# Monorepo workspace Dockerfile for Nova services
# Usage via docker-compose: pass build arg WORKSPACE with the npm workspace name

FROM node:20-alpine AS base
WORKDIR /app

# Install OS deps
RUN apk add --no-cache python3 make g++

# Copy root manifests first for better caching
COPY package.json package-lock.json turbo.json ./
COPY libs ./libs
COPY services ./services
COPY apps ./apps

# Install and build only the specified workspace (and its deps via turbo)
ARG WORKSPACE
ENV NODE_ENV=production
RUN npm ci
RUN if [ -n "$WORKSPACE" ]; then npm run build -w "$WORKSPACE"; else npm run build; fi

# Default command: start the specified workspace
CMD ["sh", "-lc", "if [ -n \"$WORKSPACE\" ]; then npm start -w $WORKSPACE; else echo 'WORKSPACE arg required' && exit 1; fi"]