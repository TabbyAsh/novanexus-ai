/**
 * NEXUS INTERACTION ENGINE
 *
 * Nexus is the company-facing boundary between a person and Nova. It captures
 * intent, invokes Nova's bounded capabilities, states authority and gaps, and
 * leaves an immutable receipt that can later be closed with a human outcome.
 */

import {
  generateId,
  query,
  queryOne,
  transaction,
  type NexusAuthorityMode,
  type NexusCapabilityDescriptor,
  type NexusInteractionEnvelope,
} from '@nova/shared';
import { createHash } from 'node:crypto';
import { novaChat } from './nova-core';
import { listExecutorCapabilities } from './executor';
import { codexSpecialistAvailable } from './codex-specialist';
import { writeArtifact } from './substrate';
import {
  handleEconomicTradeCommand,
  targetsTrade0001,
  type EconomicTradeCommandResult,
} from './economic-trade-state';

const DIRECT_CAPABILITIES: NexusCapabilityDescriptor[] = [
  {
    id: 'nova.reasoning',
    name: 'Nova Reasoning',
    sector: 'decision',
    description: 'Use Nova\'s reasoning through Nexus to produce a practical response and explicit next move.',
    status: 'available',
    authority: 'recommend',
    entrypoint: '/v1/nexus/interact',
    sideEffects: [],
    requires: ['authenticated Nexus session'],
  },
  {
    id: 'decision.card',
    name: 'Decision Card',
    sector: 'decision',
    description: 'Turn an unstructured situation into a closable decision and next-action card.',
    status: 'available',
    authority: 'recommend',
    entrypoint: '/start',
    sideEffects: ['persists a decision record after submission'],
    requires: ['situation context'],
  },
  {
    id: 'economic.trade.inspect',
    name: 'Economic Trade State',
    sector: 'business',
    description: 'Read a durable Trade, its blocking gaps, evidence requirements, actions, events, and next action without invoking an LLM.',
    status: 'available',
    authority: 'observe',
    entrypoint: '/v1/nexus/interact',
    sideEffects: [],
    requires: ['authenticated Nexus session', 'durable economic Trade state'],
  },
  {
    id: 'economic.trade.field_measurement_task',
    name: 'Field Measurement Task',
    sector: 'business',
    description: 'Create an idempotent, durable human task to collect structure measurements and current-condition evidence for a blocked Trade.',
    status: 'available',
    authority: 'assist',
    entrypoint: '/v1/nexus/interact',
    sideEffects: ['creates an internal task and append-only Trade event', 'does not contact the buyer or perform a site visit'],
    requires: ['authenticated Nexus session', 'open geometry gap'],
  },
  {
    id: 'commerce.flip_appraise',
    name: 'Flip Appraisal',
    sector: 'commerce',
    description: 'Estimate resale range, fees, net profit, ROI, and a buy/no-buy verdict.',
    status: 'available',
    authority: 'recommend',
    entrypoint: '/flip',
    sideEffects: [],
    requires: ['item description', 'purchase price for profit analysis'],
  },
  {
    id: 'business.pipeline',
    name: 'Business Pipeline',
    sector: 'business',
    description: 'Read the authenticated user\'s leads, jobs, follow-ups, and realized revenue.',
    status: 'available',
    authority: 'observe',
    entrypoint: '/dashboard/business',
    sideEffects: [],
    requires: ['authenticated Nexus session'],
  },
  {
    id: 'market.quote',
    name: 'Market Quote',
    sector: 'market',
    description: 'Read a current market quote from the configured market-data capability.',
    status: 'available',
    authority: 'observe',
    entrypoint: '/dashboard/screener',
    sideEffects: [],
    requires: ['market-data provider availability'],
  },
  {
    id: 'world.presence',
    name: 'World Presence',
    sector: 'world',
    description: 'Render Nova activity as a spatial, explorable interaction surface.',
    status: 'degraded',
    authority: 'assist',
    entrypoint: '/world',
    sideEffects: ['can create persistent watchers or notification subscriptions after explicit confirmation'],
    requires: ['canonical Nexus receipt and memory adapter is not yet complete'],
  },
  {
    id: 'forge.capability_proposal',
    name: 'Forge Capability Proposal',
    sector: 'forge',
    description: 'Turn a proven need or capability gap into a governed build proposal.',
    status: 'gated',
    authority: 'assist',
    entrypoint: '/dashboard/forge-control',
    sideEffects: ['may create code or deployment artifacts after approval'],
    requires: ['human approval', 'evaluation and release gates'],
  },
  {
    id: 'forge.codex_specialist',
    name: 'Codex Engineering Specialist',
    sector: 'forge',
    description: 'Inspect a configured codebase and produce governed engineering analysis or implementation proposals.',
    status: codexSpecialistAvailable() ? 'gated' : 'reserved',
    authority: 'assist',
    entrypoint: '/v1/agents/codex/run',
    sideEffects: ['invokes an external coding-agent runtime; filesystem remains read-only'],
    requires: ['platform-owner authority', 'explicit invocation', 'OpenAI API key', 'configured workspace', 'human approval before implementation'],
  },
  {
    id: 'forge.recursive_improvement',
    name: 'Recursive Capability Improvement',
    sector: 'forge',
    description: 'Generate, sandbox, evaluate, and nominate better prompts or capabilities without self-promotion.',
    status: 'gated',
    authority: 'assist',
    entrypoint: '/v1/agents/evals/improve',
    sideEffects: ['creates inactive candidates and approval requests'],
    requires: ['objective evaluation suite', 'promotion margin', 'platform-owner invocation', 'human forge.approve promotion'],
  },
  {
    id: 'market.live_execute',
    name: 'Live Market Execution',
    sector: 'market',
    description: 'Execute a live market order only through the separate risk and approval boundary.',
    status: process.env.LIVE_TRADING === 'true' ? 'gated' : 'reserved',
    authority: 'automate',
    entrypoint: '/dashboard/trading',
    sideEffects: ['places live financial orders', 'can lose capital'],
    requires: ['LIVE_TRADING=true', 'broker credentials', 'risk approval', 'explicit human authorization'],
  },
  {
    id: 'social.publish',
    name: 'Social Publishing',
    sector: 'social',
    description: 'Publish approved content through connected social accounts.',
    status: process.env.AUTO_POSTING === 'true' ? 'gated' : 'reserved',
    authority: 'automate',
    entrypoint: '/dashboard/social',
    sideEffects: ['publishes content to external audiences'],
    requires: ['connected account', 'platform policy checks', 'explicit approval policy'],
  },
  {
    id: 'research.sourced_synthesis',
    name: 'Sourced Research Synthesis',
    sector: 'research',
    description: 'Research external sources and synthesize evidence into a decision-ready brief.',
    status: 'reserved',
    authority: 'recommend',
    entrypoint: null,
    sideEffects: [],
    requires: ['source retrieval capability', 'citation verification'],
  },
];

