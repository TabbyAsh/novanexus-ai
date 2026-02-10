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
// Phase 7: Social MVP - Post Plan + Export (Keyless)
// ============================================================================

interface PostDraft {
  id: string;
  platform: string;
  contentType: 'text' | 'image' | 'video' | 'carousel';
  caption: string;
  hashtags: string[];
  imagePrompt?: string;
  optimalTime: string;
  dayOfWeek: string;
  predictedEngagement: number;
  createdAt: string;
}

interface ContentPlan {
  id: string;
  name: string;
  frequency: 'daily' | '3x-week' | 'weekly';
  platforms: string[];
  niche: string;
  posts: PostDraft[];
  createdAt: string;
}

// In-memory store for content plans
const contentPlans: Map<string, ContentPlan> = new Map();

/**
 * Generate a content plan with post drafts
 */
function generateContentPlan(params: {
  name?: string;
  frequency?: 'daily' | '3x-week' | 'weekly';
  platforms?: string[];
  niche?: string;
  days?: number;
}): ContentPlan {
  const id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const frequency = params.frequency || '3x-week';
  const platforms = params.platforms || ['instagram', 'twitter', 'linkedin'];
  const niche = params.niche || 'business';
  const days = params.days || 14;
  
  // Calculate number of posts based on frequency
  const postsPerWeek = frequency === 'daily' ? 7 : frequency === '3x-week' ? 3 : 1;
  const totalPosts = Math.ceil((days / 7) * postsPerWeek * platforms.length);
  
  // Niche-specific templates
  const nicheTemplates: Record<string, { captions: string[]; hashtags: string[]; imagePrompts: string[] }> = {
    business: {
      captions: [
        '🚀 Growth mindset is everything. What\'s one goal you\'re working towards this week?',
        '💡 Pro tip: Consistency beats intensity. Show up every day, even when it\'s hard.',
        '📊 This week\'s wins don\'t happen by accident. Plan, execute, review, repeat.',
        '🎯 Success isn\'t about perfection, it\'s about progress. What progress did you make today?',
        '🔥 Building something great? Share your journey - the wins AND the lessons.',
      ],
      hashtags: ['#Business', '#Entrepreneur', '#GrowthMindset', '#Success', '#Motivation', '#Leadership', '#StartupLife'],
      imagePrompts: ['professional workspace with laptop', 'team collaboration meeting', 'growth chart visualization', 'modern office environment'],
    },
    ecommerce: {
      captions: [
        '🛒 New drop alert! Check out our latest arrivals - link in bio ⬆️',
        '✨ Customer favorite back in stock! Get yours before they\'re gone.',
        '💥 Flash sale happening NOW! Limited time only.',
        '📦 Unboxing time! See what makes our products special.',
        '🌟 5-star review from a happy customer! Thank you for the love ❤️',
      ],
      hashtags: ['#ShopNow', '#NewArrivals', '#Sale', '#MustHave', '#TrendingNow', '#ShopLocal', '#SmallBusiness'],
      imagePrompts: ['product flat lay on marble', 'lifestyle product shot', 'unboxing moment', 'customer testimonial graphic'],
    },
    tech: {
      captions: [
        '🤖 AI is changing everything. Here\'s what you need to know...',
        '📱 Tech tip of the day: Boost your productivity with these tools.',
        '🔮 The future is here. What tech trends excite you most?',
        '🛠️ Building in public: Here\'s what we\'re working on this week.',
        '💡 Innovation spotlight: How technology is solving real problems.',
      ],
      hashtags: ['#Tech', '#AI', '#Innovation', '#FutureTech', '#Coding', '#StartupLife', '#BuildInPublic'],
      imagePrompts: ['futuristic technology interface', 'coding on screen', 'AI visualization', 'tech team collaboration'],
    },
    lifestyle: {
      captions: [
        '☕ Morning routine that sets the tone for success. What\'s yours?',
        '🌿 Self-care Sunday: Taking time to recharge is not optional, it\'s essential.',
        '💪 Showing up for yourself today. Small steps, big results.',
        '✨ Good vibes only. What brings you joy today?',
        '🌞 Starting the week with intention. What\'s your focus?',
      ],
      hashtags: ['#Lifestyle', '#Wellness', '#SelfCare', '#MorningRoutine', '#Motivation', '#GoodVibes', '#DailyInspiration'],
      imagePrompts: ['aesthetic morning coffee setup', 'wellness and self-care flat lay', 'inspiring quote graphic', 'lifestyle vignette'],
    },
  };
  
  const templates = nicheTemplates[niche] || nicheTemplates.business;
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const optimalTimes: Record<string, string[]> = {
    instagram: ['11:00 AM', '2:00 PM', '7:00 PM'],
    twitter: ['9:00 AM', '12:00 PM', '5:00 PM'],
    linkedin: ['7:30 AM', '10:00 AM', '12:00 PM'],
    tiktok: ['3:00 PM', '7:00 PM', '9:00 PM'],
    facebook: ['9:00 AM', '1:00 PM', '4:00 PM'],
  };
  
  // Generate posts
  const posts: PostDraft[] = [];
  let dayIndex = 0;
  
  for (let i = 0; i < totalPosts; i++) {
    const platform = platforms[i % platforms.length];
    const caption = templates.captions[i % templates.captions.length];
    const times = optimalTimes[platform] || optimalTimes.instagram;
    
    posts.push({
      id: `post_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`,
      platform,
      contentType: platform === 'tiktok' ? 'video' : Math.random() > 0.5 ? 'image' : 'text',
      caption,
      hashtags: templates.hashtags.slice(0, 5 + Math.floor(Math.random() * 3)),
      imagePrompt: templates.imagePrompts[i % templates.imagePrompts.length],
      optimalTime: times[i % times.length],
      dayOfWeek: daysOfWeek[dayIndex % 7],
      predictedEngagement: 2.5 + Math.random() * 4,
      createdAt: nowTimestamp(),
    });
    
    // Increment day based on frequency
    if (frequency === 'daily') {
      dayIndex++;
    } else if (frequency === '3x-week' && (i + 1) % platforms.length === 0) {
      dayIndex += 2;
    } else if (frequency === 'weekly' && (i + 1) % platforms.length === 0) {
      dayIndex += 7;
    }
  }
  
  const plan: ContentPlan = {
    id,
    name: params.name || `${niche.charAt(0).toUpperCase() + niche.slice(1)} Content Plan`,
    frequency,
    platforms,
    niche,
    posts,
    createdAt: nowTimestamp(),
  };
  
  contentPlans.set(id, plan);
  return plan;
}

