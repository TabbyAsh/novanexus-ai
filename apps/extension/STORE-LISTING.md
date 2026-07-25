# Nova Lens — Chrome Web Store submission kit

Everything below is paste-ready. The package is built and verified:
`apps/extension/dist/nova-lens-v0.1.0.zip` (8 files, 25.7 KB).

Rebuild after any code change:
```bash
node apps/extension/make-icons.js && node apps/extension/package.js
```

---

## Before you upload — verify it works in YOUR browser (5 minutes)

eBay blocks every automated browser, so this last step is the one thing that
cannot be verified from the terminal. Do it once before submitting.

1. `chrome://extensions` → Developer mode ON → **Load unpacked** →
   select `apps/extension` (the folder, not the zip).
2. Open any eBay listing — an `/itm/` page.
3. The Nova Lens card should appear top-right within ~2 seconds, showing:
   verdict, max buy, sold range, fees + shipping, net profit, confidence,
   and the comps count in the header ("N real sold comps").
4. Sanity-check the number: click **See sold comps** and confirm the range
   matches what eBay actually shows. If the header says "no comps found",
   the harvest selector needs updating — that is a real bug, report it.

If the card says it could not read the listing, that is the honest failure
state, not silence — eBay changed its markup and the selectors need a refresh.

---

## Listing fields

**Name** (45 char limit — this is 37)
```
Nova Lens — instant eBay flip verdict
```

**Short description** (132 char limit — this is 122)
```
Open any eBay listing. Nova pulls real sold comps and shows your max buy, net profit after fees, and a verdict. No typing.
```

**Category:** Shopping
**Language:** English (United States)

**Detailed description**
```
Nova Lens tells you whether an eBay listing is actually worth buying — before you buy it.

Open any eBay listing. Nova Lens reads the item, pulls recent SOLD prices for that
exact item from eBay's own sold-listings search, and shows you a verdict card:

• MAX BUY — the most you can pay and still make money
• NET PROFIT — after eBay fees and shipping, not before
• SOLD RANGE — what it actually sells for, not what sellers are asking
• CONFIDENCE — based on how many real comps backed the number
• A one-click offer message you can send the seller

WHY SOLD PRICES MATTER
Asking prices tell you what sellers hope for. Sold prices tell you what buyers
paid. Nova Lens only uses sold prices, pulled from your own eBay view.

HONEST BY DESIGN
If Nova can't find enough real comps, it says so and caps its confidence rather
than inventing a number. Accessory and bulk-lot listings that pollute a search
are filtered out before the math, because a battery pack is not a drill.

NO ACCOUNT REQUIRED
No signup, no login, no credit card. Install it and open a listing.

PRIVACY
Nova Lens runs only on eBay listing pages. It never sees your eBay password,
cookies, or payment details, and it does not track your browsing.
Full policy: https://novanexus-ai.com/privacy

Decision support, not a guarantee. Resale estimates reflect market data and may
not match your actual sale.
```

---

## Privacy tab (Chrome requires each of these)

**Single purpose**
```
Nova Lens has one purpose: on an eBay listing page, it estimates the item's
resale value from recent sold listings and shows whether buying it at the
asking price would be profitable.
```

**Justification — host permission `abackend-production.up.railway.app` / `novanexus-ai.com`**
```
The extension sends the listing's title, asking price, condition, shipping cost,
and the harvested sold prices to Nova's appraisal API, which computes the resale
band, fees, net profit and verdict, and returns them for display. No other
network access is used.
```

**Remote code:** No — all logic ships inside the package.

**Data collected:** check only **Website content**.
Do NOT check: PII, health, financial and payment information (the extension reads
a public listing price, never the user's payment data), authentication
information, personal communications, location, web history, or user activity.

**Certifications** — all three are true, tick them:
- Not being sold to third parties, outside of approved use cases
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://novanexus-ai.com/privacy
```
(Section 10 of that page covers this extension specifically.)

---

## Screenshots — the one asset only you can make

Chrome requires at least one **1280×800** or **640×400** screenshot. Take these
from a real eBay listing with the card visible:

1. The card on a listing where the verdict is **BUY** or **NEGOTIATE** — this is
   the money shot; make sure max buy and net profit are legible.
2. The card on a listing where the verdict is **PASS** — proves it will tell you
   no, which is the credibility shot.
3. (Optional) The header showing "N real sold comps".

Crop to 1280×800. No mockups, no fake numbers — real listings only.

---

## Submission steps

1. Pay the one-time $5 developer registration fee at
   https://chrome.google.com/webstore/devconsole (Google account, one time, ever).
2. **New item** → upload `apps/extension/dist/nova-lens-v0.1.0.zip`.
3. Paste the fields above; upload screenshots.
4. Submit for review. Review typically takes a few days; extensions with narrow
   host permissions and no remote code clear faster, which is why this one asks
   for nothing beyond the two API hosts.

## Why this channel

The Web Store has its own search traffic. People type "ebay profit calculator"
and "flip calculator" into it every day — buyers at the exact moment of intent,
reachable without an audience, without posting daily, and without ad spend.
It is the one distribution asset here that compounds while nobody is looking.
