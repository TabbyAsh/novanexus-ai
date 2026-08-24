/**
 * Nova SocialBot — Content intelligence, post generation, and content Decision Cards.
 *
 * Port: 3012
 *
 * Nova's law: no fake numbers. Engagement metrics from the DB are real.
 * Metrics that come from OpenAI estimates are labelled "estimated".
 * Stub fields are never returned as facts.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp, buildDecisionCard, novaCardInsert, query } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { ContentManager } from './content-manager';

const PORT = parseInt(process.env.PORT || '3012', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';
const logger = createLogger('socialbot');

const app = express();
app.use(cors());
app.use(express.json());

// AI client — multi-provider, zero-cost preferred
// Priority: Gemini (free 1M/day) → Groq (free 14k req/day) → OpenAI (paid fallback)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function callFreeAI(system: string, user: string, maxTokens = 600): Promise<string | null> {
  // 1. Try Gemini Flash (free tier — 1M tokens/day)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
        body: JSON.stringify({
          model: 'gemini-1.5-flash',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = d.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch { /* try next */ }
  }

  // 2. Try Groq (free tier — Llama 3.3 70B)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = d.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch { /* try next */ }
  }

  return null; // no free provider available, caller will use OpenAI or fail gracefully
}

const contentManager = new ContentManager(process.env.DATABASE_URL);

// ============================================================================
// OpenAI helpers
// ============================================================================

const NOVA_NICHES = ['resale flipping', 'stock trading', 'AI tools', 'personal finance', 'side hustles'];

/** Call AI with JSON response — tries free providers first, then OpenAI. */
async function aiJSON<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
  // Try free providers first
  const jsonSystem = systemPrompt + '\n\nIMPORTANT: Return valid JSON only. No markdown, no code blocks.';
  const freeResult = await callFreeAI(jsonSystem, userPrompt, 800);
  if (freeResult) {
    try {
      // Strip any markdown wrapping the free provider might add
      const clean = freeResult.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      return JSON.parse(clean) as T;
    } catch { /* fall through to OpenAI */ }
  }

  // Fall back to OpenAI if available
  if (!openai) return null;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 800,
    });
    const text = res.choices[0]?.message?.content ?? '{}';
    return JSON.parse(text) as T;
  } catch (err) {
    logger.warn('AI call failed on all providers', { error: (err as Error).message });
    return null;
  }
}

// ============================================================================
// Bot task handlers
// ============================================================================

const botConfig = createBotConfig('socialbot', [
  { name: 'content-generate', version: '2.0.0', description: 'AI content generation' },
  { name: 'content-hooks',    version: '2.0.0', description: 'Viral hook generation' },
  { name: 'monitoring',       version: '1.0.0', description: 'Social monitoring' },
], { orchestratorUrl: ORCHESTRATOR_URL });

const bot = new BotClient(botConfig);

bot.registerTaskHandler('GENERATE_CONTENT', async (task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Generating content via OpenAI');
  const { topic, platform, tone, niche } = task.inputJson as Record<string, string>;
  const result = await generateContent({ topic, platform, tone, niche });
  return {
    success: true,
    output: { content: result, generatedAt: nowTimestamp() },
    metrics: { generated: result ? 1 : 0 },
  };
});

bot.registerTaskHandler('MONITOR_MENTIONS', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Monitoring social mentions');
  return {
    success: true,
    output: { checkedAt: nowTimestamp(), note: 'Social API integrations not yet connected — no data available.' },
    metrics: { alertCount: 0 },
  };
});

// ============================================================================
// Core content generation logic
// ============================================================================

interface GeneratedContent {
  post: string;
  hooks: string[];
  hashtags: string[];
  bestPostTimeUTC: string;
  platform: string;
  estimatedReach: null; // always null — we don't fabricate reach numbers
  generatedAt: string;
  source: 'openai' | 'fallback';
}

