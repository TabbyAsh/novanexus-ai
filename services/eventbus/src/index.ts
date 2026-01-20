import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS } from '@nova/shared';
import { computeEventHash } from '@nova/shared';
import type { ApiResponse, NovaEvent } from '@nova/shared';

const app = express();
const logger = createLogger('eventbus-service');
const PORT = process.env.PORT || SERVICE_PORTS.EVENTBUS;

// In-memory event store (replace with Postgres)
const events: NovaEvent[] = [];
let lastHash = '0'.repeat(64); // Genesis hash

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'eventbus',
    eventCount: events.length,
    timestamp: new Date().toISOString() 
  });
});

// ============================================
// Event Routes
// ============================================

// POST /v1/events - Emit a new event
app.post('/v1/events', async (req: Request, res: Response) => {
  try {
    const { type, payload, actorType, actorId, orgId } = req.body;
    
    const ts = new Date().toISOString();
    const hash = computeEventHash(lastHash, payload, type, ts, actorType, actorId);
    
    const event: NovaEvent = {
      id: crypto.randomUUID(),
      orgId,
      actorType,
      actorId,
      type,
      ts,
      payload,
      prevHash: lastHash,
      hash,
    };
    
    events.push(event);
    lastHash = hash;
    
    logger.info('Event emitted', { eventId: event.id, type });
    
    // TODO: Notify subscribers
    // TODO: Persist to database
    
    const response: ApiResponse<{ event: NovaEvent }> = {
      success: true,
      data: { event },
    };
    
    res.status(HTTP_STATUS.CREATED).json(response);
  } catch (error) {
    logger.error('Failed to emit event', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'EVENT_EMIT_FAILED', message: 'Failed to emit event' },
    });
  }
});

// POST /v1/events/query - Query events with filters
app.post('/v1/events/query', async (req: Request, res: Response) => {
  try {
    const { orgId, types, actorType, actorId, fromTs, toTs, limit = 100, offset = 0 } = req.body;
    
    let filtered = [...events];
    
    if (orgId) {
      filtered = filtered.filter(e => e.orgId === orgId);
    }
    if (types && types.length > 0) {
      filtered = filtered.filter(e => types.includes(e.type));
    }
    if (actorType) {
      filtered = filtered.filter(e => e.actorType === actorType);
    }
    if (actorId) {
      filtered = filtered.filter(e => e.actorId === actorId);
    }
    if (fromTs) {
      filtered = filtered.filter(e => e.ts >= fromTs);
    }
    if (toTs) {
      filtered = filtered.filter(e => e.ts <= toTs);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.ts.localeCompare(a.ts));
    
    // Paginate
    const paginated = filtered.slice(offset, offset + limit);
    
    res.json({
      success: true,
      data: { events: paginated },
      meta: { total: filtered.length, limit, offset },
    });
  } catch (error) {
    logger.error('Failed to query events', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to query events' },
    });
  }
});

// GET /v1/events/:id - Get event by ID
app.get('/v1/events/:id', async (req: Request, res: Response) => {
  const event = events.find(e => e.id === req.params.id);
  
  if (!event) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Event not found' },
    });
  }
  
  res.json({ success: true, data: { event } });
});

// GET /v1/events/chain/verify - Verify event chain integrity
app.get('/v1/events/chain/verify', async (req: Request, res: Response) => {
  try {
    let valid = true;
    let brokenAt: number | null = null;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Verify hash
      const expectedHash = computeEventHash(
        event.prevHash,
        event.payload,
        event.type,
        event.ts,
        event.actorType,
        event.actorId
      );
      
      if (event.hash !== expectedHash) {
        valid = false;
        brokenAt = i;
        break;
      }
      
      // Verify chain linkage
      if (i > 0 && event.prevHash !== events[i - 1].hash) {
        valid = false;
        brokenAt = i;
        break;
      }
    }
    
    res.json({
      success: true,
      data: {
        valid,
        eventCount: events.length,
        brokenAt,
      },
    });
  } catch (error) {
    logger.error('Chain verification failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'VERIFY_FAILED', message: 'Failed to verify chain' },
    });
  }
});

// ============================================
// Subscription Routes (for future implementation)
// ============================================

// POST /v1/subscriptions - Create subscription
app.post('/v1/subscriptions', async (req: Request, res: Response) => {
  // TODO: Implement event subscriptions
  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: { subscription: { id: crypto.randomUUID(), ...req.body } },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`EventBus service started on port ${PORT}`);
});

export default app;
