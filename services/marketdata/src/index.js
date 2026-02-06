'use strict';

// NOTE: This file previously contained a stub implementation (with fabricated numbers).
// The real Marketdata service lives in `src/index.ts` and is compiled to `dist/index.js`.
// Keeping this file as a thin shim prevents accidental usage of the old stub.

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  module.exports = require('../dist/index.js');
} catch (_err) {
  throw new Error(
    'Marketdata service build output not found. Run `npm run build` in services/marketdata, or start via `npm run dev`.'
  );
}
