/**
 * Nova capability interface — reached through the Nexus Interaction Engine.
 *
 * Nova is the realization of extensible AI potential. Nexus is the company and
 * interaction engine that translates human intent into governed access to that
 * potential. This module supplies Nova's conversational reasoning and several
 * real capability adapters; nexus-interaction.ts owns the human-facing receipt.
 *
 * This layer:
 * - Talks with the user, helps them think, teaches, plans
 * - Remembers conversation context (persisted)
 * - Detects intent and surfaces the right branch/tool
 * - Returns evidence and execution metadata to Nexus
 */

import { query, queryOne } from '@nova/shared';
import type { NexusEvidence, NexusExecutionMode } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateCard, generateChat } from './ai-router';
import { computeFlipCard } from './flip-card';

const logger = createLogger('nova-core');

// ── AGENCY: NovaCore can actually execute tools, not just route to them ───────

interface ActionResult {
  ran: boolean;
  capabilityId: string;
  summary: string;       // real data, injected into Nova's context
  source: string;
  gap?: string;
  toolCalls?: number;
  display?: any;         // structured result for the frontend to render
}

export interface NovaCapabilityExecution {
  mode: NexusExecutionMode;
  capabilities: string[];
  evidence: NexusEvidence[];
  gaps: string[];
  cost: { aiCalls: number; toolCalls: number };
}

