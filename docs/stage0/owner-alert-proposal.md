# Proposal: owner alert email (not approved)

Status: proposal only, 2026-10-29. Do not create a Resend account, do not change DNS, do not send email, and do not treat this file as a decision to turn `INTAKE_EMAIL_ENABLED` on.

The intake notifier in `nova-enterprises-site/lib/intake/notify.js` stays disabled. A failed or skipped notification still leaves the inquiry in Postgres.

## What would be asked later

Use [Resend](https://resend.com/docs/add-a-domain)'s free tier to email `wkirby592@gmail.com` after an inquiry commits. Send from a subdomain such as `notify.novanexus-ai.com` (for example `inquiries@notify.novanexus-ai.com`), not from the apex. Resend recommends a subdomain so this mail does not share a reputation with other mail, and so the existing Microsoft 365 MX and the apex SPF (`include:secureserver.net`) can stay as they are.

Check Resend's pricing page for the current free-tier limit before relying on it. This proposal does not sign up.

## DNS that would be required after an account exists

Resend generates the DKIM and SPF values when the domain is added. They must be copied exactly. Do not invent a DKIM key, and do not proxy a CNAME (Cloudflare's orange cloud blocks verification). Nothing below is to be published now.

For the sending domain `notify.novanexus-ai.com`:

| Purpose | Typical name | Type | Value |
|---|---|---|---|
| DKIM | `resend._domainkey.notify` | TXT or CNAME, whichever the dashboard shows | The value Resend generates for this domain |
| SPF / return path | `send.notify` (Resend's default return-path host is `send.<domain>`) | MX and TXT, or a CNAME if that is what the dashboard shows | The records Resend shows. Their older shape is an MX to `feedback-smtp.<region>.amazonses.com` (priority 10) plus a TXT `v=spf1 include:amazonses.com ~all`. The region is chosen in the dashboard. |
| DMARC, after the domain verifies | `_dmarc.notify` | TXT | Start with monitoring, as in Resend's DMARC guide: `v=DMARC1; p=none; rua=mailto:wkirby592@gmail.com;` |

Do not replace the apex MX (`novanexusai-com02c.mail.protection.outlook.com`) or the apex SPF. Those serve the existing mailbox. A later approval would add records only under `notify` and `send.notify`.

Source for the record types: [Resend, Add a domain](https://resend.com/docs/add-a-domain) and [DMARC](https://resend.com/docs/dashboard/domains/dmarc). Exact strings come from the Resend dashboard after the domain is added, which has not happened.
