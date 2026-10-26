import { sourceSearch, sources, signalBrief, validNote, validSourceUrl } from '../signals';
describe('source-linked opportunity intake', () => {
  it('never opens script URLs or URLs with credentials', () => {
    expect(validSourceUrl('javascript:alert(1)')).toBeNull();
    expect(validSourceUrl('https://user:secret@example.com')).toBeNull();
    expect(validSourceUrl('https://example.com/lot?id=123')).toContain('?id=123');
  });
  it('uses actual sold-results filters on eBay and explicit site searches elsewhere', () => {
    const sold = new URL(sourceSearch(sources.find(s => s.name === 'eBay sold results')!, 'Exact model'));
    expect(sold.searchParams.get('LH_Sold')).toBe('1');
    expect(sold.searchParams.get('_nkw')).toBe('Exact model');
    expect(new URL(sourceSearch(sources[1], 'printer')).searchParams.get('q')).toBe('site:hibid.com printer');
  });
  it('keeps missing evidence and costs unknown in the review brief', () => {
    const note = { id: '1', title: 'Visible item', url: 'https://example.com/lot', observedAt: '2026-10-26T12:00:00Z', thesis: '', demand: '', costs: '', deadline: '', next: '' };
    expect(validNote(note)).toBe(true);
    expect(validNote({ ...note, url: 'data:text/html,hello' })).toBe(false);
    expect(signalBrief(note)).toContain('value unestablished');
    expect(signalBrief(note)).toContain('no bid ceiling established');
    expect(signalBrief(note)).toContain('Do not bid, spend or send messages');
  });
});