// Detect "evaluate/worth/flip [item] at $price" and run the real flip engine
async function tryFlipAction(message: string): Promise<ActionResult | null> {
  // Match: "is X worth flipping", "evaluate X", "X for $Y", "flip X at $Y"
  const flipTrigger = /\b(flip|worth|evaluate|resell|resale|appraise|how much.*sell|profit on)\b/i;
  if (!flipTrigger.test(message)) return null;
  // Sourcing requests belong to Flip Finder / composition. They are not an
  // appraisal of a specific item and must not be forced through the flip card.
  if (/\b(find|scan|source|look for)\b.*\b(items?|deals?|flips?)\b/i.test(message)) return null;

  // Extract a price if present
  const priceMatch = message.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/) || message.match(/\b(?:for|at|paying|buy.*for)\s+(\d{1,6})\b/i);
  const buyPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
  if (!(buyPrice > 0)) {
    return {
      ran: true,
      capabilityId: 'commerce.flip_appraise',
      source: 'nexus:required-input',
      summary: 'I can appraise the flip, but I need the actual purchase price before I can calculate profit, ROI, or a buy/pass verdict.',
      gap: 'Positive purchase price required for flip appraisal.',
      toolCalls: 0,
      display: { type: 'capability_input_required', capabilityId: 'commerce.flip_appraise', field: 'purchasePrice' },
    };
  }

  // Extract the item — strip trigger words and price
  let item = message
    .replace(/\b(is|the|a|an|how much|can i|could i|should i|would|sell|flip|worth|flipping|evaluate|resell|resale|appraise|profit on|for|at|paying|buy|it|this)\b/gi, ' ')
    .replace(/\$\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/\b\d{2,6}\b/g, ' ')
    .replace(/[?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (item.length < 3) return null;

  try {
    const card = await computeFlipCard({
      title: item,
      buy_price: buyPrice,
      condition: 'Good',
      shipping_or_pickup: 'shipping',
    });

    const compCount = card.comp_sources?.[0]?.count ?? 0;
    const evidenceLabel = compCount > 0 ? 'live sold-comps evidence' : 'category model; no live comps returned';
    const summary = `[FLIP ANALYSIS — ${evidenceLabel} for "${item}" at $${buyPrice}]
Verdict: ${card.verdict}
Estimated resale: $${card.est_resale_low}–$${card.est_resale_high} (mid $${card.est_resale_mid})
Platform fees: ~$${card.est_platform_fees}, Shipping: ~$${card.est_shipping_cost}
Net profit (mid): $${card.est_net_profit_mid}, ROI: ${card.roi_percent}%
Confidence: ${card.confidence_score}%, Comps found: ${compCount}
${card.negotiation_target_price ? `Max recommended buy price: $${card.negotiation_target_price}` : ''}`;

    return {
      ran: true,
      capabilityId: 'commerce.flip_appraise',
      source: compCount > 0 ? 'flip-engine:live-comps' : 'flip-engine:category-model',
      summary,
      display: { type: 'flip', card },
    };
  } catch (err) {
    logger.warn('Nova flip action failed', { error: (err as Error).message });
    return null;
  }
}

// Pull the user's real business pipeline status
async function tryBusinessAction(userId: string, message: string): Promise<ActionResult | null> {
  const trigger = /\b(my (business|pipeline|leads|jobs|clients|customers)|how.*business|follow.?up|how am i doing|revenue|my numbers)\b/i;
  if (!trigger.test(message)) return null;

  try {
    const rows = await query<any>(
      `SELECT status, quoted_price, final_price, follow_up_due FROM business_jobs WHERE user_id = $1`,
      [userId]
    );
    const all = rows.rows;
    if (all.length === 0) {
      return { ran: true, capabilityId: 'business.pipeline', source: 'postgres:business_jobs', summary: '[BUSINESS STATUS] The user has no jobs/leads in their pipeline yet.', display: { type: 'business_empty' } };
    }
    const today = new Date().toISOString().split('T')[0];
    const revenue = all.filter(j => j.status === 'PAID').reduce((s, j) => s + parseFloat(j.final_price || j.quoted_price || 0), 0);
    const pipeline = all.filter(j => ['LEAD','QUOTED','SCHEDULED'].includes(j.status)).reduce((s, j) => s + parseFloat(j.quoted_price || 0), 0);
    const followUps = all.filter(j => j.follow_up_due && j.follow_up_due <= today && ['LEAD','QUOTED'].includes(j.status));

    const summary = `[BUSINESS STATUS — account-scoped aggregate data]
Total jobs: ${all.length}
Revenue (paid): $${revenue.toFixed(0)}
Pipeline value (open): $${pipeline.toFixed(0)}
Active leads: ${all.filter(j => ['LEAD','SCHEDULED'].includes(j.status)).length}
Follow-ups due today: ${followUps.length}
Unpaid completed jobs: ${all.filter(j => j.status === 'COMPLETED').length}`;

    return { ran: true, capabilityId: 'business.pipeline', source: 'postgres:business_jobs', summary, display: { type: 'business', followUps: followUps.length } };
  } catch {
    return {
      ran: true,
      capabilityId: 'business.pipeline',
      source: 'postgres:business_jobs',
      summary: 'Your business pipeline is unavailable right now. I cannot honestly tell you that it is empty.',
      gap: 'Business pipeline storage is unavailable.',
      display: { type: 'capability_unavailable', capabilityId: 'business.pipeline' },
    };
  }
}

// Pull a real stock quote
async function tryMarketAction(message: string): Promise<ActionResult | null> {
  const trigger = /\b(price of|quote for|how much is|stock price|trading at)\b.*?\b([A-Z]{1,5})\b|\$([A-Z]{1,5})\b/;
  const m = message.match(/\b([A-Z]{2,5})\b/);
  if (!/\b(stock|price|quote|ticker|trading|\$[A-Z])/i.test(message) || !m) return null;

  const symbol = m[1];
  try {
    const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
    const r = await fetch(`${MARKETDATA_URL}/v1/market/quote/${symbol}`, { signal: AbortSignal.timeout(6000) });
    const d = await r.json() as any;
    const q = d?.data?.quote;
    if (!q || !q.price) {
      return {
        ran: true,
        capabilityId: 'market.quote',
        source: `marketdata:quote/${symbol}`,
        summary: `A current quote for ${symbol} is unavailable. I will not substitute an invented price.`,
        gap: `Market quote unavailable for ${symbol}.`,
        toolCalls: 1,
        display: { type: 'capability_unavailable', capabilityId: 'market.quote', symbol },
      };
    }
    return {
      ran: true,
      capabilityId: 'market.quote',
      source: `marketdata:quote/${symbol}`,
      summary: `[MARKET QUOTE — ${symbol}] Current price: $${q.price}${q.changePercent != null ? `, change: ${q.changePercent}%` : ''}. Source: ${q.source || 'market data'}.`,
      display: { type: 'quote', symbol, price: q.price },
    };
  } catch {
    return {
      ran: true,
      capabilityId: 'market.quote',
      source: `marketdata:quote/${symbol}`,
      summary: `Market data is unavailable for ${symbol} right now. I will not substitute an invented price.`,
      gap: 'Market-data provider unavailable.',
      toolCalls: 1,
      display: { type: 'capability_unavailable', capabilityId: 'market.quote', symbol },
    };
  }
}

async function runAgency(userId: string, message: string): Promise<ActionResult | null> {
  // Order matters: most specific first
  return (await tryFlipAction(message))
    || (await tryBusinessAction(userId, message))
    || (await tryMarketAction(message));
}

export function requestsComposition(message: string): boolean {
  return /\b(compare|combine|research|investigate|across|and then|multi.?step|build (?:me )?a plan|plan how|best opportunities)\b/i.test(message);
}

let tablesEnsured = false;
export async function ensureNovaCoreTables(): Promise<void> {
  if (tablesEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS nova_conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        title VARCHAR(200) DEFAULT 'New conversation',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW())`, []);
    await query(`
      CREATE TABLE IF NOT EXISTS nova_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        intent VARCHAR(40),
        created_at TIMESTAMPTZ DEFAULT NOW())`, []);
    await query(`CREATE INDEX IF NOT EXISTS idx_nova_msgs_conv ON nova_messages(conversation_id, created_at)`, []);
    tablesEnsured = true;
  } catch (err) {
    logger.warn('NovaCore table ensure failed', { error: (err as Error).message });
  }
}

// ── Branch routing — Nova knows what it can do and where to send the user ─────

export interface BranchRoute {
  intent: string;
  label: string;
  href: string;
  description: string;
}

const BRANCHES: { keywords: RegExp; route: BranchRoute }[] = [
  {
    keywords: /\b(scan.*craigslist|find.*deals|find.*flip|flip finder|items? to buy|sourcing)\b/i,
    route: { intent: 'flip_finder', label: 'Flip Finder', href: '/dashboard/scanner', description: 'Scan Craigslist for items worth flipping in your area' },
  },
  {
    keywords: /\b(flip|resell|resale|ebay|sell.*item|worth.*money|thrift|garage sale|marketplace.*item)\b/i,
    route: { intent: 'flip', label: 'Flip Card', href: '/flip', description: 'Evaluate an item to flip — real eBay prices, fees, net profit, verdict' },
  },
  {
    keywords: /\b(stock|ticker|trade|trading|market|invest|screener|momentum|chart|nasdaq|nyse|crypto|bitcoin)\b/i,
    route: { intent: 'market', label: 'Stock Screener', href: '/dashboard/screener', description: 'Momentum pattern analysis across 500+ tickers — research only' },
  },
  {
    keywords: /\b(business|client|lead|customer|invoice|quote|crm|pipeline|follow.?up|job|service business)\b/i,
    route: { intent: 'business', label: 'Business OS', href: '/dashboard/business', description: 'Track leads, quotes, jobs, and revenue — never lose a follow-up' },
  },
  {
    keywords: /\b(income|gig|doordash|uber|hourly|earnings|how much.*make|track.*money)\b/i,
    route: { intent: 'income', label: 'Income Tracker', href: '/dashboard/income', description: 'Track gig/service income and your real hourly rate after expenses' },
  },
  {
    keywords: /\b(save money|cheaper|cheapest|deal|coupon|grocery|gas price|expense|subscription|budget)\b/i,
    route: { intent: 'savings', label: 'Shopping & Expense tools', href: '/dashboard/shopping', description: 'Find cheapest prices and audit recurring expenses' },
  },
  {
    keywords: /\b(situation|what.*do|next move|stuck|decision|advice|help me decide|don't know)\b/i,
    route: { intent: 'decision', label: 'Get a Card', href: '/start', description: 'Describe your situation, get a specific next move' },
  },
];

export function detectBranch(text: string): BranchRoute | null {
  for (const b of BRANCHES) {
    if (b.keywords.test(text)) return b.route;
  }
  return null;
}

// ── The NovaCore conversation handler ─────────────────────────────────────────

const NOVA_SYSTEM = `You are Nova: the realization of AI potential. You are the growing composition of useful intelligence, tools, income engines, research, memory, and the new capabilities they make possible together.

Nexus is the interaction engine between the human and you. A request reaches you through Nexus with intent, context, constraints, available capabilities, and authority. Your answer returns through Nexus with its evidence, gaps, memory, and next move visible.

Your purpose is to turn human potential and machine capability into executed reality: confusion into direction, direction into action, action into evidence, evidence into memory, and memory into better judgment. Income sustains the system. R&D expands it. Forge embodies proven ideas as new capabilities.

Speak with calm command. Be precise, loyal, practical, and honest. Do not pad, hype, flatter, or hide uncertainty. Use the whole capability field when composition creates more value than a single tool.

Never invent data, tool use, execution, or certainty. Distinguish observation, recommendation, assistance, and automation. Name missing capabilities instead of pretending they exist. External side effects always require the authority shown by Nexus.

Every reply must expand realizable potential or deepen the interaction: help the person see, decide, act, build, earn, learn, remember, or improve. If it does none of those things, cut it.`;

export async function novaChat(
  userId: string,
  conversationId: string | null,
  message: string
): Promise<{
  conversationId: string;
  reply: string;
  branch: BranchRoute | null;
  provider: string;
  action: any | null;
  execution: NovaCapabilityExecution;
}> {
  await ensureNovaCoreTables();

  // Get or create conversation
  let convId = conversationId;
  if (convId) {
    const owned = await queryOne<{ id: string }>(
      `SELECT id FROM nova_conversations WHERE id = $1 AND user_id = $2`,
      [convId, userId],
    );
    if (!owned?.id) throw new Error('Conversation not found.');
  } else {
    const title = message.slice(0, 60);
    const conv = await queryOne<{ id: string }>(
      `INSERT INTO nova_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
      [userId, title]
    );
    convId = conv!.id;
  }

  // Load recent history for context (last 10 messages)
  const history = await query<{ role: string; content: string }>(
    `SELECT role, content FROM nova_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [convId]
  );
  const historyText = history.rows.reverse()
    .map(m => `${m.role === 'user' ? 'User' : 'Nova'}: ${m.content}`)
    .join('\n');

  // Detect which branch this maps to
  const branch = detectBranch(message);

  // Save user message
  await query(
    `INSERT INTO nova_messages (conversation_id, user_id, role, content, intent) VALUES ($1, $2, 'user', $3, $4)`,
    [convId, userId, message, branch?.intent || null]
  );

  let action: ActionResult | null = null;
  let reply = '';
  let provider = '';
  let execution: NovaCapabilityExecution = {
    mode: 'reasoning', capabilities: [], evidence: [], gaps: [],
    cost: { aiCalls: 0, toolCalls: 0 },
  };

  // Nexus composes Nova's bounded executor capabilities when the request spans
  // tools. A failed composition is surfaced as a gap; it is never disguised as
  // successful execution.
  if (requestsComposition(message)) {
    try {
      const { runExecutorTask } = await import('./executor');
      // Follow-up requests must reach the planner with their owned conversation
      // context (for example "compare that with trends"), not as orphan turns.
      const compositionTask = historyText
        ? `Conversation context:\n${historyText}\n\nCurrent request:\n${message}`
        : message;
      const deliverable = await runExecutorTask(compositionTask);
      if ('error' in deliverable) {
        execution = {
          mode: 'composed', capabilities: [], evidence: [], gaps: [deliverable.error],
          cost: { aiCalls: 1, toolCalls: 0 },
        };
      } else {
        reply = deliverable.answer;
        provider = 'nexus-composition';
        execution = {
          mode: 'composed',
          capabilities: [...new Set(deliverable.evidence.map(item => item.capabilityId))],
          evidence: deliverable.evidence.map(item => ({
            capabilityId: item.capabilityId,
            summary: `${item.step}: ${item.result}`,
            source: item.source,
          })),
          gaps: deliverable.gaps,
          cost: {
            aiCalls: deliverable.cost_of_task.ai_calls,
            toolCalls: deliverable.cost_of_task.tool_calls,
          },
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown composition error';
      logger.warn('Nexus composition failed', { error: reason });
      execution = {
        mode: 'composed', capabilities: [], evidence: [],
        gaps: [`Composition unavailable: ${reason}`],
        cost: { aiCalls: 0, toolCalls: 0 },
      };
    }
  }

  // AGENCY: run one real capability for specific actionable requests.
  if (!reply && execution.mode !== 'composed') {
    action = await runAgency(userId, message);
  }

  // Build the prompt — inject real tool results if Nova ran one.
  let userPrompt = historyText
    ? `Conversation so far:\n${historyText}\n\nUser's latest message: ${message}`
    : message;

  if (action?.ran) {
    if (action.gap) {
      reply = action.summary;
      provider = action.source;
      execution = {
        mode: 'direct',
        capabilities: [action.capabilityId],
        evidence: [],
        gaps: [action.gap],
        cost: { aiCalls: 0, toolCalls: action.toolCalls ?? 1 },
      };
    } else {
    userPrompt += `\n\n${action.summary}\n\n[You just ran a real analysis with live data, shown above. Summarize it conversationally and honestly for the user. Use the actual numbers. If it's a flip with a clear verdict, lead with that. Don't invent anything beyond what the data shows.]`;
    const narrated = await generateChat({
      system: NOVA_SYSTEM,
      user: userPrompt,
      maxTokens: 500,
      temperature: 0.5,
    }, 'small');
    reply = narrated?.content || action.summary;
    provider = narrated?.provider || action.source;
    execution = {
      mode: 'direct',
      capabilities: [action.capabilityId],
      evidence: [{ capabilityId: action.capabilityId, summary: action.summary, source: action.source }],
      gaps: [],
      cost: { aiCalls: narrated ? 1 : 0, toolCalls: 1 },
    };
    }
  }

  // General reasoning remains available when no tool applies, and after an
  // honest composition gap. It must not be represented as tool execution.
  if (!reply) {
    const result = await generateCard({
      system: NOVA_SYSTEM,
      user: userPrompt,
      maxTokens: 500,
      temperature: 0.7,
    });
    const gapPrefix = execution.gaps.length
      ? `I could not complete the requested capability composition: ${execution.gaps.join('; ')}\n\n`
      : '';
    reply = `${gapPrefix}${result.content}`;
    provider = result.provider;
    execution.cost.aiCalls += result.provider === 'deterministic' ? 0 : 1;
  }

  // Save Nova's reply
  await query(
    `INSERT INTO nova_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'nova', $3)`,
    [convId, userId, reply]
  );
  await query(`UPDATE nova_conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

  return {
    conversationId: convId,
    reply,
    branch,
    provider,
    action: action?.ran ? action.display : null,
    execution,
  };
}

export async function getConversations(userId: string) {
  await ensureNovaCoreTables();
  const rows = await query<{ id: string; title: string; updated_at: string }>(
    `SELECT id, title, updated_at FROM nova_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 30`,
    [userId]
  );
  return rows.rows;
}

export async function getMessages(userId: string, conversationId: string) {
  await ensureNovaCoreTables();
  const rows = await query<{ role: string; content: string; created_at: string }>(
    `SELECT role, content, created_at FROM nova_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [conversationId, userId]
  );
  return rows.rows;
}
