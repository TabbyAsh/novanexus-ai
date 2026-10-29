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

Notification is attempted only after the inquiry transaction commits. A failure is stored on `inquiry_notification_outbox` and does not delete the inquiry. The intended recipient, once a provider is approved, is `wkirby592@gmail.com`.

## Run migration 037

Vercel does not run migrations on deploy. Run this once per database after `DATABASE_URL` exists. `037_public_intake.sql` is idempotent and does not modify `service_inquiries`.

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