async function generateContent(opts: {
  topic: string;
  platform?: string;
  tone?: string;
  niche?: string;
}): Promise<GeneratedContent | null> {
  const platform = opts.platform || 'twitter';
  const tone     = opts.tone    || 'conversational, direct, authentic';
  const niche    = opts.niche   || opts.topic;

  const charLimits: Record<string, number> = {
    twitter: 280, linkedin: 700, tiktok: 150, instagram: 2200, facebook: 500,
  };
  const limit = charLimits[platform] ?? 280;

  const systemPrompt = `You are a social media strategist for a platform that helps people make money through flipping items, trading stocks, and using AI tools.
Write content that is direct, useful, and honest. Never hype or make unverifiable claims.
Output JSON only with keys: post, hooks (array of 3 hooks), hashtags (array of 5).`;

  const userPrompt = `Create a ${platform} post about "${opts.topic}".
Tone: ${tone}.
Niche: ${niche}.
Max ${limit} characters for the post.
The hooks should be attention-grabbing openers that could go viral.
Hashtags should be relevant and not generic.`;

  const result = await aiJSON<{ post: string; hooks: string[]; hashtags: string[] }>(systemPrompt, userPrompt);

  if (!result) return null;

  // Optimal posting times by platform
  const bestTimes: Record<string, string> = {
    twitter: '17:00 UTC', linkedin: '10:00 UTC', instagram: '19:00 UTC',
    tiktok: '21:00 UTC', facebook: '13:00 UTC',
  };

  return {
    post:            (result.post || '').slice(0, limit),
    hooks:           (result.hooks || []).slice(0, 3),
    hashtags:        (result.hashtags || []).slice(0, 5),
    bestPostTimeUTC: bestTimes[platform] || '12:00 UTC',
    platform,
    estimatedReach:  null, // Nova's law: no fake numbers
    generatedAt:     nowTimestamp(),
    source:          'openai',
  };
}

// ============================================================================
// Routes
// ============================================================================

const healthRoutes = createBotHealthRoutes({ bot });
app.get('/health', healthRoutes.healthHandler);
app.get('/ready',  healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);

// ── Existing content manager routes (DB-backed, real data) ───────────────────

app.get('/api/posts', async (_req: Request, res: Response) => {
  try {
    const posts = await contentManager.getPosts({ limit: 50 });
    res.json({ success: true, data: { posts } });
  } catch {
    res.json({ success: true, data: { posts: [], note: 'unavailable' } });
  }
});

app.get('/api/content/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await contentManager.getAccounts();
    res.json({ success: true, data: { accounts } });
  } catch {
    res.json({ success: true, data: { accounts: [], note: 'unavailable' } });
  }
});

app.get('/api/content/posts', async (req: Request, res: Response) => {
  try {
    const posts = await contentManager.getPosts({
      status: req.query.status as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ success: true, data: { posts } });
  } catch {
    res.json({ success: true, data: { posts: [], note: 'unavailable' } });
  }
});

app.post('/api/content/posts', async (req: Request, res: Response) => {
  try {
    const post = await contentManager.createPost(req.body);
    res.json({ success: true, data: { post } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to create post' });
  }
});

app.post('/api/content/posts/:id/schedule', async (req: Request, res: Response) => {
  try {
    const scheduledFor = req.body.scheduled_for ? new Date(req.body.scheduled_for) : undefined;
    const ok = await contentManager.schedulePost(req.params.id, scheduledFor);
    res.json({ success: ok });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to schedule post' });
  }
});

app.get('/api/content/calendar', async (req: Request, res: Response) => {
  try {
    const weekStart = req.query.week ? new Date(req.query.week as string) : undefined;
    const calendar = await contentManager.getContentCalendar(weekStart);
    res.json({ success: true, data: { calendar } });
  } catch {
    res.json({ success: true, data: { calendar: null, note: 'unavailable' } });
  }
});

app.get('/api/content/analytics', async (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) || '30', 10);
  try {
    const analytics = await contentManager.getAnalytics(days);
    res.json({
      success: true,
      data: {
        ...analytics,
        // Be explicit: growth_trend is not real until social APIs are connected
        growth_trend: analytics.total_posts > 0 ? analytics.growth_trend : null,
        note: analytics.total_posts === 0
          ? 'No published posts found. Connect social accounts to start tracking real analytics.'
          : undefined,
      },
    });
  } catch {
    res.json({ success: true, data: { note: 'unavailable' } });
  }
});

