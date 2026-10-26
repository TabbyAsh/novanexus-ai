import { normalizeResources } from '../resources';
describe('private workspace configuration', () => {
  it('has no owner-specific destinations by default', () => {
    expect(normalizeResources({})).toEqual({ desk: '', atlas: '', auctions: '', pipeline: '', transport: '', archives: [] });
  });
  it('validates imported addresses and derives only expected workspace paths', () => {
    const data = normalizeResources({ desk:'https://desk.example.invalid/', atlas:'javascript:alert(1)', archives:[{name:'Unsafe',href:'https://user:secret@example.invalid'},{name:'Original source',href:'https://archive.example.invalid',kind:'Archive',detail:'Review before running'}] });
    expect(data.auctions).toBe('https://desk.example.invalid/auctions');expect(data.atlas).toBe('');expect(data.archives).toHaveLength(1);
  });
});