export function listNexusCapabilities(): NexusCapabilityDescriptor[] {
  return [...DIRECT_CAPABILITIES, ...listExecutorCapabilities()];
}

function ownerRef(userId: string): string {
  return createHash('sha256').update(`nexus-owner:${userId}`).digest('hex');
}

function conversationRef(conversationId: string): string {
  return createHash('sha256').update(`nexus-conversation:${conversationId}`).digest('hex');
}

function authorityFor(capabilities: string[]): NexusAuthorityMode {
  if (capabilities.includes('economic.trade.field_measurement_task')) return 'assist';
  if (
    capabilities.length > 0
    && capabilities.every(id => [
      'economic.trade.inspect',
      'market.quote',
      'business.pipeline',
      'executor.market_quote',
      'executor.trend_scan',
      'executor.substrate_search',
    ].includes(id))
  ) {
    return 'observe';
  }
  return 'recommend';
}

async function persistDeterministicTurn(
  userId: string,
  conversationId: string | null,
  message: string,
  reply: string,
): Promise<string> {
  await query(`
    CREATE TABLE IF NOT EXISTS nova_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      title VARCHAR(200) DEFAULT 'New conversation',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);
  await query(`
    CREATE TABLE IF NOT EXISTS nova_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL,
      user_id UUID NOT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      intent VARCHAR(40),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);
  await query('CREATE INDEX IF NOT EXISTS idx_nova_msgs_conv ON nova_messages(conversation_id, created_at)', []);

  let resolvedConversationId = conversationId;
  if (resolvedConversationId) {
    const owned = await queryOne<{ id: string }>(
      'SELECT id FROM nova_conversations WHERE id = $1 AND user_id = $2',
      [resolvedConversationId, userId],
    );
    if (!owned?.id) throw new Error('Conversation not found.');
  } else {
    const created = await queryOne<{ id: string }>(
      'INSERT INTO nova_conversations (user_id, title) VALUES ($1, $2) RETURNING id',
      [userId, message.slice(0, 60)],
    );
    if (!created?.id) throw new Error('Conversation could not be created.');
    resolvedConversationId = created.id;
  }

  await query(
    `INSERT INTO nova_messages (conversation_id, user_id, role, content, intent)
     VALUES ($1, $2, 'user', $3, 'economic_trade')`,
    [resolvedConversationId, userId, message],
  );
  await query(
    `INSERT INTO nova_messages (conversation_id, user_id, role, content, intent)
     VALUES ($1, $2, 'nova', $3, 'economic_trade')`,
    [resolvedConversationId, userId, reply],
  );
  await query('UPDATE nova_conversations SET updated_at = NOW() WHERE id = $1', [resolvedConversationId]);

  return resolvedConversationId;
}

