import { createHash } from 'node:crypto';
import { query, queryOne } from '@nova/shared';
import { getTrade0001, type EconomicTradeView, type ProvenanceStatus } from './economic-trade-state';

export interface GeometryStructureEvidence {
  label: string;
  lengthFt: number;
  widthFt: number;
  wallHeightFt: number;
  gableHeightFt?: number | null;
  parcelMembership: 'CONFIRMED' | 'UNCONFIRMED';
  photoRefs: string[];
  notes?: string;
}

export interface GeometryEvidenceSubmission {
  measuredAt: string;
  measuredBy: string;
  measurementMethod: string;
  allInScopeStructuresCaptured: boolean;
  attestedAccurate: boolean;
  structures: GeometryStructureEvidence[];
}

export interface ConditionSurfaceEvidence {
  structureLabel: string;
  face: string;
  material: string;
  condition: string;
  contamination: string[];
  accessConstraints: string;
  photoRefs: string[];
}

export interface ConditionEvidenceSubmission {
  observedAt: string;
  observedBy: string;
  allInScopeFacesCaptured: boolean;
  attestedAccurate: boolean;
  waterAccess: 'CONFIRMED' | 'UNCONFIRMED' | 'UNKNOWN';
  surfaces: ConditionSurfaceEvidence[];
}

export interface EvidenceView {
  id: string;
  type: 'GEOMETRY_MEASUREMENT' | 'SURFACE_CONDITION';
  provenance: ProvenanceStatus;
  confidence: number;
  contentHash: string;
  createdAt: string;
  content: GeometryEvidenceSubmission | ConditionEvidenceSubmission;
}

export interface EvaluationView {
  id: string;
  gapCode: string;
  evidenceId: string;
  evaluatorType: 'DETERMINISTIC';
  criteriaVersion: string;
  passed: boolean;
  score: number;
  findings: string[];
  createdAt: string;
}

export interface EvidenceSummary {
  evidence: EvidenceView[];
  evaluations: EvaluationView[];
}

export interface EconomicEvidenceCommandResult {
  reply: string;
  capabilityId: 'economic.trade.geometry_evidence.submit' | 'economic.trade.condition_evidence.submit';
  source: string;
  trade: EconomicTradeView;
  evidenceSummary: EvidenceSummary;
  command: 'geometry_evidence_evaluated' | 'condition_evidence_evaluated';
}

interface EvidenceRow {
  id: string;
  evidence_type: EvidenceView['type'];
  provenance_status: ProvenanceStatus;
  confidence: string;
  content_hash: string;
  content_json: GeometryEvidenceSubmission | ConditionEvidenceSubmission | string;
  created_at: string;
}

interface EvaluationRow {
  id: string;
  gap_code: string;
  evidence_id: string;
  evaluator_type: 'DETERMINISTIC';
  criteria_version: string;
  passed: boolean;
  score: string;
  findings_json: string[] | string;
  created_at: string;
}

let tablesReady = false;

function parsed<T>(value: T | string, fallback: T): T {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function ensureEvidenceTables(): Promise<void> {
  if (tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_evidence (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      evidence_type VARCHAR(60) NOT NULL,
      provenance_status VARCHAR(32) NOT NULL,
      confidence NUMERIC NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      content_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(trade_id, user_id, evidence_type, content_hash)
    )
  `, []);
  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_evaluations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      gap_id UUID NOT NULL REFERENCES economic_trade_gaps(id) ON DELETE CASCADE,
      gap_code VARCHAR(80) NOT NULL,
      evidence_id UUID NOT NULL REFERENCES economic_trade_evidence(id) ON DELETE CASCADE,
      evaluator_type VARCHAR(32) NOT NULL,
      criteria_version VARCHAR(80) NOT NULL,
      passed BOOLEAN NOT NULL,
      score NUMERIC NOT NULL,
      findings_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(gap_id, evidence_id, criteria_version)
    )
  `, []);
  await query('CREATE INDEX IF NOT EXISTS idx_trade_evidence_trade_created ON economic_trade_evidence(trade_id, created_at DESC)', []);
  await query('CREATE INDEX IF NOT EXISTS idx_trade_evaluations_trade_created ON economic_trade_evaluations(trade_id, created_at DESC)', []);
  tablesReady = true;
}

function finitePositive(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

function normalizeRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].slice(0, 40);
}

