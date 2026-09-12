# Nova Contrast Lab, release 1

Route: `/lab/contrast`. This is an additive Next.js client page in the existing Nova app. Homepage changes are limited to one navigation link. Nova Loop, authentication, billing, and backend services are unchanged.

## Repository discovery and baseline

The production `/api/version` endpoint identified `ec005fe91bd4314092c1ce3bc43086df2e8223a0`, the head of `codex/revenue-doorway-hardening`, when implementation began. The older `master` branch does not contain the live Nova Loop homepage. Work therefore starts from that verified deployed source on `codex/nova-contrast-lab`.

Stack: npm workspaces, Next.js 16.3.0, React, TypeScript, Tailwind and scoped CSS, Jest/ts-jest, Playwright. Frontend deployment uses the existing Vercel `nova-enterprises` project; Railway hosts unrelated backend services. No repository AGENTS file existed initially. Next development generated its documented framework guidance; relevant installed routing and client-component guides were read.

## Run and verify

From the repository root, using the existing npm lockfile:

```sh
npm ci --legacy-peer-deps --ignore-scripts
npm run dev --workspace=@nova/web
# Open http://localhost:4000/lab/contrast
npm test --workspace=@nova/web -- --runInBand
npx tsc --noEmit -p apps/web/tsconfig.json
npm run lint --workspace=@nova/web
npm run build --workspace=@nova/web
```

End-to-end browser checks use the existing Playwright configuration, narrowed to the new suite. Set `PROD_WEB_URL` to the local or authorized preview origin (the legacy default otherwise targets production):

```sh
npx playwright install chromium
cd apps/web
PROD_WEB_URL=http://localhost:4000 npx playwright test e2e/contrast.spec.ts --workers=1 --reporter=list
```

PowerShell: `$env:PROD_WEB_URL='http://localhost:4000'` followed by the same `npx playwright test` command. These checks create/edit projects, execute workers, exercise contradictions and channel rejection, export actual downloads, reimport them, test optional device storage and deletion, inspect mobile overflow, and check that a private content marker is absent from network requests.

## Core contract

`apps/web/src/lib/contrast` is UI-independent typed code:

- `schema.ts`: `nova-contrast/1`, validation, JSON import/export, numeric bins.
- `adapters.ts`: a closed registry of trusted adapters. No dynamic code import or uploaded code execution.
- `compiler.ts`: channel-specific equivalence closure, chains witnessing contradictions, admissibility, set cover, and ambiguity-preserving lookup.
- `bundle.ts`: JSON bundle, readable report, standalone decoder, machine-readable relational tests, and generated Jest tests.
- `contrast.worker.ts`: isolated local computation; the UI can terminate it.

IDs begin with a letter followed by letters, digits, `_` or `-` (64 characters maximum); names have at most 160 characters. Costs are nonnegative integer units up to 1,000,000. Use a smaller common cost unit for fractional economics. Categorical values are exact strings or booleans; `null` or an omitted cell is unknown. A numeric observation declares strictly increasing `boundaries`; bins are `(-infinity,b0)`, `[b0,b1)`, ..., `[last,infinity)`. Its public normalized values are `bin:0`, `bin:1`, etc. Raw values are retained in the owner-facing analysis bundle. No epsilon or approximate-equality semantics are supported.

Equivalence closure is computed separately for each channel. An enabled candidate is rejected on a channel if any two cases in a required equivalence class have different known normalized values. Missing data in such a class makes preservation unverified and the candidate inadmissible. Missing distinction data is reported separately from identical complete observations. An internal channel never implicitly becomes a public channel.

Selection minimizes the sum of independent observation costs **per channel**, covering every coverable declared distinction. It does not claim impossible distinctions are covered, jointly optimize shared acquisition costs across channels, or certify a contradictory channel. Exact search applies to at most 18 useful admissible observations and 128 coverable distinctions. It enumerates all subsets using a BigInt coverage mask. Larger instances use greedy uncovered-coverage per cost, explicitly labeled heuristic. Zero-cost useful candidates take priority in the heuristic. Exact equal-cost solutions prefer fewer candidates, then the first subset in stable ASCII ID order. Heuristic ties use stable ID order (zero-cost ties first prefer larger gain).

Hard limits are 80 cases, 48 observations, 8 channels, 400 requirements, and 1 MB import text. Sequence histories contain at most 256 A/B events. The browser worker is canceled after 10 seconds; users can also cancel it. Exact search does not run on the UI thread. These are finite, bounded analyses, not proofs of arbitrary future executions.

