import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { ContentManager } from './content-manager';

const PORT = parseInt(process.env.PORT || '3012', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';

const logger = createLogger('socialbot');
const app = express();
app.use(cors());
app.use(express.json());

// Initialize content manager
const contentManager = new ContentManager(process.env.DATABASE_URL);

// ============================================================================
// Types
// ============================================================================

interface SocialPost {
  id: string;
  channel: string;
  title: string;
  status: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

interface SocialAlert {
  id: string;
  type: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
}

interface SentimentAnalysis {
  overall: string;
  score: number;
  breakdown: { positive: number; neutral: number; negative: number };
  trending: string[];
}

interface EngagementMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  averageEngagementRate: number;
  topPosts: Array<{ id: string; title: string; engagementRate: number }>;
}

// ============================================================================
// Stub Data
// ============================================================================

const recentPosts: SocialPost[] = [
  { id: 'sp1', channel: 'YouTube', title: 'Product Launch Announcement Video', status: 'PUBLISHED', publishedAt: '2026-02-01T10:00:00Z', createdAt: nowTimestamp() },
  { id: 'sp2', channel: 'Twitter', title: 'Hiring Engineers Thread', status: 'PUBLISHED', publishedAt: '2026-02-02T14:30:00Z', createdAt: nowTimestamp() },
  { id: 'sp3', channel: 'TikTok', title: 'Behind the Scenes Office Tour', status: 'SCHEDULED', scheduledAt: '2026-02-10T12:00:00Z', createdAt: nowTimestamp() },
  { id: 'sp4', channel: 'LinkedIn', title: 'Q4 Company Update', status: 'READY', createdAt: nowTimestamp() },
  { id: 'sp5', channel: 'Instagram', title: 'Team Photo Gallery', status: 'DRAFTING', createdAt: nowTimestamp() },
  { id: 'sp6', channel: 'Blog', title: 'Industry Insights: AI in Trading', status: 'IDEA', createdAt: nowTimestamp() },
];

const socialAlerts: SocialAlert[] = [
  { id: 'sa1', type: 'ENGAGEMENT_DROP', message: 'YouTube engagement dropped 15% this week', severity: 'MEDIUM', createdAt: nowTimestamp() },
  { id: 'sa2', type: 'TRENDING_TOPIC', message: 'AI Trading is trending - consider creating content', severity: 'LOW', createdAt: nowTimestamp() },
];

// ============================================================================
// Business Logic
// ============================================================================

function analyzeSentiment(): SentimentAnalysis {
  // Simulated sentiment analysis
  return {
    overall: 'positive',
    score: 72,
    breakdown: {
      positive: 65,
      neutral: 25,
      negative: 10,
    },
    trending: ['AI', 'trading', 'fintech', 'automation'],
  };
}

function getEngagementMetrics(): EngagementMetrics {
  return {
    totalViews: 125000,
    totalLikes: 8500,
    totalComments: 1250,
    totalShares: 3200,
    averageEngagementRate: 4.7,
    topPosts: [
      { id: 'sp1', title: 'Product Launch Announcement Video', engagementRate: 8.5 },
      { id: 'sp2', title: 'Hiring Engineers Thread', engagementRate: 6.2 },
      { id: 'sp4', title: 'Q4 Company Update', engagementRate: 5.1 },
    ],
  };
}

// ============================================================================
// Bot Setup
// ============================================================================

const botConfig = createBotConfig('socialbot', [
  { name: 'sentiment', version: '1.0.0', description: 'Sentiment analysis' },
  { name: 'engagement', version: '1.0.0', description: 'Engagement tracking' },
  { name: 'monitoring', version: '1.0.0', description: 'Social monitoring' },
], { orchestratorUrl: ORCHESTRATOR_URL });

const bot = new BotClient(botConfig);

bot.registerTaskHandler('ANALYZE_SENTIMENT', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Analyzing social sentiment');
  await ctx.reportProgress(50, 'Processing posts...');
  
  const analysis = analyzeSentiment();
  
  if (analysis.breakdown.negative > 20) {
    await ctx.emit('SENTIMENT_ALERT', { type: 'HIGH_NEGATIVE', percentage: analysis.breakdown.negative });
  }
  
  return {
    success: true,
    output: { analysis, analyzedAt: nowTimestamp() },
    metrics: { sentimentScore: analysis.score },
  };
});

