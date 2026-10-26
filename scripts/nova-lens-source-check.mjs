#!/usr/bin/env node
/** One explicitly requested public BID13 source check. No repeating watcher. */
import '../apps/extension/lens-core.js';
const url = process.argv[2];
let u;
try { u = new URL(url); } catch { throw new Error('Usage: node scripts/nova-lens-source-check.mjs https://bid13.com/node/UNIT_ID'); }
if (u.origin !== 'https://bid13.com' || u.search || u.hash || !/^\/(?:node\/\d+|storage-auctions\/[a-z0-9/_-]+)$/.test(u.pathname)) throw new Error('Only an explicit public BID13 listing is supported.');
const r = await fetch(u, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
if (!r.ok) throw new Error(`Source returned HTTP ${r.status}`);
const text = await r.text(); if (text.length > 1000000) throw new Error('Source exceeds size limit.');
const s = globalThis.NovaLens.parseBid13Html(text, u.href);
console.log(JSON.stringify({ title: s.title, sourceUrl: s.url, observedAt: s.observedAt, currentBid: s.price, currency: s.currency, refundableDeposit: s.deposit, scheduledClosingTime: s.endsAt, claimWindowDays: s.pickupDays, termsCaptured: !!s.terms, provenance: s.provenance, resaleValue: null }, null, 2));
