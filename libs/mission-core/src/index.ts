import { createHash } from 'crypto';

// EXPERIMENTAL: Mission Core is deliberately infrastructure-agnostic and is not
// a production executor. It decides whether an action is authorized and
// produces immutable values for a trusted adapter to persist; it never performs
// an external action itself.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

export const MISSION_AUTHORITY_LEVELS = [
  'OBSERVE',
  'CREATE',
  'PREPARE',
  'ACT_ONCE',
  'OPERATE',
] as const;

export type MissionAuthorityLevel = typeof MISSION_AUTHORITY_LEVELS[number];

export const MISSION_AUTHORITY_ORDER: Record<MissionAuthorityLevel, number> = {
  OBSERVE: 0,
  CREATE: 1,
  PREPARE: 2,
  ACT_ONCE: 3,
  OPERATE: 4,
};

export const AUTHORITY_DESCRIPTIONS: Record<MissionAuthorityLevel, string> = {
  OBSERVE: 'Read approved evidence and report facts; create no assets or side effects.',
  CREATE: 'Create private drafts, analyses, options, and assets; stage no external action.',
  PREPARE: 'Stage a complete but unsent action for human review; perform no external effect.',
  ACT_ONCE: 'Perform one exact, previewed external action under its matching human approval.',
  OPERATE: 'Perform recurring allowlisted actions inside a short, bounded standing mandate and kill-switch policy.',
};

export function authorityAtLeast(actual: MissionAuthorityLevel, required: MissionAuthorityLevel): boolean {
  return MISSION_AUTHORITY_ORDER[actual] >= MISSION_AUTHORITY_ORDER[required];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripControlCharacters(value: string): string {
  return [...value].filter(character => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code >= 32 && code !== 127;
  }).join('');
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value)
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

function oneLine(value: unknown, max: number): string {
  return text(value, max).replace(/\s+/g, ' ').trim();
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

const POSTGRES_INTEGER_MAX = 2_147_483_647;

function postgresNonNegativeInteger(value: unknown): number | null {
  const normalized = nonNegativeInteger(value);
  return normalized !== null && normalized <= POSTGRES_INTEGER_MAX ? normalized : null;
}

function postgresPositiveInteger(value: unknown): number | null {
  const normalized = positiveInteger(value);
  return normalized !== null && normalized <= POSTGRES_INTEGER_MAX ? normalized : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function uuidIdentifier(value: unknown): string {
  const normalized = oneLine(value, 36).toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : '';
}

function uniqueStrings(value: unknown, maxItems: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => oneLine(item, itemMax)).filter(Boolean))].slice(0, maxItems);
}

export function safeEvidenceReference(value: unknown, max = 500): string {
  const normalized = oneLine(value, max);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
  } catch {
    // Client-owned labels, content IDs, and storage keys are valid references.
  }
  return normalized;
}

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Mission hashes do not accept non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  throw new Error('Mission hashes accept JSON values only.');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function missionHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export type OpportunityEvidenceSource =
  | 'OWNER_PROVIDED'
  | 'PUBLIC_SOURCE'
  | 'SYSTEM_OBSERVED'
  | 'MODEL_INFERENCE';

export interface OpportunityEvidence {
  ref: string;
  contentHash: string;
  source: OpportunityEvidenceSource;
  observedAt: string;
  confidence: number;
  summary: string;
}

export interface OpportunityEstimate {
  classification: 'ESTIMATE';
  currency: string;
  estimatedRevenueCents: number;
  estimatedCostCents: number;
  confidence: number;
  basis: string;
}

export type OpportunityCardStatus = 'PROPOSED' | 'VALIDATED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

export interface OpportunityCard {
  id: string;
  orgId: string;
  status: OpportunityCardStatus;
  title: string;
  buyer: string;
  painfulJob: string;
  proposedValue: string;
  evidence: OpportunityEvidence[];
  assumptions: string[];
  risks: string[];
  requiredCapabilityIds: string[];
  minimumAuthority: MissionAuthorityLevel;
  nextTest: string;
  estimate: OpportunityEstimate | null;
  createdAt: string;
  expiresAt: string;
}

export type ValidatedOpportunityCard = OpportunityCard & { contentHash: string };