bot.registerTaskHandler('GET_ENGAGEMENT', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Getting engagement metrics');
  
  const metrics = getEngagementMetrics();
  
  return {
    success: true,
    output: { metrics, generatedAt: nowTimestamp() },
    metrics: { engagementRate: metrics.averageEngagementRate },
  };
});

bot.registerTaskHandler('MONITOR_MENTIONS', async (_task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Monitoring social mentions');
  
  // Monitor for alerts instead of sentiment  
  const alerts = socialAlerts.filter(a => a.severity === 'HIGH');
  
  for (const alert of alerts) {
    await ctx.emit('SOCIAL_ALERT', { alertId: alert.id, type: alert.type, message: alert.message });
  }
  
  return {
    success: true,
    output: { 
      totalPosts: recentPosts.length, 
      alertCount: alerts.length,
      checkedAt: nowTimestamp(),
    },
    metrics: { alertCount: alerts.length },
  };
});

// ============================================================================
// Express Routes
// ============================================================================

const healthRoutes = createBotHealthRoutes({ bot });
app.get('/health', healthRoutes.healthHandler);
app.get('/ready', healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);

app.get('/api/posts', (_req: Request, res: Response) => {
  res.json({ success: true, data: { posts: recentPosts } });
});

app.get('/api/sentiment', (_req: Request, res: Response) => {
  res.json({ success: true, data: { analysis: analyzeSentiment() } });
});

app.get('/api/engagement', (_req: Request, res: Response) => {
  res.json({ success: true, data: { metrics: getEngagementMetrics() } });
});

app.get('/api/alerts', (_req: Request, res: Response) => {
  res.json({ success: true, data: { alerts: socialAlerts } });
});

// Content Manager API
app.get('/api/content/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await contentManager.getAccounts();
    res.json({ success: true, data: { accounts } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get accounts' });
  }
});

app.get('/api/content/posts', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const posts = await contentManager.getPosts({ status, limit });
    res.json({ success: true, data: { posts } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get posts' });
  }
});

app.post('/api/content/posts', async (req: Request, res: Response) => {
  try {
    const post = await contentManager.createPost(req.body);
    res.json({ success: true, data: { post } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create post' });
  }
});

app.post('/api/content/posts/:id/schedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scheduledFor = req.body.scheduled_for ? new Date(req.body.scheduled_for) : undefined;
    const success = await contentManager.schedulePost(id, scheduledFor);
    res.json({ success, message: success ? 'Post scheduled' : 'Failed to schedule' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to schedule post' });
  }
});

app.get('/api/content/calendar', async (req: Request, res: Response) => {
  try {
    const weekStart = req.query.week ? new Date(req.query.week as string) : undefined;
    const calendar = await contentManager.getContentCalendar(weekStart);
    res.json({ success: true, data: { calendar } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get calendar' });
  }
});

app.get('/api/content/suggestions', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string | undefined;
    const suggestions = await contentManager.generateSuggestions(platform);
    res.json({ success: true, data: { suggestions } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate suggestions' });
  }
});

app.get('/api/content/analytics', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const analytics = await contentManager.getAnalytics(days);
    res.json({ success: true, data: { analytics } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  app.listen(PORT, () => logger.info(`SocialBot API started on port ${PORT}`));
  
  try {
    await bot.start();
    logger.info('SocialBot connected to orchestrator');
  } catch (error) {
    logger.warn('Running in standalone mode', { error });
  }
}

process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });

main();
export default app;
