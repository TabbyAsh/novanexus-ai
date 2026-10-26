export type Source = { name: string; group: string; url: string; coverage: string; signal: string };
export const sources: Source[] = [
  { name: 'BID13', group: 'Auctions', url: 'https://bid13.com/auctions', coverage: 'Listing refresh in Deal Desk; optional Lens browser watch', signal: 'Visible contents, current bid, closing time, full cleanout terms.' },
  { name: 'HiBid', group: 'Auctions', url: 'https://hibid.com', coverage: 'Open source / capture manually', signal: 'Exact lot, auctioneer premium, pickup window and shipping eligibility.' },
  { name: 'GovDeals', group: 'Auctions', url: 'https://www.govdeals.com', coverage: 'Open source / capture manually', signal: 'Surplus condition, loading help, payment and removal deadlines.' },
  { name: 'Public Surplus', group: 'Auctions', url: 'https://www.publicsurplus.com/sms/browse/home', coverage: 'Open source / capture manually', signal: 'Government surplus, actual quantity, inspection and removal terms.' },
  { name: 'StorageTreasures', group: 'Auctions', url: 'https://www.storagetreasures.com', coverage: 'Direct site review; automated access unavailable at check', signal: 'Visible goods, facility terms, refundable deposit and cleanout scope.' },
  { name: 'EstateSales.NET', group: 'Auctions', url: 'https://www.estatesales.net', coverage: 'Open source / capture manually', signal: 'Dated local sales, photographed items and sale conditions.' },
  { name: 'Liquidation.com', group: 'Auctions', url: 'https://www.liquidation.com', coverage: 'Direct site review; automated access unavailable at check', signal: 'Manifest versus unmanifested stock, freight, condition and return terms.' },
  { name: 'eBay sold results', group: 'Demand', url: 'https://www.ebay.com', coverage: 'Lens captures visible sold rows; you confirm item matches', signal: 'Recent exact-model sold prices, shipping and condition. Hidden offers stay unknown.' },
  { name: 'SAM.gov opportunities', group: 'Business', url: 'https://sam.gov/opportunities', coverage: 'Open source / capture manually', signal: 'Specific buyer requirements, eligibility, response deadline and delivery obligations.' },
  { name: 'SEC EDGAR', group: 'Markets', url: 'https://www.sec.gov/edgar/search/', coverage: 'Primary filings / manual research', signal: 'Dated filings and business events. A filing alone is not a trading edge.' },
];
export function sourceSearch(source: Source, query: string) {
  const terms = query.trim().slice(0, 200);
  if (!terms) return source.url;
  if (source.name === 'eBay sold results') {
    const u = new URL('https://www.ebay.com/sch/i.html');
    u.searchParams.set('_nkw', terms); u.searchParams.set('LH_Sold', '1'); u.searchParams.set('LH_Complete', '1'); return u.href;
  }
  const u = new URL('https://www.google.com/search');
  u.searchParams.set('q', 'site:' + new URL(source.url).hostname + ' ' + terms); return u.href;
}
export type SignalNote = { id: string; title: string; url: string; observedAt: string; thesis: string; demand: string; costs: string; deadline: string; next: string };
export function validSourceUrl(raw: string) {
  try { const u = new URL(raw); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || raw.length > 2000) return null; return u.href; } catch { return null; }
}
export function validNote(n: unknown): n is SignalNote {
  if (!n || typeof n !== 'object') return false;
  const x = n as Record<string, unknown>;
  return ['id','title','url','observedAt','thesis','demand','costs','deadline','next'].every(k => typeof x[k] === 'string' && (x[k] as string).length <= 5000) && !!validSourceUrl(x.url as string) && Number.isFinite(Date.parse(x.observedAt as string));
}
export function signalBrief(n: SignalNote) {
  return [
    'NOVA OPPORTUNITY REVIEW — source-linked, no execution authorized',
    n.title, 'Source: ' + n.url, 'Operator observation recorded: ' + n.observedAt,
    'Why it may matter (operator thesis): ' + (n.thesis || 'Unknown'),
    'Demand evidence / sold comparisons to verify: ' + (n.demand || 'Missing — value unestablished'),
    'All-in costs / assumptions / unknowns: ' + (n.costs || 'Unknown — no bid ceiling established'),
    'Deadline and timezone, if checked: ' + (n.deadline || 'Unknown'),
    'Next verification: ' + (n.next || 'Check the original source and constraints'),
    'Refresh the source. Separate facts from assumptions, show provenance and date, test the demand claim and full economics, then give pursue / watch / pass with blockers. Do not bid, spend or send messages.',
  ].join('\n\n');
}