interface NexusTurn {
  conversationId: string;
  reply: string;
  branch: null | { intent: string; label: string; href: string; description: string };
  provider: string;
  action: unknown | null;
  execution: NexusInteractionEnvelope['execution'];
}

async function economicTradeTurn(
  userId: string,
  conversationId: string | null,
  message: string,
): Promise<NexusTurn | null> {
  if (!targetsTrade0001(message)) return null;

  let result: EconomicTradeCommandResult;
  try {
    const handled = await handleEconomicTradeCommand(userId, message);
    if (!handled) return null;
    result = handled;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Trade state unavailable.';
    const reply = `Trade #0001 could not be read from durable state. ${reason}`;
    const resolvedConversationId = await persistDeterministicTurn(userId, conversationId, message, reply)
      .catch(() => conversationId || generateId());
    return {
      conversationId: resolvedConversationId,
      reply,
      branch: null,
      provider: 'deterministic:trade-state-unavailable',
      action: { type: 'economic_trade_unavailable', deterministic: true },
      execution: {
        mode: 'direct',
        capabilities: ['economic.trade.inspect'],
        evidence: [],
        gaps: ['Durable economic Trade state is unavailable.'],
        cost: { aiCalls: 0, toolCalls: 1 },
      },
    };
  }

  const openGaps = result.trade.gaps
    .filter(gap => gap.blocking && gap.status !== 'RESOLVED' && gap.status !== 'WAIVED')
    .map(gap => `${gap.id}:${gap.code}`);
  const resolvedConversationId = await persistDeterministicTurn(userId, conversationId, message, result.reply);

  return {
    conversationId: resolvedConversationId,
    reply: result.reply,
    branch: null,
    provider: 'deterministic:trade-state',
    action: {
      type: 'economic_trade',
      deterministic: true,
      command: result.command,
      trade: result.trade,
    },
    execution: {
      mode: 'direct',
      capabilities: [result.capabilityId],
      evidence: [{
        capabilityId: result.capabilityId,
        summary: `Read Trade #${result.trade.reference}: ${openGaps.length} blocking gap(s), ${result.trade.actions.length} durable action(s).`,
        source: result.source,
      }],
      gaps: openGaps,
      cost: { aiCalls: 0, toolCalls: result.command === 'inspect' ? 1 : 2 },
    },
  };
}

export async function nexusInteract(
  userId: string,
  conversationId: string | null,
  message: string,
): Promise<NexusInteractionEnvelope> {
  const interactionId = generateId();
  const createdAt = new Date().toISOString();
  const deterministicTurn = await economicTradeTurn(userId, conversationId, message);
  const turn: NexusTurn = deterministicTurn || await novaChat(userId, conversationId, message);
  const primaryIntent = deterministicTurn
    ? 'economic_trade'
    : turn.execution.mode === 'composed'
      ? 'capability_composition'
      : turn.branch?.intent || 'conversation';
  const authorityMode = authorityFor(turn.execution.capabilities);

  const artifactId = await writeArtifact({
    kind: 'mission_report',
    regime: deterministicTurn ? 'EXPLOITATION' : 'EXPLORATION',
    authorType: 'system',
    authorId: 'nexus-interaction',
    payload: {
      agent: 'Nexus Interaction Engine',
      findings: turn.execution.evidence.map(item => `${item.capabilityId} used`),
      anomalies: turn.execution.gaps.map(() => 'capability gap recorded'),
      interactionId,
      ownerRef: ownerRef(userId),
      conversationRef: conversationRef(turn.conversationId),
      intent: primaryIntent,
      execution: {
        mode: turn.execution.mode,
        capabilities: turn.execution.capabilities,
        evidenceCount: turn.execution.evidence.length,
        gapCount: turn.execution.gaps.length,
        cost: turn.execution.cost,
      },
      authority: {
        mode: authorityMode,
        externalSideEffectsPerformed: false,
        humanApprovalRequiredForSideEffects: true,
      },
      contentRedacted: true,
      provider: turn.provider,
    },
  });

  return {
    interactionId,
    conversationId: turn.conversationId,
    createdAt,
    intent: {
      primary: primaryIntent,
      route: turn.branch ? {
        label: turn.branch.label,
        href: turn.branch.href,
        description: turn.branch.description,
      } : null,
    },
    execution: turn.execution,
    authority: {
      mode: authorityMode,
      externalSideEffectsPerformed: false,
      humanApprovalRequiredForSideEffects: true,
    },
    nova: { reply: turn.reply, provider: turn.provider },
    memory: {
      persisted: Boolean(artifactId),
      artifactId,
      outcomeClosable: Boolean(artifactId),
    },
    action: turn.action,
  };
}