export function validateOpportunityCard(input: unknown): ValidationResult<ValidatedOpportunityCard> {
  const body = isRecord(input) ? input : {};
  const errors: Record<string, string> = {};
  const id = uuidIdentifier(body.id);
  const orgId = uuidIdentifier(body.orgId);
  const status = oneLine(body.status, 24).toUpperCase() as OpportunityCardStatus;
  const title = oneLine(body.title, 200);
  const buyer = text(body.buyer, 1000);
  const painfulJob = text(body.painfulJob, 2000);
  const proposedValue = text(body.proposedValue, 2000);
  const assumptions = uniqueStrings(body.assumptions, 30, 1000);
  const risks = uniqueStrings(body.risks, 30, 1000);
  const requiredCapabilityIds = uniqueStrings(body.requiredCapabilityIds, 50, 120);
  const minimumAuthority = oneLine(body.minimumAuthority, 24).toUpperCase() as MissionAuthorityLevel;
  const nextTest = text(body.nextTest, 2000);
  const createdAt = isoTimestamp(body.createdAt);
  const expiresAt = isoTimestamp(body.expiresAt);

  if (!id) errors.id = 'Opportunity card ID must be a UUID.';
  if (!orgId) errors.orgId = 'Organization ID must be a UUID.';
  if (!['PROPOSED', 'VALIDATED', 'REJECTED', 'EXPIRED', 'CONVERTED'].includes(status)) {
    errors.status = 'Opportunity card status is invalid.';
  }
  if (title.length < 5) errors.title = 'Title must be at least 5 characters.';
  if (buyer.length < 5) errors.buyer = 'Name the buyer precisely.';
  if (painfulJob.length < 10) errors.painfulJob = 'Describe the painful job.';
  if (proposedValue.length < 10) errors.proposedValue = 'Describe the proposed value.';
  if (!assumptions.length) errors.assumptions = 'At least one falsifiable assumption is required.';
  if (!risks.length) errors.risks = 'At least one material risk is required.';
  if (!requiredCapabilityIds.length) errors.requiredCapabilityIds = 'At least one required capability is required.';
  if (!MISSION_AUTHORITY_LEVELS.includes(minimumAuthority)) errors.minimumAuthority = 'Authority level is invalid.';
  if (nextTest.length < 10) errors.nextTest = 'A bounded next test is required.';
  if (!createdAt) errors.createdAt = 'Created time must be a valid timestamp.';
  if (!expiresAt) errors.expiresAt = 'Expiry time must be a valid timestamp.';
  if (createdAt && expiresAt && new Date(expiresAt) <= new Date(createdAt)) {
    errors.expiresAt = 'Opportunity card expiry must be after creation.';
  }

  const evidenceInput = Array.isArray(body.evidence) ? body.evidence : [];
  const evidence: OpportunityEvidence[] = [];
  evidenceInput.slice(0, 50).forEach((entry, index) => {
    const item = isRecord(entry) ? entry : {};
    const ref = safeEvidenceReference(item.ref);
    const contentHash = oneLine(item.contentHash, 64).toLowerCase();
    const source = oneLine(item.source, 32).toUpperCase() as OpportunityEvidenceSource;
    const observedAt = isoTimestamp(item.observedAt);
    const confidence = Number(item.confidence);
    const summary = text(item.summary, 1000);
    if (!ref || !/^[a-f0-9]{64}$/.test(contentHash) || !observedAt
      || !['OWNER_PROVIDED', 'PUBLIC_SOURCE', 'SYSTEM_OBSERVED', 'MODEL_INFERENCE'].includes(source)
      || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || summary.length < 5) {
      errors[`evidence.${index}`] = 'Evidence requires a safe reference, SHA-256 hash, source, timestamp, confidence, and summary.';
      return;
    }
    evidence.push({ ref, contentHash, source, observedAt, confidence, summary });
  });
  if (!evidenceInput.length) errors.evidence = 'An opportunity needs at least one attributed evidence item.';
  if (['VALIDATED', 'CONVERTED'].includes(status) && evidence.length
    && !evidence.some(item => item.source !== 'MODEL_INFERENCE')) {
    errors.evidence = 'Validated opportunities require at least one non-model evidence source.';
  }

  let estimate: OpportunityEstimate | null = null;
  if (body.estimate !== null && body.estimate !== undefined) {
    const item = isRecord(body.estimate) ? body.estimate : {};
    const currency = oneLine(item.currency, 3).toUpperCase();
    const estimatedRevenueCents = nonNegativeInteger(item.estimatedRevenueCents);
    const estimatedCostCents = nonNegativeInteger(item.estimatedCostCents);
    const confidence = Number(item.confidence);
    const basis = text(item.basis, 2000);
    if (item.classification !== 'ESTIMATE') errors['estimate.classification'] = 'Opportunity economics must remain classified as ESTIMATE.';
    if (!/^[A-Z]{3}$/.test(currency)) errors['estimate.currency'] = 'Use a three-letter currency code.';
    if (estimatedRevenueCents === null || estimatedCostCents === null) errors['estimate.amounts'] = 'Estimated amounts must be non-negative whole cents.';
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors['estimate.confidence'] = 'Estimate confidence must be between 0 and 1.';
    if (basis.length < 10) errors['estimate.basis'] = 'Estimate basis is required.';
    if (!Object.keys(errors).some(key => key.startsWith('estimate.'))) {
      estimate = {
        classification: 'ESTIMATE', currency,
        estimatedRevenueCents: estimatedRevenueCents!, estimatedCostCents: estimatedCostCents!, confidence, basis,
      };
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const value: OpportunityCard = {
    id, orgId, status, title, buyer, painfulJob, proposedValue, evidence, assumptions, risks,
    requiredCapabilityIds, minimumAuthority, nextTest, estimate, createdAt: createdAt!, expiresAt: expiresAt!,
  };
  return { ok: true, value: { ...value, contentHash: missionHash(value as unknown as JsonValue) } };
}

export const MAX_MANDATE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_OPERATE_MANDATE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface MissionMandate {
  id: string;
  missionId: string;
  orgId: string;
  purpose: string;
  authority: MissionAuthorityLevel;
  allowedCapabilityIds: string[];
  allowedActionTypes: string[];
  allowedExternalActionTypes: string[];
  allowedExternalTargetRefs: string[];
  approvedActionHash: string | null;
  maxActions: number;
  maxExternalActions: number;
  maxSpendCents: number;
  currency: string;
  issuedBy: string;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
}

export type ValidatedMissionMandate = MissionMandate & { mandateHash: string };

export interface MissionMandateUsage {
  totalActions: number;
  externalActions: number;
  spendCents: number;
  actOnceDispatches: number;
  revokedAt: string | null;
  revocationRef: string | null;
}

export function validateMissionMandate(input: unknown): ValidationResult<ValidatedMissionMandate> {
  const body = isRecord(input) ? input : {};
  const errors: Record<string, string> = {};
  const id = uuidIdentifier(body.id);
  const missionId = uuidIdentifier(body.missionId);
  const orgId = uuidIdentifier(body.orgId);
  const purpose = text(body.purpose, 2000);
  const authority = oneLine(body.authority, 24).toUpperCase() as MissionAuthorityLevel;
  const allowedCapabilityIds = uniqueStrings(body.allowedCapabilityIds, 50, 120);
  const allowedActionTypes = uniqueStrings(body.allowedActionTypes, 100, 120);
  const allowedExternalActionTypes = uniqueStrings(body.allowedExternalActionTypes, 50, 120);
  const allowedExternalTargetRefs = uniqueStrings(body.allowedExternalTargetRefs, 100, 300);
  const approvedActionHash = body.approvedActionHash === null || body.approvedActionHash === undefined
    ? null
    : oneLine(body.approvedActionHash, 64).toLowerCase();
  const maxActions = postgresPositiveInteger(body.maxActions);
  const maxExternalActions = postgresNonNegativeInteger(body.maxExternalActions);
  const maxSpendCents = nonNegativeInteger(body.maxSpendCents);
  const currency = oneLine(body.currency, 3).toUpperCase();
  const issuedBy = oneLine(body.issuedBy, 100);
  const issuedAt = isoTimestamp(body.issuedAt);
  const notBefore = isoTimestamp(body.notBefore);
  const expiresAt = isoTimestamp(body.expiresAt);

  if (!id) errors.id = 'Mandate ID must be a UUID.';
  if (!missionId) errors.missionId = 'Mission ID must be a UUID.';
  if (!orgId) errors.orgId = 'Organization ID must be a UUID.';
  if (purpose.length < 10) errors.purpose = 'Mandate purpose must be explicit.';
  if (!MISSION_AUTHORITY_LEVELS.includes(authority)) errors.authority = 'Authority level is invalid.';
  if (!allowedCapabilityIds.length) errors.allowedCapabilityIds = 'At least one capability must be allowlisted.';
  if (!allowedActionTypes.length || allowedActionTypes.includes('*')) errors.allowedActionTypes = 'Use explicit action types; wildcards are forbidden.';
  if (maxActions === null) errors.maxActions = 'A positive total action cap is required.';
  if (maxExternalActions === null || (maxActions !== null && maxExternalActions > maxActions)) {
    errors.maxExternalActions = 'External action cap must be a non-negative value no greater than total actions.';
  }
  if (maxSpendCents === null) errors.maxSpendCents = 'Spend cap must be non-negative whole cents.';
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'Use a three-letter currency code.';
  if (issuedBy.length < 3) errors.issuedBy = 'Issuing actor is required.';
  if (!issuedAt || !notBefore || !expiresAt) errors.window = 'Issued, not-before, and expiry timestamps are required.';

  if (issuedAt && notBefore && expiresAt) {
    const issuedMs = new Date(issuedAt).getTime();
    const startsMs = new Date(notBefore).getTime();
    const expiresMs = new Date(expiresAt).getTime();
    if (startsMs < issuedMs) errors.notBefore = 'Mandate cannot begin before it is issued.';
    if (expiresMs <= startsMs) errors.expiresAt = 'Mandate expiry must be after its start.';
    const maxDuration = authority === 'OPERATE' ? MAX_OPERATE_MANDATE_DURATION_MS : MAX_MANDATE_DURATION_MS;
    if (expiresMs - startsMs > maxDuration) {
      errors.expiresAt = authority === 'OPERATE'
        ? 'OPERATE mandates may last at most 7 days.'
        : 'Mission mandates may last at most 30 days.';
    }
  }

  const externalCapable = authorityAtLeast(authority, 'ACT_ONCE');
  if (!externalCapable && (allowedExternalActionTypes.length || allowedExternalTargetRefs.length || maxExternalActions! > 0 || maxSpendCents! > 0)) {
    errors.externalAuthority = 'OBSERVE, CREATE, and PREPARE mandates cannot authorize external effects or spend.';
  }
  if (allowedExternalActionTypes.includes('*') || allowedExternalTargetRefs.includes('*')) {
    errors.externalAllowlist = 'External action and target wildcards are forbidden.';
  }
  if (allowedExternalActionTypes.some(action => !allowedActionTypes.includes(action))) {
    errors.externalAllowlist = 'Every external action must also appear in the general action allowlist.';
  }
  if (allowedExternalActionTypes.length && (!allowedExternalTargetRefs.length || !maxExternalActions)) {
    errors.externalBounds = 'External authority requires exact targets and a positive external action cap.';
  }
  if (externalCapable && !allowedExternalActionTypes.length
    && (allowedExternalTargetRefs.length || maxExternalActions! > 0 || maxSpendCents! > 0)) {
    errors.externalBounds = 'A mandate without external action types cannot reserve targets, actions, or spend.';
  }
  if (authority === 'ACT_ONCE' && allowedExternalActionTypes.length) {
    if (allowedExternalActionTypes.length !== 1 || allowedExternalTargetRefs.length !== 1 || maxExternalActions !== 1) {
      errors.actOnceBounds = 'ACT_ONCE must name one external action, one target, and an external action cap of one.';
    }
    if (!approvedActionHash || !/^[a-f0-9]{64}$/.test(approvedActionHash)) {
      errors.approvedActionHash = 'ACT_ONCE requires the SHA-256 hash of the exact preview the human approved.';
    }
  } else if (approvedActionHash !== null) {
    errors.approvedActionHash = 'Only an external ACT_ONCE mandate may bind an approved action hash.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const value: MissionMandate = {
    id, missionId, orgId, purpose, authority, allowedCapabilityIds, allowedActionTypes,
    allowedExternalActionTypes, allowedExternalTargetRefs, approvedActionHash, maxActions: maxActions!,
    maxExternalActions: maxExternalActions!, maxSpendCents: maxSpendCents!, currency,
    issuedBy, issuedAt: issuedAt!, notBefore: notBefore!, expiresAt: expiresAt!,
  };
  return { ok: true, value: { ...value, mandateHash: missionHash(value as unknown as JsonValue) } };
}

export type MissionState = 'DRAFT' | 'READY' | 'RUNNING' | 'PAUSED' | 'CLOSING' | 'CLOSED';

export interface MissionSnapshot {
  id: string;
  orgId: string;
  opportunityCardId: string;
  state: MissionState;
  version: number;
  capabilityIds: string[];
  openActionCount: number;
  closeoutHash: string | null;
}

const MISSION_TRANSITIONS: Record<MissionState, MissionState[]> = {
  DRAFT: ['READY', 'CLOSING'],
  READY: ['RUNNING', 'CLOSING'],
  RUNNING: ['PAUSED', 'CLOSING'],
  PAUSED: ['RUNNING', 'CLOSING'],
  CLOSING: ['CLOSED'],
  CLOSED: [],
};

export function evaluateMissionTransition(from: MissionState, to: MissionState):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  if (MISSION_TRANSITIONS[from].includes(to)) return { ok: true };
  return {
    ok: false,
    code: from === 'CLOSED' ? 'MISSION_TERMINAL' : 'INVALID_MISSION_TRANSITION',
    message: from === 'CLOSED' ? 'Closed missions are immutable.' : `Mission cannot transition from ${from} to ${to}.`,
  };
}

export type MissionActionEffect =
  | 'READ_ONLY'
  | 'PRIVATE_ARTIFACT'
  | 'STAGED_EXTERNAL_ACTION'
  | 'EXTERNAL_COMMUNICATION'
  | 'EXTERNAL_TRANSACTION'
  | 'DESTRUCTIVE_EXTERNAL';

export interface MissionActionPolicy {
  actionType: string;
  capabilityId: string;
  effect: MissionActionEffect;
  minimumAuthority: MissionAuthorityLevel;
}

// This registry is an authority input. An adapter must construct it from
// server-owned configuration, never from request data.
export type MissionActionRegistry = Readonly<Record<string, Readonly<MissionActionPolicy>>>;

export interface MissionActionRequest {
  actionType: string;
  capabilityId: string;
  targetRef: string | null;
  expectedSpendCents: number;
  currency: string;
  idempotencyKey: string;
  approvalId: string | null;
  payload: { [key: string]: JsonValue };
}

export type KillSwitchState = 'DISABLED' | 'ENABLED' | 'UNKNOWN';

export interface MissionKillSwitchAssertion {
  missionId: string;
  orgId: string;
  state: KillSwitchState;
  version: number;
  observedAt: string;
}

export interface MissionActionApproval {
  id: string;
  missionId: string;
  orgId: string;
  mandateId: string;
  actionEnvelopeHash: string;
  approvedByActorType: 'HUMAN';
  approvedByActorId: string;
  approvedAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface MissionExecutableActionEnvelope {
  schemaVersion: 1;
  actionType: string;
  capabilityId: string;
  effect: MissionActionEffect;
  targetRef: string | null;
  expectedSpendCents: number;
  currency: string;
  payloadHash: string;
}

export interface PreparedMissionAction {
  actionType: string;
  capabilityId: string;
  effect: MissionActionEffect;
  minimumAuthority: MissionAuthorityLevel;
  targetRef: string | null;
  expectedSpendCents: number;
  currency: string;
  idempotencyKey: string;
  approvalId: string | null;
  payload: { [key: string]: JsonValue };
  payloadCanonicalJson: string;
  payloadHash: string;
  actionEnvelope: MissionExecutableActionEnvelope;
  actionEnvelopeCanonicalJson: string;
  actionEnvelopeHash: string;
}

export const MAX_ACTION_PAYLOAD_BYTES = 128 * 1024;
export const MAX_KILL_SWITCH_ASSERTION_AGE_MS = 30_000;

export interface MissionPreflightInput {
  mission: MissionSnapshot;
  mandate: MissionMandate;
  usage: MissionMandateUsage;
  action: MissionActionRequest;
  trustedActionRegistry: MissionActionRegistry;
  verifiedApproval: MissionActionApproval | null;
  availableCapabilityIds: string[];
  killSwitch: MissionKillSwitchAssertion | null;
  now: string;
}

export type MissionPreflightDecision =
  | {
      ok: true;
      decision: 'ALLOW';
      requiredAuthority: MissionAuthorityLevel;
      mandateHash: string;
      preparedAction: PreparedMissionAction;
      remainingActionsAfter: number;
      remainingExternalActionsAfter: number;
      remainingSpendCentsAfter: number;
    }
  | {
      ok: false;
      decision: 'DENY';
      code: string;
      message: string;
      unmet: string[];
    };

export function requiredAuthority(effect: MissionActionEffect): MissionAuthorityLevel {
  switch (effect) {
    case 'READ_ONLY': return 'OBSERVE';
    case 'PRIVATE_ARTIFACT': return 'CREATE';
    case 'STAGED_EXTERNAL_ACTION': return 'PREPARE';
    case 'EXTERNAL_COMMUNICATION':
    case 'EXTERNAL_TRANSACTION':
    case 'DESTRUCTIVE_EXTERNAL':
      return 'ACT_ONCE';
  }
}

export function isExternalEffect(effect: MissionActionEffect): boolean {
  return ['EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL'].includes(effect);
}

function deny(code: string, message: string, unmet: string[] = []): MissionPreflightDecision {
  return { ok: false, decision: 'DENY', code, message, unmet };
}

function validActionEffects(): MissionActionEffect[] {
  return [
    'READ_ONLY', 'PRIVATE_ARTIFACT', 'STAGED_EXTERNAL_ACTION',
    'EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION', 'DESTRUCTIVE_EXTERNAL',
  ];
}

export function prepareMissionAction(
  input: MissionActionRequest,
  trustedActionRegistry: MissionActionRegistry,
): ValidationResult<PreparedMissionAction> {
  const errors: Record<string, string> = {};
  const actionType = oneLine(input?.actionType, 120);
  const capabilityId = oneLine(input?.capabilityId, 120);
  const targetValue = oneLine(input?.targetRef, 300);
  const targetRef = targetValue || null;
  const expectedSpendCents = nonNegativeInteger(input?.expectedSpendCents);
  const currency = oneLine(input?.currency, 3).toUpperCase();
  const idempotencyKey = oneLine(input?.idempotencyKey, 160);
  const approvalId = input?.approvalId === null || input?.approvalId === undefined
    ? null
    : uuidIdentifier(input.approvalId);

  if (!actionType) errors.actionType = 'Action type is required.';
  if (!capabilityId) errors.capabilityId = 'Capability is required.';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,159}$/.test(idempotencyKey)) {
    errors.idempotencyKey = 'A durable idempotency key is required before execution.';
  }
  if (expectedSpendCents === null || !/^[A-Z]{3}$/.test(currency)) {
    errors.economics = 'Expected spend must be non-negative whole cents with a currency.';
  }
  if (input?.approvalId !== null && input?.approvalId !== undefined && !approvalId) {
    errors.approvalId = 'Approval ID must be a UUID.';
  }

  const hasPolicy = Boolean(actionType)
    && Object.prototype.hasOwnProperty.call(trustedActionRegistry || {}, actionType);
  const policy = hasPolicy ? trustedActionRegistry[actionType] : null;
  if (!policy
    || oneLine(policy.actionType, 120) !== actionType
    || oneLine(policy.capabilityId, 120) !== capabilityId
    || !validActionEffects().includes(policy.effect)
    || !MISSION_AUTHORITY_LEVELS.includes(policy.minimumAuthority)
    || !authorityAtLeast(policy.minimumAuthority, requiredAuthority(policy.effect))) {
    errors.policy = 'Action must match a trusted action policy with a safe authority floor.';
  }

  if (!isRecord(input?.payload)) {
    errors.payload = 'Executable action payload must be a JSON object.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  let payload: { [key: string]: JsonValue };
  let payloadCanonicalJson: string;
  try {
    payload = canonicalize(input.payload) as { [key: string]: JsonValue };
    payloadCanonicalJson = canonicalJson(payload);
  } catch {
    return { ok: false, errors: { payload: 'Executable action payload must contain JSON values only.' } };
  }
  if (Buffer.byteLength(payloadCanonicalJson, 'utf8') > MAX_ACTION_PAYLOAD_BYTES) {
    return { ok: false, errors: { payload: `Executable action payload may not exceed ${MAX_ACTION_PAYLOAD_BYTES} bytes.` } };
  }

  const trustedPolicy = policy!;
  const external = isExternalEffect(trustedPolicy.effect);
  if ((external || trustedPolicy.effect === 'STAGED_EXTERNAL_ACTION') && !targetRef) {
    errors.targetRef = 'Staged and external actions require an exact target.';
  }
  if (!external && expectedSpendCents! > 0) {
    errors.expectedSpendCents = 'Actions without an external effect cannot spend externally.';
  }
  if (!external && approvalId) {
    errors.approvalId = 'Only an external action may bind a human approval.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const payloadHash = missionHash(payload);
  const actionEnvelope: MissionExecutableActionEnvelope = {
    schemaVersion: 1,
    actionType,
    capabilityId,
    effect: trustedPolicy.effect,
    targetRef,
    expectedSpendCents: expectedSpendCents!,
    currency,
    payloadHash,
  };
  const actionEnvelopeCanonicalJson = canonicalJson(actionEnvelope as unknown as JsonValue);
  return {
    ok: true,
    value: {
      actionType,
      capabilityId,
      effect: trustedPolicy.effect,
      minimumAuthority: trustedPolicy.minimumAuthority,
      targetRef,
      expectedSpendCents: expectedSpendCents!,
      currency,
      idempotencyKey,
      approvalId,
      payload,
      payloadCanonicalJson,
      payloadHash,
      actionEnvelope,
      actionEnvelopeCanonicalJson,
      actionEnvelopeHash: missionHash(actionEnvelope as unknown as JsonValue),
    },
  };
}

function validateKillSwitchAssertion(
  assertion: MissionKillSwitchAssertion | null,
  mission: MissionSnapshot,
  nowMs: number,
): string | null {
  if (!assertion) return 'A live kill-switch assertion is required.';
  const observedAt = isoTimestamp(assertion.observedAt);
  const version = positiveInteger(assertion.version);
  if (uuidIdentifier(assertion.missionId) !== mission.id
    || uuidIdentifier(assertion.orgId) !== mission.orgId
    || !version
    || !observedAt) {
    return 'Kill-switch assertion scope, version, or time is invalid.';
  }
  const observedMs = new Date(observedAt).getTime();
  if (observedMs > nowMs || nowMs - observedMs > MAX_KILL_SWITCH_ASSERTION_AGE_MS) {
    return 'Kill-switch assertion is stale or from the future.';
  }
  if (assertion.state !== 'DISABLED') return 'External authority is closed by the kill switch.';
  return null;
}

function validateApproval(
  approval: MissionActionApproval | null,
  prepared: PreparedMissionAction,
  mission: MissionSnapshot,
  mandate: ValidatedMissionMandate,
  nowMs: number,
  required: boolean,
): string | null {
  if (!prepared.approvalId && !required) return null;
  if (!approval || !prepared.approvalId) return 'A verified human approval is required.';
  const approvedAt = isoTimestamp(approval.approvedAt);
  const expiresAt = isoTimestamp(approval.expiresAt);
  if (uuidIdentifier(approval.id) !== prepared.approvalId
    || uuidIdentifier(approval.missionId) !== mission.id
    || uuidIdentifier(approval.orgId) !== mission.orgId
    || uuidIdentifier(approval.mandateId) !== mandate.id
    || oneLine(approval.actionEnvelopeHash, 64).toLowerCase() !== prepared.actionEnvelopeHash
    || approval.approvedByActorType !== 'HUMAN'
    || oneLine(approval.approvedByActorId, 100).length < 3
    || !approvedAt
    || !expiresAt
    || approval.consumedAt !== null) {
    return 'Approval is invalid, consumed, or does not bind this exact action envelope.';
  }
  const approvedMs = new Date(approvedAt).getTime();
  const expiresMs = new Date(expiresAt).getTime();
  if (approvedMs > nowMs || expiresMs <= nowMs || expiresMs <= approvedMs) {
    return 'Approval is not active at execution time.';
  }
  return null;
}

function validateUsage(usage: MissionMandateUsage): {
  totalActions: number;
  externalActions: number;
  spendCents: number;
  actOnceDispatches: number;
} | null {
  const totalActions = nonNegativeInteger(usage.totalActions);
  const externalActions = nonNegativeInteger(usage.externalActions);
  const spendCents = nonNegativeInteger(usage.spendCents);
  const actOnceDispatches = nonNegativeInteger(usage.actOnceDispatches);
  if (totalActions === null || externalActions === null || spendCents === null || actOnceDispatches === null
    || externalActions > totalActions || actOnceDispatches > externalActions) return null;
  return { totalActions, externalActions, spendCents, actOnceDispatches };
}

export function preflightMissionAction(input: MissionPreflightInput): MissionPreflightDecision {
  const mandateResult = validateMissionMandate(input.mandate);
  if (!mandateResult.ok) {
    return deny('MANDATE_INVALID', 'Mission mandate failed validation.', Object.keys(mandateResult.errors));
  }
  const mandate = mandateResult.value;
  const preparedResult = prepareMissionAction(input.action, input.trustedActionRegistry);
  if (!preparedResult.ok) {
    return deny('ACTION_INVALID', 'Mission action failed trusted policy or envelope validation.', Object.keys(preparedResult.errors));
  }
  const action = preparedResult.value;
  const now = isoTimestamp(input.now);
  if (!now) return deny('CLOCK_INVALID', 'Preflight requires a valid current timestamp.');
  const nowMs = new Date(now).getTime();
  if (input.mission.state !== 'RUNNING' || input.mission.closeoutHash) {
    return deny('MISSION_NOT_RUNNING', 'Only a non-terminal running mission may execute actions.');
  }
  if (uuidIdentifier(input.mission.id) !== input.mission.id
    || uuidIdentifier(input.mission.orgId) !== input.mission.orgId) {
    return deny('MISSION_SCOPE_INVALID', 'Mission identity and organization must be UUIDs.');
  }
  if (mandate.missionId !== input.mission.id || mandate.orgId !== input.mission.orgId) {
    return deny('MANDATE_SCOPE_MISMATCH', 'Mandate does not belong to this mission and organization.');
  }
  if (input.usage.revokedAt || input.usage.revocationRef) {
    return deny('MANDATE_REVOKED', 'A revoked mandate grants no authority.');
  }
  if (nowMs < new Date(mandate.notBefore).getTime()) return deny('MANDATE_NOT_ACTIVE', 'Mandate is not active yet.');
  if (nowMs >= new Date(mandate.expiresAt).getTime()) return deny('MANDATE_EXPIRED', 'Mandate has expired.');
  if (!input.mission.capabilityIds.includes(action.capabilityId)
    || !input.availableCapabilityIds.includes(action.capabilityId)
    || !mandate.allowedCapabilityIds.includes(action.capabilityId)) {
    return deny('CAPABILITY_UNAVAILABLE', 'Capability must be required, available, and allowlisted for this mission.');
  }
  if (!mandate.allowedActionTypes.includes(action.actionType)) {
    return deny('ACTION_NOT_ALLOWLISTED', 'Action type is outside the mandate.');
  }
  const authorityNeeded = action.minimumAuthority;
  if (!authorityAtLeast(mandate.authority, authorityNeeded)) {
    return deny('AUTHORITY_INSUFFICIENT', `Action requires ${authorityNeeded} authority.`);
  }
  const usage = validateUsage(input.usage);
  if (!usage) {
    return deny('USAGE_INVALID', 'Mandate usage counters must be consistent non-negative integers.');
  }
  if (usage.totalActions + 1 > mandate.maxActions) {
    return deny('ACTION_CAP_EXCEEDED', 'Mandate total action cap is exhausted.');
  }

  const external = isExternalEffect(action.effect);
  if (external) {
    const killSwitchError = validateKillSwitchAssertion(input.killSwitch, input.mission, nowMs);
    if (killSwitchError) return deny('EXTERNAL_KILL_SWITCH_CLOSED', killSwitchError);
    if (!mandate.allowedExternalActionTypes.includes(action.actionType)) {
      return deny('EXTERNAL_ACTION_NOT_ALLOWLISTED', 'External action type is not explicitly allowlisted.');
    }
    if (!action.targetRef || !mandate.allowedExternalTargetRefs.includes(action.targetRef)) {
      return deny('EXTERNAL_TARGET_NOT_ALLOWLISTED', 'External target must exactly match the mandate allowlist.');
    }
    if (usage.externalActions + 1 > mandate.maxExternalActions) {
      return deny('EXTERNAL_ACTION_CAP_EXCEEDED', 'Mandate external action cap is exhausted.');
    }
    if (action.currency !== mandate.currency || usage.spendCents + action.expectedSpendCents > mandate.maxSpendCents) {
      return deny('SPEND_CAP_EXCEEDED', 'Action currency or spend exceeds the mandate.');
    }
    if (mandate.authority === 'ACT_ONCE' && action.actionEnvelopeHash !== mandate.approvedActionHash) {
      return deny('ACTION_APPROVAL_REQUIRED', 'ACT_ONCE requires approval for this exact previewed external action.');
    }
    const approvalRequired = mandate.authority === 'ACT_ONCE' || action.effect === 'DESTRUCTIVE_EXTERNAL';
    const approvalError = validateApproval(
      input.verifiedApproval, action, input.mission, mandate, nowMs, approvalRequired,
    );
    if (approvalError) {
      return deny(action.effect === 'DESTRUCTIVE_EXTERNAL' ? 'DESTRUCTIVE_APPROVAL_REQUIRED' : 'ACTION_APPROVAL_REQUIRED', approvalError);
    }
    if (mandate.authority === 'ACT_ONCE' && usage.actOnceDispatches > 0) {
      return deny('ACT_ONCE_ALREADY_USED', 'ACT_ONCE authority has already been dispatched.');
    }
  }

  return {
    ok: true,
    decision: 'ALLOW',
    requiredAuthority: authorityNeeded,
    mandateHash: mandate.mandateHash,
    preparedAction: action,
    remainingActionsAfter: mandate.maxActions - usage.totalActions - 1,
    remainingExternalActionsAfter: mandate.maxExternalActions - usage.externalActions - (external ? 1 : 0),
    remainingSpendCentsAfter: mandate.maxSpendCents - usage.spendCents - action.expectedSpendCents,
  };
}

export type MissionActionStatus = 'REQUESTED' | 'DENIED' | 'APPROVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

const MISSION_ACTION_TRANSITIONS: Record<MissionActionStatus, MissionActionStatus[]> = {
  REQUESTED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  DENIED: [],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function evaluateMissionActionTransition(
  from: MissionActionStatus,
  to: MissionActionStatus,
  resultEvidenceRefs: readonly string[] = [],
): { ok: true } | { ok: false; code: string; message: string } {
  if (!MISSION_ACTION_TRANSITIONS[from]?.includes(to)) {
    return { ok: false, code: 'INVALID_ACTION_TRANSITION', message: `Mission action cannot transition from ${from} to ${to}.` };
  }
  if (to === 'SUCCEEDED' && !resultEvidenceRefs.map(ref => safeEvidenceReference(ref)).filter(Boolean).length) {
    return { ok: false, code: 'ACTION_EVIDENCE_REQUIRED', message: 'Successful actions require result evidence.' };
  }
  return { ok: true };
}

export interface MissionActionDispatchRecord {
  id: string;
  status: MissionActionStatus;
  preflightDecision: 'ALLOW' | 'DENY';
  mandateHash: string;
  actionEnvelopeHash: string;
  idempotencyKey: string;
}

export interface MissionDispatchClaimInput extends Omit<MissionPreflightInput, 'availableCapabilityIds'> {
  record: MissionActionDispatchRecord;
  availableCapabilityIds: string[];
}

export type MissionDispatchClaimDecision =
  | {
      ok: true;
      decision: 'ALLOW_DISPATCH';
      preparedAction: PreparedMissionAction;
      mandateHash: string;
      killSwitchVersion: number | null;
      dispatchClaimHash: string;
    }
  | {
      ok: false;
      decision: 'DENY_DISPATCH';
      code: string;
      message: string;
    };

function denyDispatch(code: string, message: string): MissionDispatchClaimDecision {
  return { ok: false, decision: 'DENY_DISPATCH', code, message };
}

export function claimMissionActionForDispatch(input: MissionDispatchClaimInput): MissionDispatchClaimDecision {
  if (input.record.status !== 'APPROVED' || input.record.preflightDecision !== 'ALLOW') {
    return denyDispatch('ACTION_NOT_DISPATCHABLE', 'Only an approved, successfully preflighted action may be claimed.');
  }
  if (!uuidIdentifier(input.record.id)) return denyDispatch('ACTION_ID_INVALID', 'Persisted action ID must be a UUID.');

  const mandateResult = validateMissionMandate(input.mandate);
  if (!mandateResult.ok) return denyDispatch('MANDATE_INVALID', 'Mission mandate failed validation.');
  const mandate = mandateResult.value;
  const preparedResult = prepareMissionAction(input.action, input.trustedActionRegistry);
  if (!preparedResult.ok) return denyDispatch('ACTION_INVALID', 'Mission action no longer matches trusted policy.');
  const action = preparedResult.value;
  const now = isoTimestamp(input.now);
  if (!now) return denyDispatch('CLOCK_INVALID', 'Dispatch requires a valid current timestamp.');
  const nowMs = new Date(now).getTime();

  if (input.mission.state !== 'RUNNING' || input.mission.closeoutHash) {
    return denyDispatch('MISSION_NOT_RUNNING', 'Mission stopped running before dispatch.');
  }
  if (mandate.missionId !== input.mission.id || mandate.orgId !== input.mission.orgId) {
    return denyDispatch('MANDATE_SCOPE_MISMATCH', 'Mandate no longer matches mission scope.');
  }
  if (input.usage.revokedAt || input.usage.revocationRef) {
    return denyDispatch('MANDATE_REVOKED', 'Mandate was revoked before dispatch.');
  }
  if (nowMs < new Date(mandate.notBefore).getTime() || nowMs >= new Date(mandate.expiresAt).getTime()) {
    return denyDispatch('MANDATE_INACTIVE', 'Mandate is not active at dispatch time.');
  }
  if (input.record.mandateHash !== mandate.mandateHash
    || input.record.actionEnvelopeHash !== action.actionEnvelopeHash
    || input.record.idempotencyKey !== action.idempotencyKey) {
    return denyDispatch('ACTION_BINDING_MISMATCH', 'Persisted authority does not bind this exact action envelope and idempotency key.');
  }
  if (!input.mission.capabilityIds.includes(action.capabilityId)
    || !input.availableCapabilityIds.includes(action.capabilityId)
    || !mandate.allowedCapabilityIds.includes(action.capabilityId)
    || !mandate.allowedActionTypes.includes(action.actionType)
    || !authorityAtLeast(mandate.authority, action.minimumAuthority)) {
    return denyDispatch('AUTHORITY_INSUFFICIENT', 'Capability, action policy, or authority changed before dispatch.');
  }

  const usage = validateUsage(input.usage);
  if (!usage || usage.totalActions < 1 || usage.totalActions > mandate.maxActions) {
    return denyDispatch('USAGE_INVALID', 'Reserved action usage is missing or exceeds the mandate.');
  }

  const external = isExternalEffect(action.effect);
  let killSwitchVersion: number | null = null;
  if (external) {
    const killSwitchError = validateKillSwitchAssertion(input.killSwitch, input.mission, nowMs);
    if (killSwitchError) return denyDispatch('EXTERNAL_KILL_SWITCH_CLOSED', killSwitchError);
    killSwitchVersion = input.killSwitch!.version;
    if (!mandate.allowedExternalActionTypes.includes(action.actionType)
      || !action.targetRef
      || !mandate.allowedExternalTargetRefs.includes(action.targetRef)
      || action.currency !== mandate.currency
      || usage.externalActions < 1
      || usage.externalActions > mandate.maxExternalActions
      || usage.spendCents < action.expectedSpendCents
      || usage.spendCents > mandate.maxSpendCents) {
      return denyDispatch('EXTERNAL_AUTHORITY_INVALID', 'External authority or reserved caps changed before dispatch.');
    }
    if (mandate.authority === 'ACT_ONCE' && action.actionEnvelopeHash !== mandate.approvedActionHash) {
      return denyDispatch('ACTION_APPROVAL_REQUIRED', 'ACT_ONCE no longer binds the approved action envelope.');
    }
    const approvalRequired = mandate.authority === 'ACT_ONCE' || action.effect === 'DESTRUCTIVE_EXTERNAL';
    const approvalError = validateApproval(
      input.verifiedApproval, action, input.mission, mandate, nowMs, approvalRequired,
    );
    if (approvalError) return denyDispatch('ACTION_APPROVAL_REQUIRED', approvalError);
    if (mandate.authority === 'ACT_ONCE' && usage.actOnceDispatches > 0) {
      return denyDispatch('ACT_ONCE_ALREADY_USED', 'ACT_ONCE authority was already consumed.');
    }
  }

  const dispatchClaimHash = missionHash({
    schemaVersion: 1,
    actionId: input.record.id,
    missionId: input.mission.id,
    orgId: input.mission.orgId,
    mandateHash: mandate.mandateHash,
    actionEnvelopeHash: action.actionEnvelopeHash,
    idempotencyKey: action.idempotencyKey,
    killSwitchVersion,
    claimedAt: now,
  } as unknown as JsonValue);
  return {
    ok: true,
    decision: 'ALLOW_DISPATCH',
    preparedAction: action,
    mandateHash: mandate.mandateHash,
    killSwitchVersion,
    dispatchClaimHash,
  };
}

export type MissionTerminalDisposition = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type OutcomeVerification = 'VERIFIED' | 'UNVERIFIED';

export interface MissionOutcomeInput {
  disposition: MissionTerminalDisposition;
  verification: OutcomeVerification;
  summary: string;
  observedAt: string;
  evidenceRefs: string[];
  unverifiedReason: string | null;
}

export type MissionEconomicsInput =
  | {
      verification: 'VERIFIED';
      currency: string;
      collectedRevenueCents: number;
      refundsCents: number;
      directCostCents: number;
      externalSpendCents: number;
      laborMinutes: number;
      sourceRefs: string[];
      settledRevenueEvidenceRef: string | null;
    }
  | {
      verification: 'UNVERIFIED' | 'NOT_APPLICABLE';
      reason: string;
      currency: null;
      collectedRevenueCents: null;
      refundsCents: null;
      directCostCents: null;
      externalSpendCents: null;
      laborMinutes: number | null;
      sourceRefs: string[];
      settledRevenueEvidenceRef: null;
    };

export interface MissionCloseoutInput {
  id: string;
  missionId: string;
  orgId: string;
  outcome: MissionOutcomeInput;
  economics: MissionEconomicsInput;
  learning: string;
  closedBy: string;
  closedAt: string;
}

export interface MissionCloseout extends MissionCloseoutInput {
  realizedNetCents: number | null;
  closeoutHash: string;
}

export function normalizeMissionCloseout(
  snapshot: MissionSnapshot,
  input: unknown,
): ValidationResult<MissionCloseout> {
  const body = isRecord(input) ? input : {};
  const errors: Record<string, string> = {};
  const id = uuidIdentifier(body.id);
  const missionId = uuidIdentifier(body.missionId);
  const orgId = uuidIdentifier(body.orgId);
  const learning = text(body.learning, 4000);
  const closedBy = oneLine(body.closedBy, 100);
  const closedAt = isoTimestamp(body.closedAt);

  if (snapshot.state !== 'CLOSING') errors.state = 'Mission must enter CLOSING before terminal closeout.';
  if (snapshot.closeoutHash) errors.terminal = 'A mission can have exactly one terminal closeout.';
  if (snapshot.openActionCount !== 0) errors.openActionCount = 'All actions must reach a terminal state before closeout.';
  if (!id) errors.id = 'Closeout ID must be a UUID.';
  if (missionId !== snapshot.id || orgId !== snapshot.orgId) errors.scope = 'Closeout mission or organization does not match.';
  if (learning.length < 20) errors.learning = 'Record an Adapt learning of at least 20 characters.';
  if (closedBy.length < 3) errors.closedBy = 'Closing actor is required.';
  if (!closedAt) errors.closedAt = 'Closeout time must be valid.';

  const outcomeBody = isRecord(body.outcome) ? body.outcome : {};
  const disposition = oneLine(outcomeBody.disposition, 24).toUpperCase() as MissionTerminalDisposition;
  const verification = oneLine(outcomeBody.verification, 24).toUpperCase() as OutcomeVerification;
  const summary = text(outcomeBody.summary, 4000);
  const observedAt = isoTimestamp(outcomeBody.observedAt);
  const evidenceRefs = uniqueStrings(outcomeBody.evidenceRefs, 50, 500).map(ref => safeEvidenceReference(ref)).filter(Boolean);
  const unverifiedReason = outcomeBody.unverifiedReason === null ? null : text(outcomeBody.unverifiedReason, 2000);
  if (!['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(disposition)) errors['outcome.disposition'] = 'Terminal disposition is invalid.';
  if (!['VERIFIED', 'UNVERIFIED'].includes(verification)) errors['outcome.verification'] = 'Outcome must be VERIFIED or UNVERIFIED.';
  if (summary.length < 10) errors['outcome.summary'] = 'Outcome summary is required.';
  if (!observedAt) errors['outcome.observedAt'] = 'Outcome observation time must be valid.';
  if (verification === 'VERIFIED' && !evidenceRefs.length) errors['outcome.evidenceRefs'] = 'Verified outcomes require evidence.';
  if (verification === 'UNVERIFIED' && (!unverifiedReason || unverifiedReason.length < 10)) errors['outcome.unverifiedReason'] = 'Explain why the outcome is unverified.';
  if (verification === 'UNVERIFIED' && disposition === 'SUCCEEDED') errors['outcome.disposition'] = 'An unverified outcome cannot be classified as succeeded.';

  const economicsBody = isRecord(body.economics) ? body.economics : {};
  const economicsVerification = oneLine(economicsBody.verification, 24).toUpperCase();
  let economics: MissionEconomicsInput | null = null;
  let realizedNetCents: number | null = null;
  if (economicsVerification === 'VERIFIED') {
    const currency = oneLine(economicsBody.currency, 3).toUpperCase();
    const collectedRevenueCents = nonNegativeInteger(economicsBody.collectedRevenueCents);
    const refundsCents = nonNegativeInteger(economicsBody.refundsCents);
    const directCostCents = nonNegativeInteger(economicsBody.directCostCents);
    const externalSpendCents = nonNegativeInteger(economicsBody.externalSpendCents);
    const laborMinutes = postgresNonNegativeInteger(economicsBody.laborMinutes);
    const sourceRefs = uniqueStrings(economicsBody.sourceRefs, 50, 500).map(ref => safeEvidenceReference(ref)).filter(Boolean);
    const settledRevenueEvidenceRef = economicsBody.settledRevenueEvidenceRef === null
      ? null
      : safeEvidenceReference(economicsBody.settledRevenueEvidenceRef);
    if (!/^[A-Z]{3}$/.test(currency)) errors['economics.currency'] = 'Verified economics require a currency.';
    if ([collectedRevenueCents, refundsCents, directCostCents, externalSpendCents, laborMinutes].some(value => value === null)) {
      errors['economics.amounts'] = 'Verified economics require non-negative whole amounts and labor minutes.';
    }
    if (!sourceRefs.length) errors['economics.sourceRefs'] = 'Verified economics require source evidence.';
    if ((collectedRevenueCents ?? 0) > 0 && !settledRevenueEvidenceRef) {
      errors['economics.settledRevenueEvidenceRef'] = 'Revenue counts only with settled-payment evidence.';
    }
    if (!Object.keys(errors).some(key => key.startsWith('economics.'))) {
      economics = {
        verification: 'VERIFIED', currency, collectedRevenueCents: collectedRevenueCents!, refundsCents: refundsCents!,
        directCostCents: directCostCents!, externalSpendCents: externalSpendCents!, laborMinutes: laborMinutes!,
        sourceRefs, settledRevenueEvidenceRef,
      };
      realizedNetCents = collectedRevenueCents! - refundsCents! - directCostCents! - externalSpendCents!;
    }
  } else if (economicsVerification === 'UNVERIFIED' || economicsVerification === 'NOT_APPLICABLE') {
    const reason = text(economicsBody.reason, 2000);
    const sourceRefs = uniqueStrings(economicsBody.sourceRefs, 50, 500).map(ref => safeEvidenceReference(ref)).filter(Boolean);
    const laborMinutes = economicsBody.laborMinutes === null ? null : postgresNonNegativeInteger(economicsBody.laborMinutes);
    const amountFields = ['currency', 'collectedRevenueCents', 'refundsCents', 'directCostCents', 'externalSpendCents', 'settledRevenueEvidenceRef'];
    if (reason.length < 10) errors['economics.reason'] = 'Explain unverified or not-applicable economics.';
    if (amountFields.some(field => economicsBody[field] !== null)) {
      errors['economics.unverifiedAmounts'] = 'Unverified economics cannot carry realized amounts or revenue evidence.';
    }
    if (economicsBody.laborMinutes !== null && laborMinutes === null) errors['economics.laborMinutes'] = 'Labor minutes must be non-negative or null.';
    economics = {
      verification: economicsVerification, reason, currency: null, collectedRevenueCents: null,
      refundsCents: null, directCostCents: null, externalSpendCents: null, laborMinutes,
      sourceRefs, settledRevenueEvidenceRef: null,
    };
  } else {
    errors['economics.verification'] = 'Economics must be VERIFIED, UNVERIFIED, or NOT_APPLICABLE.';
  }

  if (Object.keys(errors).length || !economics) return { ok: false, errors };
  const outcome: MissionOutcomeInput = {
    disposition, verification, summary, observedAt: observedAt!, evidenceRefs,
    unverifiedReason: verification === 'UNVERIFIED' ? unverifiedReason : null,
  };
  const closeoutValue: MissionCloseoutInput & { realizedNetCents: number | null } = {
    id, missionId, orgId, outcome, economics, learning, closedBy, closedAt: closedAt!, realizedNetCents,
  };
  const closeoutHash = missionHash(closeoutValue as unknown as JsonValue);
  return { ok: true, value: { ...closeoutValue, closeoutHash } };
}

export const MISSION_GENESIS_HASH = '0'.repeat(64);

export type MissionEventActorType = 'HUMAN' | 'AGENT' | 'SYSTEM';

export interface MissionEvent {
  id: string;
  missionId: string;
  orgId: string;
  sequence: number;
  aggregateVersion: number;
  eventType: string;
  actorType: MissionEventActorType;
  actorId: string;
  occurredAt: string;
  idempotencyKey: string;
  payload: { [key: string]: JsonValue };
  previousHash: string;
  eventHash: string;
}

export interface MissionEventInput {
  id: string;
  missionId: string;
  orgId: string;
  eventType: string;
  actorType: MissionEventActorType;
  actorId: string;
  occurredAt: string;
  idempotencyKey: string;
  payload: { [key: string]: JsonValue };
}

function missionEventHash(event: Omit<MissionEvent, 'eventHash'>): string {
  return missionHash(event as unknown as JsonValue);
}

export function appendMissionEvent(existing: readonly MissionEvent[], input: MissionEventInput): MissionEvent {
  if (existing.length && !verifyMissionEventChain(existing).ok) {
    throw new Error('Cannot append to an invalid mission event chain.');
  }
  const id = uuidIdentifier(input.id);
  const missionId = uuidIdentifier(input.missionId);
  const orgId = uuidIdentifier(input.orgId);
  const idempotencyKey = oneLine(input.idempotencyKey, 160);
  if (existing.some(event => event.id === id)) throw new Error('Duplicate mission event ID.');
  if (existing.some(event => event.idempotencyKey === idempotencyKey)) throw new Error('Duplicate mission event idempotency key.');
  const previous = existing.length ? existing[existing.length - 1] : null;
  if (previous && (previous.missionId !== missionId || previous.orgId !== orgId)) {
    throw new Error('Mission event cannot continue another mission or organization chain.');
  }
  const occurredAt = isoTimestamp(input.occurredAt);
  const eventType = oneLine(input.eventType, 100);
  const actorId = oneLine(input.actorId, 100);
  if (!id || !missionId || !orgId || !eventType || !actorId || !occurredAt) {
    throw new Error('Mission event UUID scope, actor, type, and time are required.');
  }
  if (previous && new Date(occurredAt).getTime() < new Date(previous.occurredAt).getTime()) {
    throw new Error('Mission event time cannot move backward.');
  }
  if (!['HUMAN', 'AGENT', 'SYSTEM'].includes(input.actorType)) throw new Error('Mission event actor type is invalid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,159}$/.test(idempotencyKey)) throw new Error('Mission event idempotency key is invalid.');
  const withoutHash: Omit<MissionEvent, 'eventHash'> = {
    id,
    missionId,
    orgId,
    sequence: (previous?.sequence ?? 0) + 1,
    aggregateVersion: (previous?.aggregateVersion ?? 0) + 1,
    eventType,
    actorType: input.actorType,
    actorId,
    occurredAt,
    idempotencyKey,
    payload: input.payload,
    previousHash: previous?.eventHash ?? MISSION_GENESIS_HASH,
  };
  return { ...withoutHash, eventHash: missionEventHash(withoutHash) };
}

export function verifyMissionEventChain(events: readonly MissionEvent[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const eventIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  events.forEach((event, index) => {
    const expectedSequence = index + 1;
    const expectedPreviousHash = index === 0 ? MISSION_GENESIS_HASH : events[index - 1].eventHash;
    if (event.sequence !== expectedSequence) errors.push(`sequence:${expectedSequence}`);
    if (event.aggregateVersion !== expectedSequence) errors.push(`version:${expectedSequence}`);
    if (event.previousHash !== expectedPreviousHash) errors.push(`previousHash:${expectedSequence}`);
    const { eventHash, ...withoutHash } = event;
    if (eventHash !== missionEventHash(withoutHash)) errors.push(`eventHash:${expectedSequence}`);
    if (index > 0 && (event.missionId !== events[0].missionId || event.orgId !== events[0].orgId)) errors.push(`scope:${expectedSequence}`);
    if (eventIds.has(event.id)) errors.push(`id:${expectedSequence}`);
    eventIds.add(event.id);
    if (idempotencyKeys.has(event.idempotencyKey)) errors.push(`idempotency:${expectedSequence}`);
    idempotencyKeys.add(event.idempotencyKey);
  });
  return { ok: errors.length === 0, errors };
}

export interface MissionTemplate {
  templateId: string;
  version: number;
  category: string;
  title: string;
  description: string;
  idealBuyer: string;
  painfulJob: string;
  defaultAuthority: MissionAuthorityLevel;
  capabilityIds: string[];
  externalActionTypes: string[];
  scope: Record<string, JsonValue>;
  humanResponsibilities: string[];
  acceptanceCriteria: string[];
  evidenceGates: string[];
  killCriteria: string[];
}

export const REVENUE_RECOVERY_PROOF_TEMPLATE: MissionTemplate = {
  templateId: 'revenue-recovery-proof',
  version: 1,
  category: 'revenue_operations',
  title: 'Revenue Recovery Proof',
  description: 'Prioritize owner-provided unclosed opportunities, prepare follow-up, and close the result with attributable evidence.',
  idealBuyer: 'An owner-led service business with at least 25 permissioned, unclosed estimates and a measurable payment path.',
  painfulJob: 'Quoted demand is lost because follow-up is inconsistent and outcomes are not recorded.',
  defaultAuthority: 'PREPARE',
  capabilityIds: [
    'tabular_data_ingest',
    'opportunity_prioritization',
    'communication_drafting',
    'response_triage',
    'outcome_accounting',
  ],
  externalActionTypes: ['customer_followup_send'],
  scope: {
    durationBusinessDays: 10,
    maximumRecords: 100,
    serviceLines: 1,
    communicationChannels: 1,
    priceCents: 15000,
    currency: 'USD',
    firstCohortLimit: 10,
    coldContactAllowed: false,
    autonomousSendByDefault: false,
    revenueGuarantee: false,
    clientOwnedChannelsOnly: true,
  },
  humanResponsibilities: [
    'Confirm lawful relationship, contact permission, and data authority.',
    'Approve each outgoing message unless a later OPERATE mandate explicitly allows the exact target and action.',
    'Handle relationship-sensitive replies, quoting, fulfillment, invoicing, and payment confirmation.',
  ],
  acceptanceCriteria: [
    'One owner-provided export is normalized and the eligible baseline is recorded.',
    'Priority records, draft follow-ups, response queue, and exception log are handed off.',
    'Replies, bookings, completed work, invoices, and settled payments remain separate outcome facts.',
  ],
  evidenceGates: [
    'Three paid proofs are closed.',
    'At least two proofs contain settled recovered-revenue evidence.',
    'Median verified value is at least three times the proof fee.',
    'Human fulfillment time is at most four hours per proof.',
  ],
  killCriteria: [
    'No eligible or permissioned records are available.',
    'Fewer than two of five qualified proofs produce settled recovered revenue.',
    'Human fulfillment remains above six hours after the third proof.',
    'Replies or bookings are being presented as collected revenue.',
  ],
};