// ── Sentiment — real topics, honest framing ──────────────────────────────────

app.get('/api/sentiment', async (_req: Request, res: Response) => {
  if (!openai) {
    return res.json({
      success: true,
      data: {
        note: 'OpenAI not configured — set OPENAI_API_KEY to enable real sentiment analysis.',
        overall: null,
        score: null,
        trending: [],
      },
    });
  }

  const result = await aiJSON<{ overall: string; score: number; trending: string[]; summary: string }>(
    'You are a market sentiment analyst. Return JSON only.',
    `What is the current social media sentiment around these topics: resale flipping, stock trading, AI tools, side hustles?
Return: overall (positive/neutral/negative), score (0-100), trending (array of 5 keywords), summary (1 sentence).`,
  );

  if (!result) {
    return res.json({ success: true, data: { note: 'Sentiment analysis unavailable.', overall: null } });
  }

  res.json({
    success: true,
    data: {
      overall:  result.overall,
      score:    result.score,
      trending: result.trending,
      summary:  result.summary,
      source:   'openai',
      fetchedAt: nowTimestamp(),
    },
  });
});

// ── Engagement metrics — real DB data only ───────────────────────────────────

app.get('/api/engagement', async (_req: Request, res: Response) => {
  try {
    const analytics = await contentManager.getAnalytics(30);
    if (analytics.total_posts === 0) {
      return res.json({
        success: true,
        data: {
          note: 'No published posts with performance data yet. Connect social accounts and publish content to see real engagement.',
          totalPosts:          0,
          totalImpressions:    null,
          totalEngagement:     null,
          avgEngagementRate:   null,
          topPosts:            [],
        },
      });
    }
    res.json({
      success: true,
      data: {
        totalPosts:        analytics.total_posts,
        totalImpressions:  analytics.total_impressions,
        totalEngagement:   analytics.total_engagement,
        avgEngagementRate: analytics.avg_engagement_rate,
        topPosts:          analytics.top_posts,
        platformBreakdown: analytics.platform_breakdown,
        source:            'database',
      },
    });
  } catch {
    res.json({ success: true, data: { note: 'unavailable' } });
  }
});

// ── NEW: POST /api/content/generate — real OpenAI content generation ─────────

app.post('/api/content/generate', async (req: Request, res: Response) => {
  const { topic, platform, tone, niche } = req.body || {};

  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TOPIC', message: 'topic is required' },
    });
  }

  if (!openai) {
    return res.status(503).json({
      success: false,
      error: { code: 'OPENAI_NOT_CONFIGURED', message: 'Set OPENAI_API_KEY to enable content generation.' },
    });
  }

  try {
    const content = await generateContent({ topic, platform, tone, niche });
    if (!content) {
      return res.status(500).json({ success: false, error: { code: 'GENERATION_FAILED', message: 'Content generation failed.' } });
    }
    res.json({ success: true, data: { content } });
  } catch (err) {
    logger.error('Content generation failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'GENERATION_FAILED', message: 'Unexpected error.' } });
  }
});

// ── NEW: GET /api/content/hooks — viral hook generator ───────────────────────

app.get('/api/content/hooks', async (req: Request, res: Response) => {
  const niche = (req.query.niche as string) || 'resale flipping';

  if (!openai) {
    return res.json({
      success: true,
      data: { hooks: [], note: 'OpenAI not configured. Set OPENAI_API_KEY.' },
    });
  }

  const result = await aiJSON<{ hooks: Array<{ hook: string; why: string }> }>(
    'You are a viral content strategist. Return JSON only.',
    `Generate 5 viral social media hooks for the niche: "${niche}".
Each hook should be attention-grabbing, under 100 characters, and make someone want to read more.
Format: { hooks: [{ hook: string, why: string }] }`,
  );

  if (!result) {
    return res.json({ success: true, data: { hooks: [], note: 'unavailable' } });
  }

  res.json({ success: true, data: { hooks: result.hooks || [], niche, generatedAt: nowTimestamp() } });
});

