# Nova Instrument Forge

Open `/lab/forge`, change **Assemble** from 4 to 6, and watch process capacity change from 4 to 5 units/hour. The Pack stage now limits it. Download HTML, open the file offline, and keep changing the inputs. Import `examples/instrument-forge/workshop.spec.json` to obtain a different calculator without changing the renderer.

This is a bounded specification interpreter and calculator renderer. It accepts supported JSON specifications, not arbitrary prose. There is no model call or prose-to-spec service. The downloadable specification guide is suitable for giving another model the required format.

## Source and integration

The existing repository uses npm workspaces, Next.js 16.3.0, React, TypeScript, Jest and Playwright, with Vercel's existing Git-based preview deployment. Framework instructions and installed routing/client-component documentation were read before editing. Work is additive on `codex/nova-instrument-forge`, based on Contrast Lab commit `84171db20f24f156ce9df09e0100f5a8eca35fef`.

- `apps/web/src/lib/instrument/types.ts`: versioned specification and saved-document types.
- `runtime.ts`: validation, dimensional checking, exact fraction arithmetic, formula evaluation, constraints, formatting and chart data. UI-independent; no React or service dependency.
- `export.ts`: standalone HTML builder and trusted DOM renderer, containing the same engine factory used by Nova. Only trusted implementation functions are serialized as code; imported specifications remain escaped JSON data.
- `examples/*.json`: process capacity and workshop budget. Both pass through the same parser and renderer.
- `guide.ts`: inspectable format instructions for people and models.
- `apps/web/src/app/lab/forge`: additive route and interface, using Nova's cream/green visual style.
- `scripts/instrument-export.cjs`: trusted local utility for exporting an input specification to a new standalone HTML file or regenerating the shipped examples.

The homepage receives one navigation link. Contrast Lab, Nova Loop, authentication, backend services and storage behavior are preserved. The web TypeScript configuration now excludes generated browser download/report directories; downloaded test artifacts are not production source. No package or lockfile change is required.

## Run locally

From the repository root:

```sh
npm ci --legacy-peer-deps --ignore-scripts
npm run dev --workspace=@nova/web
```

Open `http://localhost:4000/lab/forge`. Use **localhost** for this development server; the installed Next.js version blocks development assets requested via an unconfigured alternate host such as 127.0.0.1. A production build does not have that development restriction.

The standalone files under `examples/instrument-forge/` need only a modern browser with JavaScript and BigInt. They have no external scripts, stylesheets, fonts, network calls or package installation requirement. Open `capacity.html` or `workshop.html` directly. `no-break-even.html` starts with a failing assumption and becomes usable when ticket price exceeds per-person cost.

Convert your own specification locally without starting Nova:

```sh
node scripts/instrument-export.cjs input.spec.json my-calculator.html
```

The explicit-file command refuses to overwrite an existing output. The input must be JSON data within the 200 KB bound. It does not load an adapter, script, URL or user-supplied JavaScript. With no arguments, the script regenerates only the known files under `examples/instrument-forge`.

## Supported contract

`InstrumentSpec` uses `schemaVersion: "nova-instrument/1"`. It declares a title, description, assumptions, typed numeric inputs with units/bounds/defaults/control increments, outputs with expressions and display precision, error/warning constraints, and optionally a bar chart. The first declared output receives primary visual emphasis. There are no example-specific branches in either renderer.

Expressions are trees with one of these forms:

```json
{"ref":"assemble"}
{"value":8,"unit":"h"}
{"op":"min","args":[{"ref":"prepare"},{"ref":"assemble"},{"ref":"pack"}]}
```

`add`, `multiply`, `min`, and `max` accept 2–16 operands. `subtract` and `divide` accept two; `abs`, `ceil`, and `floor` accept one. References may point forward to another output; cyclic and missing references fail validation. Unknown fields and operations are rejected. There is no eval, arbitrary function execution, conditional language, loop or network operation.

Supported units are `1`, `item`, `h`, `min`, `item/h`, `item/min`, `USD`, `USD/item`, and `USD/h`. Dimensions track item counts, time and USD. Minutes convert exactly to hours for computation. Arithmetic and comparisons enforce compatible dimensions; multiplication/division combine dimensions. Outputs and chart series must have the dimensions they declare. `ceil` and `floor` accept only dimensionless numbers and item counts, so rounding cannot silently depend on a choice between hours and minutes. Other currencies, exchange rates, units and nonlinear conversion rules are unsupported.

Accepted JavaScript number values are interpreted through their normalized decimal strings as exact fractions. Arithmetic, unit conversion, comparison, ceil and floor operate on those fractions. Thus 20 × 1.15 yields exactly 23 before flooring, and 300 ÷ (0.3 − 0.2) yields exactly 3000 before ceiling. Reduced numerator/denominator lengths are capped at 240 digits; intermediate and output magnitudes at 10^15. Numbers convert back to ordinary JavaScript numbers for display. Display rounding never feeds a formula. This does not support arbitrary-precision input strings or recover digits already lost by JavaScript/JSON numeric parsing.