export interface NexusOutcomeInput {
  result: 'worked' | 'partial' | 'failed';
  note?: string;
  value?: number | null;
}

export interface NexusInteractionRecord {
  interactionId: string;
  conversationRef: string;
  artifactId: string;
  createdAt: string;
  intent: string;
  execution: Record<string, unknown>;
  authority: Record<string, unknown>;
  provider: string;
  resolved: boolean;
}

export async function listNexusInteractions(userId: string, limit = 30): Promise<NexusInteractionRecord[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 30;
  const rows = await query<{ id: string; created_at: string; payload: any; resolved: boolean }>(
    `SELECT a.id, a.created_at, a.payload,
       EXISTS (SELECT 1 FROM artifacts o WHERE o.kind = 'outcome' AND a.id = ANY(o.refs)) AS resolved
     FROM artifacts a
     WHERE a.kind = 'mission_report'
       AND a.author_id = 'nexus-interaction'
       AND a.payload->>'ownerRef' = $1
     ORDER BY a.created_at DESC LIMIT $2`,
    [ownerRef(userId), boundedLimit],
  );
  return rows.rows
    .filter(row => row.payload?.interactionId)
    .map(row => ({
      interactionId: String(row.payload.interactionId),
      conversationRef: String(row.payload.conversationRef || ''),
      artifactId: row.id,
      createdAt: row.created_at,
      intent: String(row.payload.intent || 'conversation'),
      execution: row.payload.execution || {},
      authority: row.payload.authority || {},
      provider: String(row.payload.provider || 'unknown'),
      resolved: Boolean(row.resolved),
    }));
}

export async function recordNexusInteractionOutcome(
  userId: string,
  interactionId: string,
  input: NexusOutcomeInput,
): Promise<{ ok: boolean; notFound?: boolean; conflict?: boolean; artifactId?: string; outcomeArtifactId?: string; detailsPersisted?: boolean }> {
  const result = await transaction(async client => {
    // The receipt row is the serialization boundary. Concurrent closes for the
    // same interaction wait here, so only the first immutable label can win.
    const targetResult = await client.query<{ id: string }>(
      `SELECT id FROM artifacts
       WHERE kind = 'mission_report'
         AND payload->>'interactionId' = $1
         AND payload->>'ownerRef' = $2
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [interactionId, ownerRef(userId)],
    );
    const target = targetResult.rows[0];
    if (!target?.id) return { status: 'not_found' as const };

    const existingResult = await client.query<{ id: string }>(
      `SELECT id FROM artifacts WHERE kind = 'outcome' AND $1 = ANY(refs)
       ORDER BY created_at DESC LIMIT 1`,
      [target.id],
    );
    if (existingResult.rows[0]?.id) {
      return { status: 'conflict' as const, artifactId: target.id };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO artifacts (kind, regime, author_type, author_id, mission_id, refs, payload)
       VALUES ('outcome', NULL, 'human', $1, NULL, $2, $3) RETURNING id`,
      [
        ownerRef(userId),
        [target.id],
        JSON.stringify({
          result: {
            status: input.result,
            interactionId,
            detailsRedacted: true,
          },
        }),
      ],
    );
    const outcomeArtifactId = inserted.rows[0]?.id;
    return outcomeArtifactId
      ? { status: 'created' as const, artifactId: target.id, outcomeArtifactId }
      : { status: 'failed' as const, artifactId: target.id };
  }).catch(() => ({ status: 'failed' as const }));

  if (result.status === 'not_found') return { ok: false, notFound: true };
  if (result.status === 'conflict') return { ok: false, conflict: true, artifactId: result.artifactId };
  if (result.status !== 'created') {
    return { ok: false, artifactId: 'artifactId' in result ? result.artifactId : undefined };
  }

  const detailsRequested = Boolean(String(input.note || '').trim()) || input.value != null;
  // Free-form notes and untyped value do not enter the aggregate economic
  // ledger. A future typed, tenant-owned outcome contract will persist them.
  return {
    ok: true,
    artifactId: result.artifactId,
    outcomeArtifactId: result.outcomeArtifactId,
    detailsPersisted: !detailsRequested,
  };
}
