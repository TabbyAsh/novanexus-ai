# Nova Enterprises LLC public site

Static HTML, CSS, and JavaScript for https://novanexus-ai.com, plus Vercel serverless functions that store inquiries in Postgres.

Vercel project: `nova-enterprises`. Team recorded in `docs/web/PUBLIC-OFFICE.md`: `wyatts-projects-84eea5ea`. Project root: `nova-enterprises-site`. Static output: `public`. Functions: `api/`. The production git branch recorded for this project is `codex/revenue-doorway-hardening`. Do not promote a deployment or merge to `master` from a preview task.

Preview locally: `python -m http.server 8765 --bind 127.0.0.1 --directory public`. That preview serves the pages only. Intake needs the functions and `DATABASE_URL`.

## What the functions do

| Route | Access | Behavior |
|---|---|---|
| `POST /api/intake` | Public | Validates a buyer/sourcing, supplier, or services inquiry. Writes Postgres first, then attempts owner notification. Returns receipt `NOVA-YYYYMMDD-XXXX` or a visible error. |
| `GET /api/intake/health` | Public | `{ ok, service: "intake", database, email }`. No secrets and no inquiry rows. |
| `GET /owner` | Owner secret | HTML queue. Also `GET /api/owner/queue`. |
| `GET /api/owner/inquiries` | Owner secret | JSON queue. |
| `GET /api/owner/export.csv` | Owner secret | Ledger-shaped CSV. |
| `POST /api/owner/notifications/retry` | Owner secret | Retries outbox rows in `pending` or `failed`. |
| `POST /api/owner/migrate` | Owner secret | Applies `037_public_intake.sql` and records version `037`. Safe to repeat. `GET` returns 405. |
| `GET /api/cron/purge` | `CRON_SECRET` or owner secret | Deletes inquiries older than 24 months (and their notification rows) and rate-limit hashes older than 90 days. Vercel calls it daily at 12:00 UTC. |

Owner auth is required on every owner route. Send `Authorization: Bearer <OWNER_ACCESS_SECRET>` or HTTP Basic with any username and that secret as the password. The secret is rejected when it is missing or shorter than 16 characters. A hidden page is not the control.

## Environment

Set these on the Vercel project (Preview, and later Production). Do not commit them.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | To store inquiries | Neon (or any Postgres) connection string. The owner creates this. If it is unset, the form shows “We couldn't save your request” with `mailto:wkirby592@gmail.com` and `tel:+18122631586`, and stores nothing. |
| `INTAKE_IP_SALT` | To store inquiries | Required secret mixed into the rate-limit hash. There is no default. If it is unset, intake fails the same way as a missing database and does not hash the address. The raw address is not stored. Hashes older than 90 days are deleted on the next submission. |
| `OWNER_ACCESS_SECRET` | To open `/owner` | Single shared secret, 16+ characters. |
| `INTAKE_EMAIL_ENABLED` | No | Leave unset or `false`. `true` does **not** send email. No provider is implemented. See the proposal in `docs/stage0/owner-alert-proposal.md`. |
| `INTAKE_RATE_LIMIT_PER_HOUR` | No | Default `8` submissions per network address per hour. |
| `CRON_SECRET` | For the daily purge | When set, Vercel sends it as `Authorization: Bearer` on the cron. The owner secret also works, so the purge can be run by hand. Leave it unset only if you will call the route yourself. |

Notification is attempted only after the inquiry transaction commits. A failure is stored on `inquiry_notification_outbox` and does not delete the inquiry. The intended recipient, once a provider is approved, is `wkirby592@gmail.com`.

## Run migration 037

Vercel does not run migrations on deploy, and a Sensitive `DATABASE_URL` cannot be read by `psql` from the dashboard. After `DATABASE_URL` and `OWNER_ACCESS_SECRET` are set on the deployment, migrate from inside Vercel:

```bash
curl -sS -X POST "https://<deployment>/api/owner/migrate" \
  -H "Authorization: Bearer $OWNER_ACCESS_SECRET" \
  -H "Accept: application/json"
```

A successful response is `{ "ok": true, "tables": ["inquiry_notification_outbox", "intake_rate_events", "public_inquiries"] }`. The route applies the same SQL as `infra/migrations/037_public_intake.sql`, inlined in the function so Vercel does not need extra files, then inserts version `037` into `schema_migrations`. Repeat calls are safe. `GET` returns 405. A wrong or missing owner secret returns 401. Failures return a generic 500 and do not include the connection string.

If a shell can see `DATABASE_URL`, the same file can be applied directly.

Fresh intake database (this is what the Vercel/Neon project should use):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/migrations/037_public_intake.sql
```

The command is run from the repository root. Neon URLs should include `sslmode=require`. `psql` uses that from the URL.

Existing full Nova database (local or CI, after 001–036):

```bash
for f in infra/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Do not point `DATABASE_URL` at a database you are not willing to change. Preview and production should not share one database if preview submissions should stay out of the live queue. Rows record `source` as `website`, `website-preview`, or `website-test`.

## Tests

Requires Postgres and migration 037 (the test applies 037 itself):

```bash
cd nova-enterprises-site
npm ci --omit=dev
DATABASE_URL=postgresql://nova:nova_ci_password@127.0.0.1:5432/nova \
  OWNER_ACCESS_SECRET=test-owner-secret-16 \
  INTAKE_IP_SALT=test-intake-ip-salt \
  node --test
```

## Contact

Wyatt Kirby, `wkirby592@gmail.com`, `812-263-1586`, Terre Haute, Indiana. Public phone and email are business contact details, not an email-sending credential.
