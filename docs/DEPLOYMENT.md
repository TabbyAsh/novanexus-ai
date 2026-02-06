# NovaNexus AI - Production Deployment Guide

> How to deploy the full NovaNexus stack so the Vercel frontend can reach the backend in production.

## ⚠️ IMPORTANT: Do NOT Use Cloudflare Tunnel for Production

**Cloudflare Tunnel is for LOCAL DEVELOPMENT ONLY.**

The domain `api.novanexus-ai.com` was previously routed through a Cloudflare Tunnel running on a developer's PC. This causes **Error 1033** and "network request failed" errors when the tunnel is not running.

**For production, you MUST deploy the backend to a cloud platform (Railway, Render, or Fly.io) that provides 24/7 uptime.**

After deploying to Railway, update Vercel with:
```
NEXT_PUBLIC_API_URL=https://<your-railway-app>.railway.app
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INTERNET                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────────┐                    ┌─────────────────────────────┐
│  Vercel             │                    │  Railway/Render/Fly.io      │
│  apps/web           │ ───────────────▶  │  Backend Services           │
│  NEXT_PUBLIC_API_URL│                    │  api.novanexus-ai.com       │
│  =https://api....   │                    │                             │
└─────────────────────┘                    │  ┌─────────────────────────┐│
                                           │  │ Gateway    (3000)      ││
                                           │  │ Auth       (3001)      ││
                                           │  │ Nova Hub   (3030)      ││
                                           │  │ MarketData (3020)      ││
                                           │  │ Billing    (3006)      ││
                                           │  └─────────────────────────┘│
                                           │              │              │
                                           │  ┌───────────▼────────────┐│
                                           │  │ Postgres + Redis       ││
                                           │  │ (Railway managed DBs)  ││
                                           │  └────────────────────────┘│
                                           └─────────────────────────────┘
```

## Option A: Railway (Recommended)

Railway is the simplest way to deploy the full stack.

### Prerequisites
- Railway account: https://railway.app
- Railway CLI: `npm install -g @railway/cli`
- Project source code pushed to GitHub

### Step 1: Create Railway Project

```bash
# Login to Railway
railway login

# Initialize project
railway init
```

### Step 2: Add PostgreSQL

In Railway dashboard:
1. Click "New" → "Database" → "PostgreSQL"
2. Copy the `DATABASE_URL` from Variables

### Step 3: Add Redis

1. Click "New" → "Database" → "Redis"
2. Copy the `REDIS_URL` from Variables

### Step 4: Deploy Backend Services

Create a single "web" service that runs all backend services via docker-compose.

**railway.toml** (create in project root):
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile.prod"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[[services]]
name = "gateway"
port = 3000
```

**Dockerfile.prod** (create in project root):
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY apps ./apps
COPY services ./services
COPY libs ./libs
RUN npm ci
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services ./services
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/package.json ./

# Start gateway which proxies to other services
# In production, use process manager like PM2
CMD ["node", "services/gateway/dist/index.js"]
```

### Step 5: Configure Environment Variables

In Railway dashboard, add these variables to your service:

```env
# Database (auto-filled by Railway if linked)
DATABASE_URL=postgresql://...

# Redis (auto-filled by Railway if linked)
REDIS_URL=redis://...

# Auth
JWT_SECRET=your-256-bit-secret-generate-with-openssl-rand-hex-32

# API Keys
POLYGON_API_KEY=your_polygon_key
FINNHUB_API_KEY=your_finnhub_key
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# URLs
APP_URL=https://nova-enterprises.vercel.app
```

### Step 6: Custom Domain

1. In Railway service settings, go to "Settings" → "Networking"
2. Click "Generate Domain" or add custom domain: `api.novanexus-ai.com`
3. Add DNS records as instructed

### Step 7: Deploy

```bash
railway up
```

### Step 8: Run Migrations

```bash
# Connect to Railway shell
railway run npm run db:migrate
```

---