function validEvidenceRef(value: string): boolean {
  return /^(attachment|file|evidence|photo|https?):\/\/.+/i.test(value);
}

export function validateGeometryEvidence(input: GeometryEvidenceSubmission): { score: number; passed: boolean; findings: string[] } {
  const findings: string[] = [];
  if (!input.measuredBy?.trim()) findings.push('Measured-by identity is missing.');
  if (!input.measurementMethod?.trim()) findings.push('Measurement method is missing.');
  if (!input.measuredAt || Number.isNaN(new Date(input.measuredAt).getTime())) findings.push('Measurement date/time is invalid.');
  if (!input.attestedAccurate) findings.push('The submitter did not attest that the measurements are accurate.');
  if (!input.allInScopeStructuresCaptured) findings.push('The submitter did not confirm that every in-scope structure was captured.');
  if (!Array.isArray(input.structures) || input.structures.length === 0) findings.push('At least one measured structure is required.');

  const labels = new Set<string>();
  let allParcelConfirmed = true;
  let allHaveReferences = true;

  for (const [index, structure] of (input.structures || []).entries()) {
    const prefix = `Structure ${index + 1}`;
    const label = String(structure.label || '').trim();
    if (!label) findings.push(`${prefix} is missing a stable label.`);
    if (label && labels.has(label.toLowerCase())) findings.push(`${prefix} repeats the label “${label}”.`);
    if (label) labels.add(label.toLowerCase());
    if (!finitePositive(structure.lengthFt, 5000)) findings.push(`${prefix} length must be greater than 0 and no more than 5,000 ft.`);
    if (!finitePositive(structure.widthFt, 2000)) findings.push(`${prefix} width must be greater than 0 and no more than 2,000 ft.`);
    if (!finitePositive(structure.wallHeightFt, 100)) findings.push(`${prefix} wall height must be greater than 0 and no more than 100 ft.`);
    if (structure.gableHeightFt != null && !finitePositive(structure.gableHeightFt, 100)) findings.push(`${prefix} gable height is invalid.`);
    if (structure.parcelMembership !== 'CONFIRMED') {
      allParcelConfirmed = false;
      findings.push(`${prefix} parcel membership is not confirmed.`);
    }
    const refs = normalizeRefs(structure.photoRefs);
    if (refs.length < 2) {
      allHaveReferences = false;
      findings.push(`${prefix} needs at least two evidence references showing the measurement context.`);
    } else if (refs.some(ref => !validEvidenceRef(ref))) {
      allHaveReferences = false;
      findings.push(`${prefix} contains an evidence reference without a supported attachment/file/evidence/URL scheme.`);
    }
  }

  let score = 0.55;
  if (input.measuredBy?.trim() && input.measurementMethod?.trim()) score += 0.08;
  if (input.measuredAt && !Number.isNaN(new Date(input.measuredAt).getTime())) score += 0.05;
  if (input.attestedAccurate) score += 0.08;
  if (input.allInScopeStructuresCaptured) score += 0.1;
  if (allParcelConfirmed) score += 0.08;
  if (allHaveReferences) score += 0.06;
  score = Math.min(0.99, Math.round(score * 100) / 100);

  return { score, passed: findings.length === 0 && score >= 0.9, findings };
}

