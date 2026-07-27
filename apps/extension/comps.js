/**
 * Nova Lens — comp selection.
 *
 * Kept separate from content.js so it can be unit-tested in Node without a
 * browser or a live eBay page (eBay 403s every automated client, so the only
 * way to verify this logic is against fixtures).
 *
 * The failure this exists to prevent: a sold-listings search for an item also
 * returns its cables, manuals, empty cases and "for parts" shells. Selecting
 * prices without checking WHAT they are priced makes the junk the median, and
 * the tool then confidently tells you the max buy is $1.86. A relative outlier
 * filter cannot save you there — when the junk is the majority, the junk IS
 * the median. Relevance has to be decided from the title, not the price.
 */
(function (root) {
  'use strict';

  const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'of', 'to', 'by', 'new',
    'used', 'oem', 'genuine', 'original', 'authentic', 'free', 'fast', 'ship',
    'shipping', 'lot', 'set', 'great', 'good', 'excellent', 'condition', 'works',
    'working', 'tested', 'nice', 'vintage', 'rare', 'htf', 'euc', 'nwt', 'nib',
  ]);

  // Words that mark a listing as a PART or ACCESSORY of the thing, not the thing.
  const ACCESSORY = [
    'case', 'cases', 'cover', 'skin', 'sleeve', 'pouch', 'bag', 'strap', 'straps',
    'band', 'bands', 'watchband', 'wristband', 'bracelet', 'belt', 'dock',
    'protector', 'glass', 'lens', 'buckle', 'clasp', 'pins', 'link', 'links',
    'charger', 'charging', 'cable', 'cord', 'adapter', 'adaptor', 'power supply',
    'battery', 'batteries', 'manual', 'instructions', 'booklet', 'insert',
    'box only', 'empty box', 'empty', 'replacement', 'screen protector',
    'stand', 'mount', 'holder', 'bracket', 'remote only', 'sticker', 'decal',
    'screws', 'screw', 'bit', 'bits', 'blade', 'blades', 'filter', 'filters',
    'bag only', 'lid', 'handle', 'knob', 'button', 'spring', 'gasket',
  ];

  // Listings that are explicitly broken/incomplete sell for a fraction of the
  // working item's price and must not set the resale band.
  const BROKEN = [
    'for parts', 'not working', 'parts only', 'as is', 'as-is', 'broken',
    'damaged', 'repair', 'cracked', 'faulty', 'defective', 'untested', 'read description',
  ];

  function normalize(s) {
    return String(s || '')
      // eBay appends this to result titles with NO separating space, so
      // "Band Strap" arrives as "Band StrapOpens in a new window or tab" and
      // the token becomes "strapopens" — which silently defeated every
      // word-boundary check below. Strip it before anything else.
      .replace(/opens in a new window or tab/gi, ' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(s) {
    return normalize(s)
      .split(' ')
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  }

  /**
   * Model numbers are the highest-precision signal a flipper has: "DCD771C2",
   * "WH1000XM5", "A2338". Anything mixing letters and digits, or a long digit
   * run, is treated as one.
   */
  function modelTokens(s) {
    return tokens(s).filter(
      (t) => (/[a-z]/.test(t) && /[0-9]/.test(t) && t.length >= 4) || /^[0-9]{4,}$/.test(t)
    );
  }

  // Word-boundary matching only. A substring test looks equivalent and is not:
  // "cordless" contains "cord", which flagged a cordless drill as an accessory
  // and silently disabled this entire filter.
  function containsAny(haystack, phrases) {
    const n = ' ' + normalize(haystack) + ' ';
    return phrases.some((p) => n.includes(' ' + normalize(p) + ' '));
  }

  /**
   * Is this listing selling an ACCESSORY, or the product bundled WITH one?
   *
   * The word alone cannot tell you: "Battery for DCD771C2" is an accessory,
   * "Drill Kit with Battery and Charger" is the product and belongs in the
   * comps. Position decides it — anything after "with"/"includes" is a bundled
   * extra, so only the head of the title says what is actually being sold.
   */
  function sellsAnAccessory(title) {
    const n = ' ' + normalize(title) + ' ';
    const marks = [' with ', ' includes ', ' including ', ' incl ', ' plus ', ' bundle '];
    const cuts = marks.map((m) => n.indexOf(m)).filter((i) => i >= 0);
    const head = cuts.length ? n.slice(0, Math.min(...cuts)) : n;
    return containsAny(head, ACCESSORY);
  }

  /** Fraction of the source item's distinctive words that the comp also has. */
  function relevance(sourceTitle, compTitle) {
    const src = [...new Set(tokens(sourceTitle))];
    if (src.length === 0) return 0;
    const comp = new Set(tokens(compTitle));
    const hits = src.filter((t) => comp.has(t)).length;
    return hits / src.length;
  }

  /**
   * Decide which harvested {title, price} rows may set the resale band.
   * Returns { comps, kept, rejected, reasons } — rejections are counted so the
   * card can explain itself rather than silently returning a strange number.
   */
  function selectComps(sourceTitle, rows, opts) {
    const options = opts || {};
    const minRelevance = options.minRelevance == null ? 0.45 : options.minRelevance;
    const srcModels = modelTokens(sourceTitle);
    const srcIsAccessory = sellsAnAccessory(sourceTitle);
    const srcIsBroken = containsAny(sourceTitle, BROKEN);
    const reasons = { accessory: 0, broken: 0, irrelevant: 0, model_mismatch: 0 };
    const kept = [];

    for (const row of rows || []) {
      const title = row && row.title;
      const price = Number(row && row.price);
      if (!title || !Number.isFinite(price) || price <= 0) continue;

      // A part is not the product — unless the user is literally selling the part.
      if (!srcIsAccessory && sellsAnAccessory(title)) { reasons.accessory++; continue; }
      // Broken units are a different market than a working one.
      if (!srcIsBroken && containsAny(title, BROKEN)) { reasons.broken++; continue; }

      if (srcModels.length > 0) {
        // With a model number available, demand it. This is the strongest filter
        // we have and it is what stops cables from pricing a power tool.
        const compTokens = new Set(tokens(title));
        if (!srcModels.some((m) => compTokens.has(m))) { reasons.model_mismatch++; continue; }
      } else if (relevance(sourceTitle, title) < minRelevance) {
        reasons.irrelevant++;
        continue;
      }
      kept.push({ title, price });
    }

    return { comps: kept.map((k) => k.price), kept, rejected: (rows || []).length - kept.length, reasons };
  }

  /** Second pass: drop absurd values once we know the set is on-topic. */
  function rejectOutliers(prices) {
    if (!prices || prices.length < 4) return prices || [];
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (!(median > 0)) return prices;
    const keep = prices.filter((p) => p >= median * 0.25 && p <= median * 3);
    return keep.length >= 3 ? keep : prices;
  }

  /**
   * The coherence guard. Even after filtering, a comp set can be nonsense —
   * too few rows, or a median so far below the asking price that something is
   * clearly wrong with the match. In that case the honest output is "I can't
   * read this one," never a confident number.
   */
  function assessCoherence(prices, askingPrice) {
    if (!prices || prices.length < 3) {
      return { ok: false, reason: 'Not enough matching sold listings to price this honestly.' };
    }
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const asking = Number(askingPrice);
    if (Number.isFinite(asking) && asking > 0 && median < asking * 0.12) {
      return {
        ok: false,
        reason: 'The matched sold listings are worth a fraction of the asking price — the comps look like a different product, so no verdict is given.',
      };
    }
    return { ok: true, median };
  }

  const api = { normalize, tokens, modelTokens, relevance, selectComps, rejectOutliers, assessCoherence, ACCESSORY, BROKEN };
  root.NovaComps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