## Examples and real integration

Sequence Witness executes event histories. An order flag means at least one strict earlier event, not that the history started with that event. AB gives `1,1,1,0`; BA `1,1,0,1`; ABA and BAB both `1,1,1,1`. It is a logic simulation, with no physical-sensor or damage-validation claim. The default example intentionally contains the unresolved ABA/BAB distinction.

The channel and contradiction examples use the same compiler. The Nova serializer adapter calls the existing production `serializeStructuredData` function in `public-structured-data.ts`. Independent assertions check that literal `<` becomes the JSON escape `\\u003c`, while decoding preserves original text and distinguishes it from literal escape text. This executes a non-destructive real Nova code path; no account or remote API is involved.

## Artifacts outside the page

`node scripts/contrast-export.cjs` regenerates six samples in `examples/contrast` and two executable Jest files in the core test directory. The generator loads only trusted repository TypeScript; it never evaluates case inputs. Each bundle includes the validated project, observation provenance, normalized/raw evidence, selected IDs, decoder data, contradictions, uncovered requirements, incomplete cases, collisions, and a machine-readable test specification. Its `files` object contains `decoder.cjs`, `requirements.test.ts`, `report.md`, and the adapter contract. Extract those strings as UTF-8 files to use them independently.

The standalone decoder needs only Node.js:

```sh
node -e "const d=require('./examples/contrast/sequence.decoder.cjs'); console.log(d.decode('inspection',[true,true]))"
# ambiguous, candidates ABA and BAB (even in the sample with no requirement to separate them)
```

Unknown vectors return unknown; compatible incomplete rows may add candidates, never establish unique classification. An empty selected vector may match many cases. This is lookup over supplied cases, not a classifier for unseen physical states.

Generated Jest tests call the actual adapter registry and compare resulting observation vectors using independently declared same/different requirements. They do not calculate expected vectors with the implementation under test. Equivalence tests check all enabled releases on their channel, including a release the compiler rejected. If no observation was selected for a distinction, admissible available observations are used so a complete collision can fail an actual test. Model-only tests are `todo` pending adapter integration. Export itself never says tests passed.

```sh
node scripts/contrast-export.cjs
npm test --workspace=@nova/web -- --runInBand exported-sequence.test.ts exported-nova-serializer.test.ts
```

Fault demonstration:

```sh
node scripts/contrast-export.cjs --mutation
npm test --workspace=@nova/web -- --runInBand exported-mutation.test.ts
# Must fail: force A-before-B to false, which collapses BA and ABA for requirement r3.
```

The mutation is a temporary Jest mock in `exported-mutation.test.ts`, never a change to the production adapter. Remove only that generated file after the experiment before running the full suite. `scripts/contrast-export.cjs --mutation` retains the reproducible fault recipe; the failing generated file is not shipped.

## Storage, privacy, and unsupported claims

Projects stay in component memory by default. Import/export are explicit. Device save uses only `nova-contrast-project-v1`, is never automatically loaded, and has explicit deletion. It is not encrypted storage. The existing Nova Loop storage implementation is untouched. No lab code sends case data to a server, model, analytics service, URL, or error telemetry. Existing site-level aggregate page analytics are unchanged; the lab emits no custom analytics events. Browser exports include **all supplied inputs and channels**, including internal information, so they are owner artifacts and must be reviewed before sharing.

Adapters accept `observe(adapterId, caseInput, operation) -> string | boolean | number | null`. Inputs are strings/JSON data. New external adapters must be implemented in trusted repository code, return missing observations as null, and be tested against separately declared contracts. The website does not load plugins or execute uploaded JavaScript. Tables without adapters are model analysis, not tests of the external system they describe.

Nothing here establishes sensor calibration, hardware feasibility, physical safety, novel patents, product demand, or correctness beyond the supplied finite model and observation channels.

## Deployment and rollback

Use the existing Vercel project and a **preview** deployment, never `scripts/deploy-web.js` (that script targets production). No new services or database are needed. A preview has its own URL and does not change `novanexus-ai.com` aliases. Verify `/lab/contrast` through the deployed application and the deployment's source identity. Production promotion is outside this release.

Rollback of the preview is removal of that preview deployment; the existing production deployment remains unchanged. If this feature is later merged/promoted, revert the additive Contrast Lab commit and its navigation link, or restore the previously verified deployment through the existing release workflow.

See the delivered evidence report for actual local commands, results, preview status, and limitations; commands documented here are instructions, not claims they already ran.