## Option B: Render

Render offers free tier and easy Docker deployment.

### Step 1: Create Render Account

Sign up at https://render.com

### Step 2: Create PostgreSQL Database

1. Dashboard → "New" → "PostgreSQL"
2. Name: `nova-postgres`
3. Copy the "Internal Database URL"

### Step 3: Create Redis Instance

1. Dashboard → "New" → "Redis"
2. Name: `nova-redis`
3. Copy the "Internal Redis URL"

### Step 4: Create Web Service

1. Dashboard → "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `nova-gateway`
   - **Region**: Oregon (US West) or nearest
   - **Branch**: `main`
   - **Root Directory**: `.` (project root)
   - **Runtime**: Docker
   - **Dockerfile Path**: `Dockerfile.prod`
   - **Instance Type**: Standard ($7/mo) or higher

### Step 5: Environment Variables

Add in Render dashboard:

```env
DATABASE_URL=<from postgres service>
REDIS_URL=<from redis service>
JWT_SECRET=<generate secure secret>
POLYGON_API_KEY=<your key>
FINNHUB_API_KEY=<your key>
OPENAI_API_KEY=<your key>
STRIPE_SECRET_KEY=<your key>
STRIPE_WEBHOOK_SECRET=<your key>
APP_URL=https://nova-enterprises.vercel.app
NODE_ENV=production
PORT=3000
```

### Step 6: Health Check

Configure health check:
- **Path**: `/health`
- **Timeout**: 300 seconds

### Step 7: Custom Domain

1. Go to service Settings → "Custom Domains"
2. Add `api.novanexus-ai.com`
3. Configure DNS as instructed

---

## Option C: Fly.io

Fly.io offers global edge deployment.

### Prerequisites

```bash
# Install flyctl
brew install flyctl  # macOS
# or visit https://fly.io/docs/hands-on/install-flyctl/

# Login
fly auth login
```

### Step 1: Initialize App

```bash
fly launch --no-deploy
```

### Step 2: Create fly.toml

```toml
app = "novanexus-api"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile.prod"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 30000
    timeout = 5000
    grace_period = "10s"
    method = "GET"
    path = "/health"
```

### Step 3: Create Postgres

```bash
fly postgres create --name novanexus-db
fly postgres attach novanexus-db
```

### Step 4: Create Redis

```bash
fly redis create --name novanexus-redis
```

### Step 5: Set Secrets

```bash
fly secrets set JWT_SECRET="your-secret"
fly secrets set POLYGON_API_KEY="your-key"
fly secrets set FINNHUB_API_KEY="your-key"
fly secrets set OPENAI_API_KEY="sk-..."
fly secrets set STRIPE_SECRET_KEY="sk_live_..."
fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
fly secrets set APP_URL="https://nova-enterprises.vercel.app"
```

### Step 6: Deploy

```bash
fly deploy
```

### Step 7: Custom Domain

```bash
fly certs create api.novanexus-ai.com
```

---

## Vercel Frontend Configuration

The frontend is deployed to Vercel. Configure it to point to your backend.

### Step 1: Environment Variables

In Vercel dashboard → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://api.novanexus-ai.com
```

**Important**: This variable must be set for all environments (Production, Preview, Development).

### Step 2: Redeploy

After setting the variable, trigger a new deployment:
- Push a commit, or
- Click "Redeploy" in Vercel dashboard

### Step 3: Verify

Visit your Vercel URL and check the browser's Network tab:
- All API calls should go to `https://api.novanexus-ai.com`
- No CORS errors
- Authentication works

---

## Stripe Webhook Configuration

### Step 1: Get Webhook URL

Your webhook URL is: `https://api.novanexus-ai.com/billing/webhook`

### Step 2: Configure in Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter URL: `https://api.novanexus-ai.com/billing/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)
7. Set it as `STRIPE_WEBHOOK_SECRET` in your backend

### Step 3: Test Webhook