export function validateConditionEvidence(input: ConditionEvidenceSubmission): { score: number; passed: boolean; findings: string[] } {
  const findings: string[] = [];
  if (!input.observedBy?.trim()) findings.push('Observer identity is missing.');
  if (!input.observedAt || Number.isNaN(new Date(input.observedAt).getTime())) findings.push('Observation date/time is invalid.');
  if (!input.attestedAccurate) findings.push('The submitter did not attest that the observations are current and accurate.');
  if (!input.allInScopeFacesCaptured) findings.push('The submitter did not confirm that every in-scope exterior face was captured.');
  if (!Array.isArray(input.surfaces) || input.surfaces.length === 0) findings.push('At least one structure-face observation is required.');
  if (input.waterAccess !== 'CONFIRMED') findings.push('Water access is not confirmed.');

  let allComplete = true;
  for (const [index, surface] of (input.surfaces || []).entries()) {
    const prefix = `Surface ${index + 1}`;
    if (!String(surface.structureLabel || '').trim()) { findings.push(`${prefix} is missing a structure label.`); allComplete = false; }
    if (!String(surface.face || '').trim()) { findings.push(`${prefix} is missing a face/orientation.`); allComplete = false; }
    if (!String(surface.material || '').trim()) { findings.push(`${prefix} is missing a material classification.`); allComplete = false; }
    if (!String(surface.condition || '').trim()) { findings.push(`${prefix} is missing a current-condition description.`); allComplete = false; }
    if (!String(surface.accessConstraints || '').trim()) { findings.push(`${prefix} is missing access-constraint information.`); allComplete = false; }
    const refs = normalizeRefs(surface.photoRefs);
    if (refs.length < 1) {
      findings.push(`${prefix} needs at least one current photo reference.`);
      allComplete = false;
    } else if (refs.some(ref => !validEvidenceRef(ref))) {
      findings.push(`${prefix} contains an evidence reference without a supported attachment/file/evidence/URL scheme.`);
      allComplete = false;
    }
  }

  let score = 0.55;
  if (input.observedBy?.trim()) score += 0.07;
  if (input.observedAt && !Number.isNaN(new Date(input.observedAt).getTime())) score += 0.05;
  if (input.attestedAccurate) score += 0.08;
  if (input.allInScopeFacesCaptured) score += 0.12;
  if (input.waterAccess === 'CONFIRMED') score += 0.05;
  if (allComplete) score += 0.08;
  score = Math.min(0.99, Math.round(score * 100) / 100);

  return { score, passed: findings.length === 0 && score >= 0.9, findings };
}