// Generate content plan
app.post('/api/social/plan/generate', (req: Request, res: Response) => {
  const { name, frequency, platforms, niche, days } = req.body;
  
  const plan = generateContentPlan({ name, frequency, platforms, niche, days });
  
  res.json({
    success: true,
    data: {
      plan,
      message: `Generated ${plan.posts.length} post drafts. Use /api/social/plan/export/:id for CSV export.`,
    },
  });
});

// List all plans
app.get('/api/social/plans', (_req: Request, res: Response) => {
  const plans = Array.from(contentPlans.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ success: true, data: { plans: plans.map(p => ({ ...p, posts: undefined, postCount: p.posts.length })), count: plans.length } });
});

// Get single plan
app.get('/api/social/plans/:id', (req: Request, res: Response) => {
  const plan = contentPlans.get(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }
  res.json({ success: true, data: { plan } });
});

// Export plan as CSV
app.get('/api/social/plan/export/:id', (req: Request, res: Response) => {
  const plan = contentPlans.get(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }
  
  // CSV format for social media scheduling tools
  const csvHeaders = [
    'Platform', 'Day', 'Time', 'Content Type', 'Caption', 'Hashtags', 'Image Prompt', 'Predicted Engagement',
  ];
  
  const csvRows = plan.posts.map(post => [
    post.platform,
    post.dayOfWeek,
    post.optimalTime,
    post.contentType,
    `"${post.caption.replace(/"/g, '""')}"`,
    `"${post.hashtags.join(' ')}"`,
    `"${(post.imagePrompt || '').replace(/"/g, '""')}"`,
    `${post.predictedEngagement.toFixed(1)}%`,
  ].join(','));
  
  const csv = csvHeaders.join(',') + '\n' + csvRows.join('\n');
  
  if (req.query.download === 'true') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${plan.name.replace(/[^a-z0-9]/gi, '-')}.csv"`);
    return res.send(csv);
  }
  
  res.json({
    success: true,
    data: {
      csv,
      plan: { ...plan, posts: undefined },
      postCount: plan.posts.length,
      downloadUrl: `/api/social/plan/export/${plan.id}?download=true`,
    },
  });
});

// Quick post drafts export (all posts from all plans)
app.get('/api/social/drafts/export', (_req: Request, res: Response) => {
  const allPosts = Array.from(contentPlans.values()).flatMap(p => p.posts);
  
  if (allPosts.length === 0) {
    return res.status(404).json({ success: false, error: 'No post drafts to export' });
  }
  
  const csvHeaders = [
    'Platform', 'Day', 'Time', 'Content Type', 'Caption', 'Hashtags',
  ];
  
  const csvRows = allPosts.map(post => [
    post.platform,
    post.dayOfWeek,
    post.optimalTime,
    post.contentType,
    `"${post.caption.replace(/"/g, '""')}"`,
    `"${post.hashtags.join(' ')}"`,
  ].join(','));
  
  const csv = csvHeaders.join(',') + '\n' + csvRows.join('\n');
  
  res.json({
    success: true,
    data: {
      csv,
      count: allPosts.length,
      message: `Exported ${allPosts.length} post drafts`,
    },
  });
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