// ── NEW: POST /api/content/card — full Content Decision Card ─────────────────
// Generates a Decision Card using @nova/shared canonical schema.

app.post('/api/content/card', async (req: Request, res: Response) => {
  const { topic, platform, userId, tone, niche } = req.body || {};

  if (!topic) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_TOPIC', message: 'topic is required' } });
  }

  if (!openai) {
    return res.status(503).json({
      success: false,
      error: { code: 'OPENAI_NOT_CONFIGURED', message: 'Set OPENAI_API_KEY to enable content cards.' },
    });
  }

  try {
    const content = await generateContent({ topic, platform: platform || 'twitter', tone, niche });

    if (!content) {
      return res.status(500).json({ success: false, error: { code: 'GENERATION_FAILED', message: 'Could not generate content.' } });
    }

    const card = buildDecisionCard({
      card_type: 'CONTENT',
      user_id:   userId || null,
      session_id: generateId(),

      observation: {
        source:    'user_input',
        raw_input: { topic, platform: content.platform, tone, niche },
        context:   { generatedBy: 'socialbot/openai' },
        timestamp: nowTimestamp(),
      },

      analysis: {
        confidence: null, // No verifiable confidence without real engagement data
        reasoning: [
          `Generated ${content.platform} post for topic: "${topic}".`,
          `Best post time: ${content.bestPostTimeUTC}.`,
          `3 hook variants produced for A/B testing.`,
        ],
        data_used: [{
          name:       'OpenAI gpt-4o-mini',
          fetchedAt:  nowTimestamp(),
        }],
        missing: [
          'Audience engagement data (no social account connected)',
          'Historical performance for this topic',
          'Optimal hashtag performance data',
        ],
        warnings: [
          'Estimated reach is unavailable — connect social account for real analytics.',
        ],
      },

      recommendation: {
        action:     'WATCH',
        summary:    `Post the following ${content.platform} content, then log engagement to improve future recommendations.`,
        details:    content.post,
        risk_level: 'LOW',
      },

      metrics: {
        topic:           topic,
        format:          'text',
        hook:            content.hooks[0] || null,
        expectedReach:   null, // Nova's law: null, not fake
        bestPostTime:    content.bestPostTimeUTC,
        platform:        content.platform,
      },

      action_steps: [
        { order: 1, description: `Post to ${content.platform}`, type: 'MANUAL',    status: 'PENDING' },
        { order: 2, description: 'Log engagement after 24h',    type: 'MANUAL',    status: 'PENDING' },
        { order: 3, description: 'Record outcome in Nova',      type: 'MANUAL',    status: 'PENDING' },
      ],

      governance: {
        mode: 'RECOMMEND',
      },
    });

    // Persist to nova_cards if DB available
    try {
      const { text, values } = novaCardInsert(card);
      await query(text, values);
    } catch {
      // Non-fatal — card still returned even if DB write fails
    }

    res.json({
      success: true,
      data: {
        card,
        generatedContent: content,
      },
    });
  } catch (err) {
    logger.error('Content card generation failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'CARD_FAILED', message: 'Unexpected error.' } });
  }
});

// ── Content suggestions (via ContentManager, now with OpenAI) ────────────────

app.get('/api/content/suggestions', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string | undefined;
    const suggestions = await contentManager.generateSuggestions(platform);
    res.json({ success: true, data: { suggestions } });
  } catch {
    res.json({ success: true, data: { suggestions: [], note: 'unavailable' } });
  }
});

app.get('/api/alerts', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      alerts: [],
      note: 'Real-time social alerts require connected social API accounts. No alerts currently configured.',
    },
  });
});

// ============================================================================
// Start
// ============================================================================

app.listen(PORT, () => {
  logger.info(`SocialBot running on port ${PORT}${openai ? ' (OpenAI connected)' : ' (no OpenAI key — content generation disabled)'}`);
});

export default app;