function parseJsonAfterMarker<T>(message: string, marker: string): T | null {
  const index = message.indexOf(marker);
  if (index < 0) return null;
  const raw = message.slice(index + marker.length).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function targetsGeometryEvidenceSubmission(message: string): boolean {
  return message.includes('GEOMETRY_EVIDENCE:');
}

export function targetsConditionEvidenceSubmission(message: string): boolean {
  return message.includes('CONDITION_EVIDENCE:');
}

async function persistEvidence(
  userId: string,
  trade: EconomicTradeView,
  gapCode: string,
  evidenceType: EvidenceView['type'],
  provenance: ProvenanceStatus,
  confidence: number,
  content: GeometryEvidenceSubmission | ConditionEvidenceSubmission,
  evaluation: { score: number; passed: boolean; findings: string[] },
  criteriaVersion: string,
): Promise<{ evidenceId: string; evaluationId: string }> {
  await ensureEvidenceTables();
  const gap = trade.gaps.find(item => item.code === gapCode);
  if (!gap) throw new Error(`Gap ${gapCode} is unavailable.`);

  const contentHash = stableHash(content);
  await query(
    `INSERT INTO economic_trade_evidence (
       trade_id, user_id, evidence_type, provenance_status, confidence,
       content_hash, content_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (trade_id, user_id, evidence_type, content_hash) DO NOTHING`,
    [trade.id, userId, evidenceType, provenance, confidence, contentHash, JSON.stringify(content)],
  );
  const evidence = await queryOne<{ id: string }>(
    `SELECT id FROM economic_trade_evidence
     WHERE trade_id = $1 AND user_id = $2 AND evidence_type = $3 AND content_hash = $4`,
    [trade.id, userId, evidenceType, contentHash],
  );
  if (!evidence?.id) throw new Error('Evidence could not be persisted.');

  await query(
    `INSERT INTO economic_trade_evaluations (
       trade_id, gap_id, gap_code, evidence_id, evaluator_type,
       criteria_version, passed, score, findings_json
     ) VALUES ($1, $2, $3, $4, 'DETERMINISTIC', $5, $6, $7, $8::jsonb)
     ON CONFLICT (gap_id, evidence_id, criteria_version) DO NOTHING`,
    [trade.id, gap.id, gap.code, evidence.id, criteriaVersion, evaluation.passed, evaluation.score, JSON.stringify(evaluation.findings)],
  );
  const evaluated = await queryOne<{ id: string }>(
    `SELECT id FROM economic_trade_evaluations
     WHERE gap_id = $1 AND evidence_id = $2 AND criteria_version = $3`,
    [gap.id, evidence.id, criteriaVersion],
  );
  if (!evaluated?.id) throw new Error('Evidence evaluation could not be persisted.');

  await query(
    `UPDATE economic_trade_gaps
     SET status = $1, updated_at = NOW(), resolved_at = CASE WHEN $1 = 'RESOLVED' THEN NOW() ELSE NULL END
     WHERE id = $2`,
    [evaluation.passed ? 'RESOLVED' : 'IN_PROGRESS', gap.id],
  );

  if (evidenceType === 'GEOMETRY_MEASUREMENT') {
    await query(
      `UPDATE economic_trade_actions
       SET status = $1, updated_at = NOW()
       WHERE trade_id = $2 AND user_id = $3 AND action_type = 'FIELD_MEASUREMENT'
         AND status NOT IN ('FAILED', 'CANCELLED')`,
      [evaluation.passed ? 'SUCCEEDED' : 'EVIDENCE_SUBMITTED', trade.id, userId],
    );
  }

  // Evidence completion advances the Trade to scope composition even when the
  // separate pricing-input gap is still open. Scope evidence and pricing inputs
  // are distinct gates; counting every blocking gap here would deadlock the
  // Trade in SCOPING after the pricing gap is introduced.
  const openScopeGapCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM economic_trade_gaps
     WHERE trade_id = $1
       AND code IN ('geometry-and-parcel-membership', 'current-surface-condition')
       AND blocking = true
       AND status NOT IN ('RESOLVED', 'WAIVED')`,
    [trade.id],
  );
  if (parseInt(openScopeGapCount?.count || '0', 10) === 0) {
    await query(
      `UPDATE economic_trades
       SET stage = CASE WHEN stage IN ('SCOPING', 'RESEARCHING') THEN 'READY_FOR_SCOPE' ELSE stage END,
           updated_at = NOW()
       WHERE id = $1`,
      [trade.id],
    );
  } else {
    await query(`UPDATE economic_trades SET updated_at = NOW() WHERE id = $1`, [trade.id]);
  }

  await query(
    `INSERT INTO economic_trade_events (trade_id, user_id, event_type, payload_json)
     VALUES
       ($1, $2, $3, $4::jsonb),
       ($1, $2, 'CAPABILITY_EVALUATED', $5::jsonb),
       ($1, $2, $6, $7::jsonb)`,
    [
      trade.id,
      userId,
      evidenceType === 'GEOMETRY_MEASUREMENT' ? 'GEOMETRY_EVIDENCE_SUBMITTED' : 'CONDITION_EVIDENCE_SUBMITTED',
      JSON.stringify({ evidenceId: evidence.id, gapId: gap.id, provenance, confidence }),
      JSON.stringify({ evaluationId: evaluated.id, evidenceId: evidence.id, criteriaVersion, passed: evaluation.passed, score: evaluation.score, findings: evaluation.findings }),
      evaluation.passed ? 'GAP_SATISFIED' : 'GAP_REMAINS_OPEN',
      JSON.stringify({ gapId: gap.id, gapCode: gap.code, evidenceId: evidence.id, score: evaluation.score }),
    ],
  );

  return { evidenceId: evidence.id, evaluationId: evaluated.id };
}

export async function getTradeEvidenceSummary(userId: string, tradeId: string): Promise<EvidenceSummary> {
  await ensureEvidenceTables();
  const [evidence, evaluations] = await Promise.all([
    query<EvidenceRow>(
      `SELECT id, evidence_type, provenance_status, confidence, content_hash,
              content_json, created_at
       FROM economic_trade_evidence
       WHERE trade_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 30`,
      [tradeId, userId],
    ),
    query<EvaluationRow>(
      `SELECT e.id, e.gap_code, e.evidence_id, e.evaluator_type,
              e.criteria_version, e.passed, e.score, e.findings_json, e.created_at
       FROM economic_trade_evaluations e
       JOIN economic_trade_evidence v ON v.id = e.evidence_id
       WHERE e.trade_id = $1 AND v.user_id = $2
       ORDER BY e.created_at DESC LIMIT 30`,
      [tradeId, userId],
    ),
  ]);

  return {
    evidence: evidence.rows.map(row => ({
      id: row.id,
      type: row.evidence_type,
      provenance: row.provenance_status,
      confidence: Number(row.confidence),
      contentHash: row.content_hash,
      createdAt: row.created_at,
      content: parsed(row.content_json, {} as GeometryEvidenceSubmission | ConditionEvidenceSubmission),
    })),
    evaluations: evaluations.rows.map(row => ({
      id: row.id,
      gapCode: row.gap_code,
      evidenceId: row.evidence_id,
      evaluatorType: row.evaluator_type,
      criteriaVersion: row.criteria_version,
      passed: row.passed,
      score: Number(row.score),
      findings: parsed<string[]>(row.findings_json, []),
      createdAt: row.created_at,
    })),
  };
}

function evidenceReply(
  label: string,
  trade: EconomicTradeView,
  evaluation: { score: number; passed: boolean; findings: string[] },
  evidenceId: string,
): string {
  const openBlocking = trade.gaps.filter(gap => gap.blocking && !['RESOLVED', 'WAIVED'].includes(gap.status));
  return [
    `${label} evidence ${evidenceId} was persisted and evaluated.`,
    `Evaluation: ${evaluation.passed ? 'PASSED' : 'FAILED'} at ${Math.round(evaluation.score * 100)}%.`,
    evaluation.findings.length ? `Findings:\n${evaluation.findings.map(item => `- ${item}`).join('\n')}` : 'No blocking findings.',
    '',
    `${openBlocking.length} blocking gap${openBlocking.length === 1 ? '' : 's'} remain. Trade stage: ${trade.stage}.`,
    evaluation.passed ? 'The corresponding fracture closed because the explicit satisfaction rule passed.' : 'The fracture remains visible; submission alone does not equal verification.',
  ].join('\n');
}

export async function handleEconomicEvidenceCommand(
  userId: string,
  message: string,
): Promise<EconomicEvidenceCommandResult | null> {
  if (targetsGeometryEvidenceSubmission(message)) {
    const input = parseJsonAfterMarker<GeometryEvidenceSubmission>(message, 'GEOMETRY_EVIDENCE:');
    if (!input) throw new Error('Geometry evidence JSON is missing or invalid.');
    input.structures = (input.structures || []).map(structure => ({ ...structure, photoRefs: normalizeRefs(structure.photoRefs) }));
    const initialTrade = await getTrade0001(userId);
    const evaluation = validateGeometryEvidence(input);
    const persisted = await persistEvidence(
      userId,
      initialTrade,
      'geometry-and-parcel-membership',
      'GEOMETRY_MEASUREMENT',
      'USER_CONFIRMED',
      evaluation.score,
      input,
      evaluation,
      'geometry-field-v2',
    );
    const trade = await getTrade0001(userId);
    const evidenceSummary = await getTradeEvidenceSummary(userId, trade.id);
    return {
      reply: evidenceReply('Geometry', trade, evaluation, persisted.evidenceId),
      capabilityId: 'economic.trade.geometry_evidence.submit',
      source: 'postgres:economic_trade_evidence+economic_trade_evaluations',
      trade,
      evidenceSummary,
      command: 'geometry_evidence_evaluated',
    };
  }

  if (targetsConditionEvidenceSubmission(message)) {
    const input = parseJsonAfterMarker<ConditionEvidenceSubmission>(message, 'CONDITION_EVIDENCE:');
    if (!input) throw new Error('Condition evidence JSON is missing or invalid.');
    input.surfaces = (input.surfaces || []).map(surface => ({
      ...surface,
      contamination: Array.isArray(surface.contamination) ? surface.contamination.map(item => String(item).trim()).filter(Boolean) : [],
      photoRefs: normalizeRefs(surface.photoRefs),
    }));
    const initialTrade = await getTrade0001(userId);
    const evaluation = validateConditionEvidence(input);
    const persisted = await persistEvidence(
      userId,
      initialTrade,
      'current-surface-condition',
      'SURFACE_CONDITION',
      'USER_CONFIRMED',
      evaluation.score,
      input,
      evaluation,
      'surface-condition-field-v2',
    );
    const trade = await getTrade0001(userId);
    const evidenceSummary = await getTradeEvidenceSummary(userId, trade.id);
    return {
      reply: evidenceReply('Surface-condition', trade, evaluation, persisted.evidenceId),
      capabilityId: 'economic.trade.condition_evidence.submit',
      source: 'postgres:economic_trade_evidence+economic_trade_evaluations',
      trade,
      evidenceSummary,
      command: 'condition_evidence_evaluated',
    };
  }

  return null;
}
