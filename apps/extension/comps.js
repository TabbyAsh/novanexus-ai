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
      // Model numbers are routinely hyphenated: HEG-001, SM-R820, WH-1000XM5.
      // Splitting on the hyphen destroys them ("heg" + "001" is neither a model
      // number nor anything useful), which silently disabled model matching on
      // most real listings. Join them back up first.
      .replace(/([a-z0-9])-([a-z0-9])/g, '$1$2')
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
      // Normalise to what the BUYER paid in total. A $32 item with $8 shipping
      // and a $40 item shipped free are the same $40 sale; comparing the raw
      // prices would treat them as a $8 spread that does not exist.
      const shipping = typeof row.shipping === 'number' ? row.shipping : null;
      const value = price + (shipping && shipping > 0 ? shipping : 0);
      kept.push({ title, price, shipping, value });
    }

    return { comps: kept.map((k) => k.value), kept, rejected: (rows || []).length - kept.length, reasons };
  }

  /**
   * "Free shipping", "+$8.95 shipping", "Not specified" → 0, 8.95, null.
   * null means UNKNOWN, which is not the same as zero and must not become it.
   */
  function parseShipping(text) {
    if (text == null) return null;
    const t = String(text).replace(/opens in a new window or tab/gi, ' ').trim();
    if (!t) return null;
    if (/free/i.test(t)) return 0;
    const m = t.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    if (!m) return null; // "not specified", "may not ship to…"
    const v = parseFloat(m[1]);
    return Number.isFinite(v) && v >= 0 && v < 1000 ? v : null;
  }

  /**
   * What it actually costs to ship this item, learned from sellers who moved
   * the same thing — rather than guessed from its category.
   *
   * Only CHARGED shipping is evidence. A "free shipping" sale does not mean
   * shipping was free; it means the seller buried the cost in the price, so it
   * tells us nothing about the cost and must not drag the estimate to zero.
   * If nobody charged separately, we have no evidence and say so, and the API
   * falls back to its category model.
   */
  function shippingEstimate(rows) {
    const charged = (rows || [])
      .map((r) => r && r.shipping)
      .filter((v) => typeof v === 'number' && v > 0);
    if (charged.length === 0) return { value: null, basis: 'no_evidence', observed: 0 };
    const s = [...charged].sort((a, b) => a - b);
    return { value: s[Math.floor(s.length / 2)], basis: 'observed', observed: charged.length };
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

  /**
   * Which search results are worth spending a comps lookup on.
   *
   * Every lookup is a request from the user's own session, so the budget is
   * small and must be spent well. Items with no model number rarely produce
   * trustworthy comps, and duplicates of the same listing waste the budget
   * outright. Sorted by price because a mispriced expensive item is worth more
   * than a mispriced cheap one, and the cheapest results are usually
   * accessories rather than bargains.
   */
  function prioritiseListings(rows, max) {
    const seen = new Set();
    const out = [];
    for (const r of rows || []) {
      if (!r || !r.title || !(r.price > 0)) continue;
      if (modelTokens(r.title).length === 0) continue;
      const key = normalize(r.title).slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    out.sort((a, b) => b.price - a.price);
    return out.slice(0, max || 25);
  }

  /**
   * The bar a find must clear before it is shown as an opportunity.
   * Both a floor and a margin: $12 on a $20 item is a real flip, $12 on a $400
   * item is noise dressed as one. A verdict the engine would not act on is
   * never promoted here either.
   */
  function clearsBar(result, opts) {
    const o = opts || {};
    const minProfit = o.minProfit == null ? 12 : o.minProfit;
    const minMargin = o.minMargin == null ? 0.22 : o.minMargin;
    const profit = Number(result && result.profit);
    const cost = Number(result && result.cost);
    const decision = result && result.decision;
    if (!Number.isFinite(profit) || !Number.isFinite(cost) || cost <= 0) return false;
    if (decision !== 'BUY' && decision !== 'NEGOTIATE') return false;
    return profit >= minProfit && profit / cost >= minMargin;
  }

  const api = { normalize, tokens, modelTokens, relevance, selectComps, rejectOutliers, assessCoherence, parseShipping, shippingEstimate, prioritiseListings, clearsBar, ACCESSORY, BROKEN };
  root.NovaComps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
