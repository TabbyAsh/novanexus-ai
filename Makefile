# ============================================
# Nova Enterprises - Development Commands
# ============================================

.PHONY: help install dev verify build test lint clean docker-up docker-down docker-logs migrate seed

# Default target
help:
	@echo "Nova Enterprises - Available Commands"
	@echo "======================================"
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install all dependencies"
	@echo "  make dev          - Start full stack (deterministic)"
	@echo "  make verify       - Run deterministic verification"
	@echo "  make build        - Build all services"
	@echo "  make test         - Run all tests"
	@echo "  make lint         - Run linters"
	@echo "  make clean        - Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    - Start all Docker services"
	@echo "  make docker-down  - Stop all Docker services"
	@echo "  make docker-logs  - View Docker logs"
	@echo "  make docker-build - Build Docker images"
	@echo ""
	@echo "Database:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make migrate-new  - Create new migration"
	@echo "  make seed         - Seed database with test data"
	@echo "  make db-reset     - Reset database (DESTRUCTIVE)"
	@echo ""
	@echo "Services:"
	@echo "  make start-infra  - Start only infrastructure (postgres, redis, minio)"
	@echo "  make start-core   - Start core platform services"
	@echo "  make start-bots   - Start bot services"
	@echo ""

# ============================================
# Development
# ============================================

install:
	npm install
	cd apps/web && npm install
	@echo "Installing service dependencies..."
	@for service in gateway auth orchestrator eventbus audit notifier billing \
		tradebot storebot socialbot researchbot opsbot forgebot \
		marketdata contentdata commercedata; do \
		echo "Installing $$service..."; \
		cd services/$$service && npm install && cd ../..; \
	done

dev:
	npm run dev:all

verify:
	npm run verify

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

clean:
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf services/*/node_modules
	rm -rf libs/*/node_modules
	rm -rf apps/*/.next
	rm -rf apps/*/dist
	rm -rf services/*/dist
	rm -rf libs/*/dist

# ============================================
# Docker
# ============================================

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-build:
	docker-compose build

docker-clean:
	docker-compose down -v --rmi local

start-infra:
	docker-compose up -d postgres redis minio

start-core:
	docker-compose up -d gateway auth orchestrator eventbus audit notifier billing

start-bots:
	docker-compose up -d tradebot storebot socialbot researchbot opsbot forgebot

start-data:
	docker-compose up -d marketdata contentdata commercedata

# ============================================
# Database
# ============================================

migrate:
	npm run db:migrate

migrate-new:
	@read -p "Migration name: " name; \
	npm run db:migrate:create -- --name $$name

seed:
	npm run db:seed

db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
		docker-compose down -v postgres; \
		docker-compose up -d postgres; \
		sleep 5; \
		make migrate; \
		make seed; \
	fi

# ============================================
# Individual Services
# ============================================

dev-web:
	cd apps/web && npm run dev

dev-gateway:
	cd services/gateway && npm run dev

dev-auth:
	cd services/auth && npm run dev

dev-orchestrator:
	cd services/orchestrator && npm run dev

dev-tradebot:
	cd services/tradebot && npm run dev

# ============================================
# Production
# ============================================

prod-build:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# ============================================
# Utilities
# ============================================

kill-switch-enable:
	@echo "Enabling kill switch - all automation will be disabled"
	curl -X POST http://localhost:3000/v1/kill-switch/enable

kill-switch-disable:
	@echo "Disabling kill switch - automation will resume"
	curl -X POST http://localhost:3000/v1/kill-switch/disable

health-check:
	@echo "Checking service health..."
	@curl -s http://localhost:3000/health || echo "Gateway: DOWN"
	@curl -s http://localhost:3001/health || echo "Auth: DOWN"
	@curl -s http://localhost:3002/health || echo "Orchestrator: DOWN"
	@curl -s http://localhost:3003/health || echo "EventBus: DOWN"