Input-only constraints run before output calculations so invalid assumptions can produce useful messages before a divide-by-zero error. Failed error constraints clear the results; warning constraints preserve calculated outputs with a warning. An empty input is invalid, not zero. Editing inputs recomputes immediately; failed calculations show dashes instead of the last successful numbers.

Limits: 24 inputs, 24 outputs, 24 constraints, 24 chart series, 1000 expression nodes total, expression nesting depth 16, and 200 KB JSON. Input/default/bound/constant magnitudes are limited to 10^9. Inputs are numeric or integer, not text/category controls in this release. Input step is a control increment, not an additional divisibility constraint. The format guide in `examples/instrument-forge/instrument-spec-guide.md` contains full field descriptions and the examples provide complete specifications.

## Saving, import and privacy

Import accepts a bare InstrumentSpec or `nova-instrument-document/1`, which contains the specification and all current numeric input values. JSON export and offline HTML preserve current values; resetting restores the specification's original defaults. An invalid import keeps the current calculator intact. A file import is canceled if the user changes the calculator while its asynchronous file read is pending.

Projects live in component memory by default. Optional device saving uses only `nova-instrument-forge-v1`, never auto-loads, and includes deletion. It replaces this tool's single save, not another Nova tool's storage. It is not encrypted storage. The page does not transmit input or specification contents or place them in URLs. Existing site-wide aggregate analytics are unchanged; the tool emits no custom events. The offline file forbids network connections using its Content Security Policy and contains no analytics.

The exported runtime and renderer are self-contained trusted functions embedded in the HTML, alongside JSON with script-breaking characters escaped. The DOM renderer uses text nodes and input values for user text, never HTML interpretation. Changes to the engine must keep its runtime dependencies inside the factory. Browser tests exercise actual downloads from the built app, including a hostile text string and a separate offline browser context, to detect bundling regressions or accidental external dependencies.

## Examples and independent expected results

| Situation                                                                | Expected result                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Three serial stages at 6, 4, 5 units/hour; eight hours; target 36        | Capacity 4/hour, theoretical shift output 32, shortfall 4       |
| Raise only the 6/hour stage to 100/hour                                  | Capacity remains 4/hour                                         |
| Raise the 4/hour stage to 6/hour                                         | Capacity becomes 5/hour; eight-hour output 40                   |
| Stop any stage                                                           | Zero process capacity                                           |
| 40 attendees paying USD 25, per-person costs USD 10, fixed costs USD 300 | Revenue 1000, costs 700, remaining 300, break-even 20 attendees |
| Same workshop with only 10 attendees                                     | Remaining budget −150                                           |
| Ticket price equals per-person cost                                      | Blocked result with a specific break-even explanation           |

The process model assumes steady flow, one-to-one stage yields, sufficient buffering/supply, and no startup loss, downtime or defects. Its shift output is capacity under those assumptions, not a promise of actual completed work. The workshop model excludes taxes, refunds and other costs unless entered. There is no inference that these assumptions describe a particular business.

## Verification and deployment

```sh
npm test --workspace=@nova/web -- --runInBand
npx tsc --noEmit -p apps/web/tsconfig.json
npm run lint --workspace=@nova/web
npm run build --workspace=@nova/web
npx playwright install chromium
```

After building, in PowerShell:

```powershell
Set-Location apps/web
$env:PROD_WEB_URL = 'http://127.0.0.1:4000'
$env:CONTRAST_START_SERVER = '1'
npx playwright test e2e/forge.spec.ts e2e/contrast.spec.ts --workers=1 --reporter=list
```

The existing Playwright default otherwise points at production, so set the origin explicitly. The Forge suite tests real app navigation, arithmetic edits, failure states, file and pasted imports, a second and third independent specification, JSON round trips, all export types, opt-in storage/delete, mobile width and keyboard operation. It opens downloaded HTML under a network-disabled browser context, changes inputs, checks computed results and captures screenshots. Unit tests check independently stated answers, units, exact decimal rounding, constraints, validation bounds and unsafe imports. The existing Contrast Lab journeys run as regressions.

The dedicated GitHub workflow repeats web tests, types, lint, production build and both browser suites. Actual results and deployment identity are in the delivered evidence report; this document alone does not claim those commands passed.

Use the existing Vercel Git workflow to create a preview from this isolated branch. Do not use the root production-deployment script. Keep production aliases unchanged. The feature PR is stacked on the unmerged Contrast Lab branch so its diff is reviewable separately. Rollback is removal of the Forge preview and leaving its PR unmerged; after any later promotion, revert the additive Forge commit or restore the earlier deployment through Nova's established workflow.
