# Getting your data out — the only part I can't do for you

You do one thing per account: click **Export** and let the file download.
Don't rename it. Don't move it. Leave it in Downloads.

Then run this, and everything after that is automatic:

```bash
node scripts/ledger auto
```

It searches Downloads, Desktop and Documents, recognises financial CSVs by
their shape, reads them where they sit, and prints your picture. Nothing is
moved, nothing is uploaded, nothing leaves the machine.

**Ask for 6 months** wherever you get a choice. Recurring-charge detection needs
at least 3 occurrences of something to call it recurring, and burn needs a few
complete months before it means anything.

---

## Your bank (the most important one)

Almost every US bank follows the same path:

1. Log in on a **desktop browser** (mobile apps usually hide export)
2. Open the checking account
3. Find **Statements & Documents**, **Activity**, or **Transaction History**
4. Look for **Download**, **Export**, or a ⬇ icon near the date filter
5. Choose **CSV** (also called "Spreadsheet", "Comma delimited", or "Excel CSV")
6. Set the range to the last 6 months → Download

If you're only offered PDF, look for a "Transaction history" or "Activity"
section separate from "Statements" — that's usually where CSV lives.

## Webull

1. Webull on **desktop or web** (the phone app can't export)
2. **Account** → **Statements** (sometimes under Account Details)
3. Pick **Account Statement**, set the date range, export CSV
4. If you also see **Orders** or **Trade History**, export that too — it's how
   the ledger learns what you actually bought and sold

## Cash App

1. **cash.app/account** in a browser, or the app → profile icon
2. **Documents** → **Account Statements**
3. Export CSV for the months you want

## Credit cards

Same as the bank: log in, find Statements or Activity, download CSV.
Export these too — a card is where recurring subscriptions hide.

---

## If something goes wrong

Run the command and paste me **what it prints** — not the CSV itself, just the
output. It reports how it read each file, like:

```
read as: date from "Posted Date"; amount from "Credit" (in) and "Debit" (out)
```

If it guessed a column wrong, that line shows it, and I'll fix the parser for
your specific bank's format. That's the whole debugging loop.

## What never happens

- No password, PIN, or login is ever entered — by me or into this tool
- No connection to any bank; the tool makes no network calls at all
- `.ledger/` is gitignored, so your data cannot be committed by accident
- Files stay where they are; they're read, never copied or moved
