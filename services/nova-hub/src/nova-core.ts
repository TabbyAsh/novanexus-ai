/**
 * NovaCore — the central AI command center.
 *
 * This is the TRUNK. Everything else (flip, screener, business OS, income tools)
 * is a BRANCH that NovaCore routes to and coordinates.
 *
 * NovaCore is the conversational Nova intelligence:
 * - Talks with the user, helps them think, teaches, plans
 * - Remembers conversation context (persisted)
 * - Detects intent and surfaces the right branch/tool
 * - Is the unified interface that makes Nova feel like ONE operating system
 *
 * Per the founder's canonical notes: "NovaCore: a local-first AI command center
 * for personal research, market analysis, project planning, and learning."
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { generateCard } from './ai-router';
import { computeFlipCard } from './flip-card';

const logger = createLogger('nova-core');

// ── AGENCY: NovaCore can actually execute tools, not just route to them ───────

interface ActionResult {
  ran: boolean;
  summary: string;       // real data, injected into Nova's context
  display?: any;         // structured result for the frontend to render
}

// Detect "evaluate/worth/flip [item] at $price" and run the real flip engine
async function tryFlipAction(message: string): Promise<ActionResult | null> {
  // Match: "is X worth flipping", "evaluate X", "X for $Y", "flip X at $Y"
  const flipTrigger = /\b(flip|worth|evaluate|resell|resale|appraise|how much.*sell|profit on)\b/i;
  if (!flipTrigger.test(message)) return null;

  // Extract a price if present
  const priceMatch = message.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/) || message.match(/\b(?:for|at|paying|buy.*for)\s+(\d{1,6})\b/i);
  const buyPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

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

    const summary = `[FLIP ANALYSIS — real eBay data for "${item}"${buyPrice ? ` at $${buyPrice}` : ''}]
Verdict: ${card.verdict}
Estimated resale: $${card.est_resale_low}–$${card.est_resale_high} (mid $${card.est_resale_mid})
Platform fees: ~$${card.est_platform_fees}, Shipping: ~$${card.est_shipping_cost}
Net profit (mid): $${card.est_net_profit_mid}, ROI: ${card.roi_percent}%
Confidence: ${card.confidence_score}%, Comps found: ${card.comp_sources?.[0]?.count ?? 0}
${card.negotiation_target_price ? `Max recommended buy price: $${card.negotiation_target_price}` : ''}`;

    return { ran: true, summary, display: { type: 'flip', card } };
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
      `SELECT status, quoted_price, final_price, follow_up_due, contact_name FROM business_jobs WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));
    const all = rows.rows;
    if (all.length === 0) {
      return { ran: true, summary: '[BUSINESS STATUS] The user has no jobs/leads in their pipeline yet.', display: { type: 'business_empty' } };
    }
    const today = new Date().toISOString().split('T')[0];
    const revenue = all.filter(j => j.status === 'PAID').reduce((s, j) => s + parseFloat(j.final_price || j.quoted_price || 0), 0);
    const pipeline = all.filter(j => ['LEAD','QUOTED','SCHEDULED'].includes(j.status)).reduce((s, j) => s + parseFloat(j.quoted_price || 0), 0);
    const followUps = all.filter(j => j.follow_up_due && j.follow_up_due <= today && ['LEAD','QUOTED'].includes(j.status));

    const summary = `[BUSINESS STATUS — real data]
Total jobs: ${all.length}
Revenue (paid): $${revenue.toFixed(0)}
Pipeline value (open): $${pipeline.toFixed(0)}
Active leads: ${all.filter(j => ['LEAD','SCHEDULED'].includes(j.status)).length}
Follow-ups due today: ${followUps.length}${followUps.length ? ' — ' + followUps.map(j => j.contact_name).join(', ') : ''}
Unpaid completed jobs: ${all.filter(j => j.status === 'COMPLETED').length}`;

    return { ran: true, summary, display: { type: 'business', followUps: followUps.length } };
  } catch {
    return null;
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
    if (!q || !q.price) return null;
    return {
      ran: true,
      summary: `[MARKET QUOTE — ${symbol}] Current price: $${q.price}${q.changePercent != null ? `, change: ${q.changePercent}%` : ''}. Source: ${q.source || 'market data'}.`,
      display: { type: 'quote', symbol, price: q.price },
    };
  } catch {
    return null;
  }
}

async function runAgency(userId: string, message: string): Promise<ActionResult | null> {
  // Order matters: most specific first
  return (await tryFlipAction(message))
    || (await tryBusinessAction(userId, message))
    || (await tryMarketAction(message));
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
    keywords: /\b(flip|resell|resale|ebay|sell.*item|worth.*money|thrift|garage sale|marketplace.*item)\b/i,
    route: { intent: 'flip', label: 'Flip Card', href: '/flip', description: 'Evaluate an item to flip — real eBay prices, fees, net profit, verdict' },
  },
  {
    keywords: /\b(scan.*craigslist|find.*deals|find.*flip|flip finder|items? to buy|sourcing)\b/i,
    route: { intent: 'flip_finder', label: 'Flip Finder', href: '/dashboard/scanner', description: 'Scan Craigslist for items worth flipping in your area' },
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

const NOVACORE_SYSTEM = `You are Nova — a personal AI command center and intelligence companion. You are NOT a generic chatbot. You are the central intelligence of a system that helps people think, plan, learn, analyze markets, run businesses, find opportunities, and make better decisions.

Your personality: calm, sharp, direct, genuinely helpful. You speak plainly. You don't pad. You don't hype. You're like a brilliant friend who happens to have access to real tools.

You have BRANCHES you can guide people to:
- Flip Card / Flip Finder: evaluate items to resell, scan for deals
- Stock Screener: market research and momentum analysis (research only, never financial advice)
- Business OS: lead/customer/job pipeline for service businesses
- Income Tracker: track gig and service earnings, real hourly rate
- Shopping & Expense tools: find cheapest prices, audit recurring expenses
- Decision Cards: structured next-move for any situation

When someone's request matches a branch, naturally mention that Nova has a tool for it and that you can take them there. But first, actually help them think through their situation. Be useful in the conversation itself, not just a router.

Keep responses focused and useful. Use the person's actual context. If you don't know something, say so. Never invent numbers or fake data.`;

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
}> {
  await ensureNovaCoreTables();

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
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

  // AGENCY: actually run a tool if the message is actionable. Real data, in-chat.
  const action = await runAgency(userId, message);

  // Build the prompt — inject real tool results if Nova ran one
  let userPrompt = historyText
    ? `Conversation so far:\n${historyText}\n\nUser's latest message: ${message}`
    : message;

  if (action?.ran) {
    userPrompt += `\n\n${action.summary}\n\n[You just ran a real analysis with live data, shown above. Summarize it conversationally and honestly for the user. Use the actual numbers. If it's a flip with a clear verdict, lead with that. Don't invent anything beyond what the data shows.]`;
  }

  const result = await generateCard({
    system: NOVACORE_SYSTEM,
    user: userPrompt,
    maxTokens: 500,
    temperature: 0.7,
  });

  // Save Nova's reply
  await query(
    `INSERT INTO nova_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'nova', $3)`,
    [convId, userId, result.content]
  );
  await query(`UPDATE nova_conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

  return {
    conversationId: convId,
    reply: result.content,
    branch,
    provider: result.provider,
    action: action?.ran ? action.display : null,
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
