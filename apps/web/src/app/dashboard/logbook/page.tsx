'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Book,
  Filter,
  ChevronLeft,
  ChevronRight,
  Bot,
  User,
  Shield,
  Target,
  ListTodo,
  CheckSquare,
  Clock,
  Search,
} from 'lucide-react';

interface Event {
  id: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  hash: string;
  prev_hash: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'auth.', label: 'Auth Events' },
  { value: 'goal.', label: 'Goal Events' },
  { value: 'task.', label: 'Task Events' },
  { value: 'approval.', label: 'Approval Events' },
  { value: 'killswitch.', label: 'Kill Switch Events' },
  { value: 'trade.', label: 'Trading Events' },
  { value: 'social.', label: 'Social Events' },
  { value: 'store.', label: 'Store Events' },
];

function getEventIcon(type: string) {
  if (type.startsWith('auth.')) return <User className="w-4 h-4" />;
  if (type.startsWith('goal.')) return <Target className="w-4 h-4" />;
  if (type.startsWith('task.')) return <ListTodo className="w-4 h-4" />;
  if (type.startsWith('approval.')) return <CheckSquare className="w-4 h-4" />;
  if (type.startsWith('killswitch.')) return <Shield className="w-4 h-4" />;
  return <Bot className="w-4 h-4" />;
}

function getEventColor(type: string) {
  if (type.startsWith('auth.')) return 'text-blue-400 bg-blue-500/20';
  if (type.startsWith('goal.')) return 'text-purple-400 bg-purple-500/20';
  if (type.startsWith('task.')) return 'text-green-400 bg-green-500/20';
  if (type.startsWith('approval.')) return 'text-yellow-400 bg-yellow-500/20';
  if (type.startsWith('killswitch.')) return 'text-red-400 bg-red-500/20';
  return 'text-gray-400 bg-gray-500/20';
}

export default function LogbookPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  
  const pageSize = 20;

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    const offset = (page - 1) * pageSize;
    
    const result = await api.queryEvents({
      limit: pageSize + 1, // Fetch one extra to check if there's more
      offset,
      ...(typeFilter && { type: typeFilter }),
      ...(actorFilter && { actor: actorFilter }),
    });
    
    if (result.success && result.data?.events) {
      const hasNext = result.data.events.length > pageSize;
      setEvents(result.data.events.slice(0, pageSize) as unknown as Event[]);
      setHasMore(hasNext);
    } else {
      setEvents([]);
      setHasMore(false);
    }
    
    setIsLoading(false);
  }, [page, typeFilter, actorFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setPage(1); // Reset to first page when filters change
  }, [typeFilter, actorFilter]);

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const formatPayload = (payload: Record<string, unknown>) => {
    return JSON.stringify(payload, null, 2);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logbook</h1>
          <p className="text-gray-400 mt-1">Complete audit trail of all system events</p>
        </div>
        <button
          onClick={loadEvents}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-gray-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filters:</span>
          </div>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="Filter by actor..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No events found</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {events.map((event) => (
              <div key={event.id} className="hover:bg-gray-800/50 transition">
                <button
                  onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${getEventColor(event.type)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{event.type}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
                          {event.actor}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(event.created_at)}</span>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-gray-600 truncate max-w-[120px]">
                      {event.hash.slice(0, 16)}...
                    </div>
                  </div>
                </button>

                {expandedEvent === event.id && (
                  <div className="px-4 pb-4 pl-16">
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Payload</h4>
                      <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
                        {formatPayload(event.payload)}
                      </pre>
                      
                      <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Event ID:</span>
                          <span className="font-mono text-gray-400">{event.id}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Hash:</span>
                          <span className="font-mono text-gray-400 truncate">{event.hash}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Prev Hash:</span>
                          <span className="font-mono text-gray-400 truncate">
                            {event.prev_hash || 'null (genesis)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(events.length > 0 || page > 1) && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-800 text-white rounded-lg transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-800 text-white rounded-lg transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
