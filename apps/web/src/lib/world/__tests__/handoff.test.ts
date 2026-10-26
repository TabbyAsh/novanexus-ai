import { queueReview, takeReview } from '../review-handoff';
describe('private source review handoff', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const store = () => { const data = new Map<string,string>(); return { getItem: (k:string) => data.get(k) || null, setItem: (k:string,v:string) => { data.set(k,v); }, removeItem: (k:string) => { data.delete(k); } }; };
  it('moves a review once to the same account without including source text in the URL', () => {
    const storage=store(); const url=queueReview(storage,'owner','Private source brief',now); const id=new URL(url,'https://example.test').searchParams.get('review');
    expect(url).not.toContain('Private');
    expect(takeReview(storage,id,'other',now)).toBeNull();
    expect(takeReview(storage,id,'owner',now)).toBe('Private source brief');
    expect(takeReview(storage,id,'owner',now)).toBeNull();
  });
  it('does not restore an expired draft', () => {
    const storage=store(); const url=queueReview(storage,'owner','brief',now); const id=new URL(url,'https://example.test').searchParams.get('review');
    expect(takeReview(storage,id,'owner',now+16*60*1000)).toBeNull();
  });
});
