import {
  targetsConditionEvidenceSubmission,
  targetsGeometryEvidenceSubmission,
  validateConditionEvidence,
  validateGeometryEvidence,
  type ConditionEvidenceSubmission,
  type GeometryEvidenceSubmission,
} from '../economic-trade-evidence';

const validGeometry = (): GeometryEvidenceSubmission => ({
  measuredAt: '2026-08-08T01:00:00.000Z',
  measuredBy: 'Field Operator',
  measurementMethod: 'Laser distance meter and tape cross-check',
  allInScopeStructuresCaptured: true,
  attestedAccurate: true,
  structures: [
    {
      label: 'Building A',
      lengthFt: 120,
      widthFt: 40,
      wallHeightFt: 12,
      gableHeightFt: 5,
      parcelMembership: 'CONFIRMED',
      photoRefs: ['photo://building-a-north', 'photo://building-a-scale'],
    },
  ],
});

const validCondition = (): ConditionEvidenceSubmission => ({
  observedAt: '2026-08-08T01:00:00.000Z',
  observedBy: 'Field Operator',
  allInScopeFacesCaptured: true,
  attestedAccurate: true,
  waterAccess: 'CONFIRMED',
  surfaces: [
    {
      structureLabel: 'Building A',
      face: 'North',
      material: 'Painted ribbed metal',
      condition: 'Light organic growth concentrated along lower panels',
      contamination: ['organic growth', 'surface dirt'],
      accessConstraints: 'Clear vehicle access',
      photoRefs: ['photo://building-a-north'],
    },
  ],
});

describe('geometry evidence evaluation', () => {
  it('passes only complete, attested, parcel-confirmed measurements with evidence references', () => {
    const result = validateGeometryEvidence(validGeometry());
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.findings).toEqual([]);
  });

  it('keeps the gap open when parcel membership is unconfirmed', () => {
    const input = validGeometry();
    input.structures[0].parcelMembership = 'UNCONFIRMED';
    const result = validateGeometryEvidence(input);
    expect(result.passed).toBe(false);
    expect(result.findings).toContain('Structure 1 parcel membership is not confirmed.');
  });

  it('rejects incomplete dimensions and weak evidence references', () => {
    const input = validGeometry();
    input.structures[0].lengthFt = 0;
    input.structures[0].photoRefs = [];
    const result = validateGeometryEvidence(input);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.includes('length'))).toBe(true);
    expect(result.findings.some(item => item.includes('evidence references'))).toBe(true);
  });

  it('rejects references that are not attachment, file, evidence, photo, or URL identifiers', () => {
    const input = validGeometry();
    input.structures[0].photoRefs = ['north picture', 'scale picture'];
    const result = validateGeometryEvidence(input);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.includes('supported attachment'))).toBe(true);
  });
});

describe('surface-condition evidence evaluation', () => {
  it('passes current, complete, attested observations', () => {
    const result = validateConditionEvidence(validCondition());
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.findings).toEqual([]);
  });

  it('keeps the gap open when water access or photo evidence is missing', () => {
    const input = validCondition();
    input.waterAccess = 'UNKNOWN';
    input.surfaces[0].photoRefs = [];
    const result = validateConditionEvidence(input);
    expect(result.passed).toBe(false);
    expect(result.findings).toContain('Water access is not confirmed.');
    expect(result.findings.some(item => item.includes('current photo reference'))).toBe(true);
  });

  it('keeps the gap open when access constraints are omitted', () => {
    const input = validCondition();
    input.surfaces[0].accessConstraints = '';
    const result = validateConditionEvidence(input);
    expect(result.passed).toBe(false);
    expect(result.findings.some(item => item.includes('access-constraint'))).toBe(true);
  });
});

describe('evidence command markers', () => {
  it('recognizes geometry evidence payloads', () => {
    expect(targetsGeometryEvidenceSubmission('Trade #0001\nGEOMETRY_EVIDENCE:{}')).toBe(true);
    expect(targetsConditionEvidenceSubmission('Trade #0001\nGEOMETRY_EVIDENCE:{}')).toBe(false);
  });

  it('recognizes condition evidence payloads', () => {
    expect(targetsConditionEvidenceSubmission('Trade #0001\nCONDITION_EVIDENCE:{}')).toBe(true);
    expect(targetsGeometryEvidenceSubmission('Trade #0001\nCONDITION_EVIDENCE:{}')).toBe(false);
  });
});