```bash
# Use Stripe CLI
stripe listen --forward-to https://api.novanexus-ai.com/billing/webhook
stripe trigger checkout.session.completed
```

---

## Health Checks

All services expose health endpoints. Set up monitoring:

### Endpoints

| Service | URL |
|---------|-----|
| Gateway | `https://api.novanexus-ai.com/health` |
| Auth | Internal only (proxied via gateway) |
| MarketData | Internal only |
| Nova Hub | Internal only |
| Billing | Internal only |

### Expected Response

```json
{
  "status": "healthy",
  "service": "gateway",
  "timestamp": "2026-02-06T21:00:00.000Z"
}
```

### Monitoring Setup

Use a service like:
- UptimeRobot (free)
- Pingdom
- Better Uptime
- Railway/Render built-in monitoring

Configure alerts for:
- Response time > 5s
- Status code != 200
- SSL certificate expiry

---

## Database Migrations in Production

### Initial Setup

After first deploy, run migrations:

```bash
# Railway
railway run npm run db:migrate

# Render (via shell)
# Go to service → "Shell" tab
npm run db:migrate

# Fly.io
fly ssh console
npm run db:migrate
```

### Subsequent Migrations

1. Add new migration files to `infra/migrations/`
2. Deploy new code
3. Run migrations manually (above) or set up automatic migration on deploy

### Backup

Set up automated backups:
- Railway: Automatic daily backups
- Render: Enable backup add-on
- Fly.io: Use `fly postgres backup` command

---

## SSL/HTTPS

All deployment platforms provide automatic SSL:
- Railway: Automatic Let's Encrypt
- Render: Automatic Let's Encrypt
- Fly.io: Automatic Let's Encrypt
- Vercel: Automatic

Ensure `force_https` is enabled.

---

## Troubleshooting Production

### "Network request failed" from Frontend

1. Check `NEXT_PUBLIC_API_URL` is set in Vercel
2. Check backend is running: `curl https://api.novanexus-ai.com/health`
3. Check CORS: Backend allows your Vercel domain

### CORS Errors

The gateway allows:
- `https://novanexus-ai.com`
- `https://www.novanexus-ai.com`
- `https://*.vercel.app`

If your domain isn't listed, add it to `services/gateway/src/index.ts` in `ALLOWED_ORIGINS`.

### Database Connection Errors

1. Check DATABASE_URL is correct
2. Check network rules allow connection
3. Check SSL mode (Railway/Render may require `?sslmode=require`)

### 502 Bad Gateway

1. Check service logs for crashes
2. Increase memory allocation
3. Check health check timeout (increase to 300s)

---

## Costs Estimate

### Railway
- Starter: $5/mo base + usage
- Pro: ~$20-50/mo for typical usage
- PostgreSQL: Included in usage
- Redis: Included in usage

### Render
- Starter: Free tier available (sleeps after inactivity)
- Standard: $7/mo per service
- PostgreSQL: $7/mo (1GB)
- Redis: $5/mo (25MB)
- **Total**: ~$25-40/mo

### Fly.io
- Free tier: 3 shared VMs
- Scale: ~$5-20/mo
- PostgreSQL: ~$7/mo
- Redis: ~$5/mo
- **Total**: ~$15-30/mo

### Vercel
- Hobby: Free (100GB bandwidth)
- Pro: $20/mo (1TB bandwidth)

---

## Checklist Before Go-Live

- [ ] Backend deployed and healthy
- [ ] Database migrations applied
- [ ] All environment variables set
- [ ] NEXT_PUBLIC_API_URL points to backend
- [ ] Stripe webhook configured
- [ ] Custom domain with SSL
- [ ] Health monitoring set up
- [ ] Backup configured
- [ ] Run smoke test (see RUNBOOK.md)
- [ ] Test user registration/login
- [ ] Test market data (real prices display)
- [ ] Test journal create/read
- [ ] Test backtest execution
- [ ] Test Stripe checkout flow
