# Nova Enterprises — brand sheet v1 (2026-10-29)

## Direction: "Command deck"
Nova is presented as an operating company run from a single console. The page reads like a status board: a dark instrument-panel ground, a warm amber signal colour (Nova's "ember"), monospaced coordinate-style labels, and an honest per-division status readout (Current / By inquiry / In development). It ties forward to Atlas and Nova Core without claiming they exist, and stays plain enough for a buyer or a mill.

## Wordmark (brand/wordmark.svg)
A reticle mark — a ring with four cardinal ticks and a filled core — reads as "star / point of focus / map crosshair" (Nova + Atlas). Beside it, NOVA in Space Grotesk Bold, wide-tracked (+0.18em), with ENTERPRISES LLC in IBM Plex Mono beneath. Mark in accent; word in text colour. Minimum mark size 24px. On light ground use #8F5300 mark and #12161C text. `wordmark.svg` (dark ground) and `wordmark-light.svg` have all text outlined to paths — no font dependency. App/favicon icons are in `brand/icons/` (see `icons-contact-sheet.png`).

## Palette and contrast (WCAG 2.x, computed)
Dark (default)
| Token | Hex | on bg #0B0E13 | on surface #121821 | on surface-2 #1A2230 |
|---|---|---|---|---|
| text | #ECE6D8 | 15.53 | 14.32 | 12.83 |
| muted | #A3ACB9 | 8.43 | 7.77 | 6.96 |
| accent (ember) | #F5A524 | 9.47 | 8.73 | 7.82 |
| current (green) | #6FD394 | 10.51 | 9.69 | 8.68 |
| inquiry (blue) | #7CC4FF | 10.31 | 9.50 | 8.51 |
| in development (violet) | #C9A8FF | 9.69 | 8.94 | 8.00 |
| line (UI borders, non-text) | #5A6676 | 3.31 | 3.05 | 2.73 (decorative only here) |
Button text #1A1205 on accent #F5A524: 9.09.

Light variant ([data-theme="light"])
| Token | Hex | on bg #F6F3EC | on surface #FFFFFF | on surface-2 #ECE7DC |
|---|---|---|---|---|
| text | #12161C | 16.38 | 18.15 | 14.72 |
| muted | #4A5361 | 7.02 | 7.77 | 6.31 |
| accent | #8F5300 | 5.56 | 6.17 | 5.00 |
| current | #1D6F40 | 5.57 | 6.18 | 5.01 |
| inquiry | #1C5A9E | 6.30 | 6.99 | 5.67 |
| in development | #6237AD | 7.10 | 7.87 | 6.38 |
| line | #7A8494 | 3.41 | 3.78 | 3.07 |
Button text #FFFFFF on accent #8F5300: 6.17.

All text pairs pass AA (4.5:1) and in fact AAA except light accent/current on surface-2 (5.0, AA). Status is never colour-only: every badge carries its word, and "In development" uses a hollow dot.

## Type (free fonts only)
- Display: Space Grotesk 500/700 (OFL) — headings, wordmark.
- Body: Inter 400/500/600 (OFL).
- Labels/data: IBM Plex Mono 400/500 (OFL) — uppercase, 0.14em tracking.
- Self-hosted in `brand/fonts/` (woff2, latin subset, from @fontsource 5.3.0) via `fonts.css`, imported at the top of `tokens.css`; `font-display: swap`. OFL 1.1 licenses: `OFL-Inter.txt`, `OFL-SpaceGrotesk.txt`, `OFL-IBMPlexMono.txt`. No Google Fonts requests.
- Scale: 13 / 15 / 17 / 20 / 24–32 / 32–48 / 40–64px (fluid clamps).

## Voice
Plain, specific, first-person-plural only where true. State what exists now, what is open for inquiry, and what is in development — in that order. No proof we don't have: no client names, stats, testimonials, certifications, prices, or partner logos. Prefer "written quote", "confirmed in writing", "nothing is committed until you approve". Do not claim a lead is checked; use "Researched".

## Components
- Nav: sticky, 64px, wordmark left; links (Divisions, How we work, Contact) + primary "Request a quote". Under 640px only the button remains (no JS menu needed).
- Hero: label (location) → H1 company name → ember subline → muted lede → primary + ghost buttons; right column "Division status" console.
- Division card: index, status badge, H3, body, text link; top border colour = status.
- Badges: Current (green), By inquiry (blue), In development (violet, hollow dot). Mono, uppercase, pill.
- Buttons: 44px min height; primary ember fill; ghost with 3:1 line border; focus ring 2px bg gap + 2px accent.
- Contact block: name, role, email, phone, location.
- Forms: sourcing quote open; research and supplier forms inside <details> disclosures. Field names/ids/actions unchanged from PR #58.
- Footer: LLC name, Terre Haute IN, Indiana LLC · NAICS 425120, email, phone, Privacy, back to top.

## Homepage layout (copy slots)
1 Header · 2 Hero + status console · 3 Divisions (3 cards) · 4 How we work (3 steps + buyers/suppliers notes) · 5 Contact & intake (contact card + 3 forms) · 6 Footer.

## Notes for Dev
- Forms post to /api/intake as in PR #58; keep hidden inquiry_type/request_id and company_website honeypot. PR's script.js (request_id fill, data-service preselect) should be wired to the new markup; the "Leave a note for later" link points to #services (a details element) — script should open it and preselect software_ai.
- The PR's #products/#research/#software/#trade anchors are not present in v2; add redirects/IDs if external links use them.
- Light theme: set data-theme="light" on <html>; add a toggle later if wanted.
- Outline wordmark text to paths; generate favicon from the reticle mark.
- Uses CSS color-mix() for header translucency; older browsers fall back to no background — add a solid fallback if needed.
