import { ingestFlipOpportunityInput } from '../nexus-ingestion';

describe('nexus ingestion pipeline', () => {
  it('normalizes structured payloads with string numerics', () => {
    const result = ingestFlipOpportunityInput({
      title: 'Dyson V8 Vacuum',
      askingPrice: '120',
      soldComps: ['165', '172', 168],
      estimatedFees: '18',
      estimatedShipping: '14',
      sourceUrl: 'https://www.facebook.com/marketplace/item/123',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opportunity.askingPrice).toBe(120);
    expect(result.opportunity.soldComps).toEqual([165, 172, 168]);
    expect(result.opportunity.sourceType).toBe('facebook_marketplace');
    expect(result.ingestion.version).toBe('nexus.ingest.v2');
    expect(result.ingestion.derivedFields).toContain('sourceType');
  });

  it('extracts required fields from raw text input', () => {
    const result = ingestFlipOpportunityInput({
      rawText: 'Nintendo Switch OLED like new asking $190 sold comps: 240, 255, 248, 260',
      sourceUrl: 'https://offerup.com/item/123',
      location: 'Seattle',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opportunity.askingPrice).toBe(190);
    expect(result.opportunity.soldComps).toEqual([240, 255, 248, 260]);
    expect(result.opportunity.condition).toBe('Like New');
    expect(result.opportunity.sourceType).toBe('offerup');
    expect(result.ingestion.derivedFields).toContain('askingPrice');
    expect(result.ingestion.source).toBe('hybrid');
  });

  it('returns explicit validation errors when required fields cannot be derived', () => {
    const result = ingestFlipOpportunityInput({ notes: 'No price provided here' });
    expect(result.ok).toBe(false);
    if (!('errors' in result)) return;
    expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['ASKING_PRICE_REQUIRED']));
  });
});
