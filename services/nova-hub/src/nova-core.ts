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

const logger = createLogger('nova-core');

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

  // Build the prompt
  const userPrompt = historyText
    ? `Conversation so far:\n${historyText}\n\nUser's latest message: ${message}`
    : message;

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
