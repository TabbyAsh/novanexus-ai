# Nova Hub Lite - Launch Checklist

## Pre-Launch Requirements

### 1. Environment Variables
Configure these in your production environment:

```bash
# Required - Database
DATABASE_URL=postgresql://user:password@host:5432/nova
POSTGRES_USER=<production_user>
POSTGRES_PASSWORD=<strong_password>

# Required - Authentication  
JWT_SECRET=<minimum_32_char_random_string>

# Required - Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...  # Create in Stripe Dashboard
STRIPE_PRICE_YEARLY=price_...   # Create in Stripe Dashboard

# Required - Redis
REDIS_URL=redis://host:6379

# Optional - External APIs (for Phase C)
POLYGON_API_KEY=<your_polygon_key>

# Optional - Email Alerts
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid_api_key>
EMAIL_FROM=noreply@yourdomain.com
```

### 2. Stripe Dashboard Configuration

1. **Create Products & Prices:**
   - Product: "Nova Hub Lite"
   - Monthly Price: $29/month (recurring)
   - Yearly Price: $290/year (recurring)
   - Copy Price IDs to env vars

2. **Configure Customer Portal:**
   - Enable subscription cancellation
   - Enable plan changes
   - Set branding (logo, colors)

3. **Set up Webhook:**
   - Endpoint URL: `https://yourdomain.com/billing/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

### 3. Database Setup

```bash
# Run all migrations
psql $DATABASE_URL -f infra/migrations/001_initial_schema.sql
psql $DATABASE_URL -f infra/migrations/002_bots_table.sql
psql $DATABASE_URL -f infra/migrations/003_billing_tables.sql
```

### 4. Local Verification

```bash
# Build and start all services
npm run nova:up

# Wait for services to be healthy (60 seconds)
# Run smoke test
npm run nova:smoke

# Expected output: All services healthy
```

## Launch Steps

### Step 1: Deploy Infrastructure
```bash
# Deploy to your hosting provider (e.g., AWS, GCP, Railway, Render)
# Ensure all env vars are set

# Verify database connection
docker compose exec postgres pg_isready -U nova
```

### Step 2: Run Migrations
```bash
# Apply schema migrations
npm run db:migrate
```

### Step 3: Start Services
```bash
npm run nova:up
```

### Step 4: Verify Health
```bash
# Check all services
npm run nova:smoke

# Or manually:
curl https://yourdomain.com/health
curl https://yourdomain.com/v1/billing/pricing
```

### Step 5: Test Billing Flow
1. Register a new user at `/register`
2. Navigate to `/pricing`
3. Click "Subscribe Now" on LITE plan
4. Complete Stripe Checkout (use test card: 4242424242424242)
5. Verify redirect to success page
6. Verify entitlement updated in database:
   ```sql
   SELECT * FROM entitlements WHERE user_id = '<user_id>';
   ```
7. Access premium feature (e.g., `/dashboard/trade`)
8. Verify no paywall block

### Step 6: Test Webhook
```bash
# Use Stripe CLI to test webhook
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
```

## Post-Launch Verification

### User Journey Test
1. [ ] User can register with email/password
2. [ ] User can log in
3. [ ] Free user sees paywall on premium features
4. [ ] User can view pricing page
5. [ ] User can subscribe via Stripe Checkout
6. [ ] Webhook updates entitlement
7. [ ] Paid user can access Scanner
8. [ ] Paid user can access Paper Trading
9. [ ] Paid user can generate Thesis Cards
10. [ ] User can manage subscription via Customer Portal

### API Test
```bash
# Test public pricing endpoint
curl https://yourdomain.com/v1/billing/pricing

# Test auth (register)
curl -X POST https://yourdomain.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!"}'

# Test protected endpoint (should require auth)
curl https://yourdomain.com/v1/trade/scan
# Expected: 401 Unauthorized

# Test with token
curl https://yourdomain.com/v1/trade/scan \
  -H "Authorization: Bearer <token>"
# Expected: 403 if not subscribed, 200 if subscribed
```

## Monitoring Checklist

- [ ] Set up uptime monitoring (e.g., Pingdom, UptimeRobot)
- [ ] Configure error tracking (e.g., Sentry)
- [ ] Set up log aggregation (e.g., Datadog, Logtail)
- [ ] Monitor Stripe webhook failures in Dashboard
- [ ] Set up database backup schedule

## Rollback Plan

If critical issues are found:

```bash
# 1. Stop services
npm run nova:down

# 2. Restore database backup
pg_restore -U nova -d nova < backup.dump

# 3. Checkout previous version
git checkout <previous_tag>

# 4. Rebuild and restart
npm run nova:up
```

## Legal Requirements

Ensure these pages are live and linked:
- [ ] `/legal/terms-of-service` - Terms of Service
- [ ] `/legal/privacy-policy` - Privacy Policy  
- [ ] `/legal/risk-disclosure` - Trading Risk Disclosure

## Support Channels

Configure support channels before launch:
- Email: support@yourdomain.com
- Documentation: /docs
- FAQ: /faq

---

## Quick Commands Reference

| Action | Command |
|--------|---------|
| Start all services | `npm run nova:up` |
| Stop all services | `npm run nova:down` |
| Run smoke test | `npm run nova:smoke` |
| View logs | `docker-compose -f docker-compose.mvp.yml logs -f` |
| Database backup | `pg_dump -U nova nova > backup.sql` |
| Check entitlements | `SELECT * FROM entitlements;` |

---

*Document Version: 1.0*
*Last Updated: January 2026*
