import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS } from '@nova/shared';
import type { ContentItem, ContentSchedule, BotRunInput, BotRunOutput, ContentStatus } from '@nova/shared';

const app = express();
const logger = createLogger('socialbot-service');
const PORT = process.env.PORT || SERVICE_PORTS.SOCIALBOT;

// In-memory stores
const contentItems: Map<string, ContentItem> = new Map();
const schedules: Map<string, ContentSchedule> = new Map();

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'socialbot', timestamp: new Date().toISOString() });
});

// Bot standard interface
app.post('/internal/bot/run', async (req: Request, res: Response) => {
  const input: BotRunInput = req.body;
  logger.info('SocialBot task received', { taskId: input.taskId, type: input.type });
  
  const output: BotRunOutput = {
    status: 'DONE',
    output: { message: `Processed ${input.type}` },
    events: [{ type: `social.${input.type}.completed`, payload: input.input }],
  };
  
  res.json(output);
});

// POST /v1/social/plan - Generate content plan
app.post('/v1/social/plan', async (req: Request, res: Response) => {
  const { topics, daysAhead = 7 } = req.body;
  
  const plan = {
    id: crypto.randomUUID(),
    topics,
    items: [
      { day: 1, type: 'short', topic: topics[0] || 'AI Systems', hook: 'The secret behind...' },
      { day: 2, type: 'short', topic: topics[1] || 'Trading', hook: 'Why most traders fail...' },
      { day: 3, type: 'long', topic: topics[0] || 'AI Systems', hook: 'Deep dive into...' },
      { day: 5, type: 'short', topic: topics[2] || 'Building', hook: 'How I built...' },
    ],
    createdAt: new Date().toISOString(),
  };
  
  res.json({ success: true, data: { plan } });
});

// POST /v1/social/script - Generate script from hook
app.post('/v1/social/script', async (req: Request, res: Response) => {
  const { hook, topic, format } = req.body;
  
  const script = {
    id: crypto.randomUUID(),
    hook,
    body: `[Opening hook: ${hook}]\n\n[Main content about ${topic}]\n\n[Call to action]`,
    duration: format === 'short' ? 45 : 600,
    format,
  };
  
  res.json({ success: true, data: { script } });
});

// POST /v1/social/schedule - Schedule content
app.post('/v1/social/schedule', async (req: Request, res: Response) => {
  const { contentId, scheduledTs } = req.body;
  
  const schedule: ContentSchedule = {
    id: crypto.randomUUID(),
    contentId,
    scheduledTs,
    status: 'PENDING',
  };
  
  schedules.set(schedule.id, schedule);
  
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { schedule } });
});

// GET /v1/social/content - List content items
app.get('/v1/social/content', async (req: Request, res: Response) => {
  res.json({ success: true, data: { items: Array.from(contentItems.values()) } });
});

// POST /v1/social/content - Create content item
app.post('/v1/social/content', async (req: Request, res: Response) => {
  const content: ContentItem = {
    id: crypto.randomUUID(),
    orgId: req.headers['x-org-id'] as string || 'default-org',
    channel: req.body.channel || 'youtube',
    title: req.body.title,
    script: req.body.script,
    status: 'IDEA' as ContentStatus,
    meta: req.body.meta || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  contentItems.set(content.id, content);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { content } });
});

// POST /v1/social/metrics/ingest - Ingest metrics
app.post('/v1/social/metrics/ingest', async (req: Request, res: Response) => {
  const { contentId, metrics } = req.body;
  logger.info('Metrics ingested', { contentId, metrics });
  res.json({ success: true, data: { ingested: true } });
});

app.listen(PORT, () => {
  logger.info(`SocialBot service started on port ${PORT}`);
});

export default app;
