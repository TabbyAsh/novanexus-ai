'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  ListTodo,
  Filter,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  Target,
  Bot,
  RefreshCw,
} from 'lucide-react';

interface Task {
  id: string;
  goal_id: string;
  org_id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  assigned_bot?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'running', label: 'Running' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TASK_TRANSITIONS: Record<string, string[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['running', 'cancelled'],
  running: ['awaiting_approval', 'completed', 'failed'],
  awaiting_approval: ['running', 'completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'text-gray-400 bg-gray-500/20';
    case 'assigned': return 'text-blue-400 bg-blue-500/20';
    case 'running': return 'text-yellow-400 bg-yellow-500/20';
    case 'awaiting_approval': return 'text-orange-400 bg-orange-500/20';
    case 'completed': return 'text-green-400 bg-green-500/20';
    case 'failed': return 'text-red-400 bg-red-500/20';
    case 'cancelled': return 'text-gray-400 bg-gray-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4" />;
    case 'assigned': return <Bot className="w-4 h-4" />;
    case 'running': return <Play className="w-4 h-4" />;
    case 'awaiting_approval': return <Pause className="w-4 h-4" />;
    case 'completed': return <CheckCircle className="w-4 h-4" />;
    case 'failed': return <XCircle className="w-4 h-4" />;
    case 'cancelled': return <XCircle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    const result = await api.getTasks(undefined, statusFilter || undefined);
    if (result.success && result.data?.tasks) {
      setTasks(result.data.tasks as unknown as Task[]);
    }
    setIsLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleStatusUpdate = async (taskId: string, newStatus: string) => {
    setUpdatingTask(taskId);
    const result = await api.updateTask(taskId, newStatus);
    if (result.success) {
      loadTasks();
    }
    setUpdatingTask(null);
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  const getNextStatuses = (currentStatus: string) => {
    return TASK_TRANSITIONS[currentStatus] || [];
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-gray-400 mt-1">Individual work items assigned to bots</p>
        </div>
        <button
          onClick={loadTasks}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filter:</span>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          
          <span className="text-sm text-gray-500">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            No tasks found
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${getStatusColor(task.status)}`}>
                    {getStatusIcon(task.status)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{task.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Goal: {task.goal_id.slice(0, 8)}...
                      </span>
                      {task.assigned_bot && (
                        <span className="flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          {task.assigned_bot}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-gray-500">
                    {formatTime(task.updated_at)}
                  </div>
                </div>
              </button>

              {expandedTask === task.id && (
                <div className="px-4 pb-4 border-t border-gray-800">
                  <div className="mt-4 space-y-4">
                    {/* Task Details */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Payload</h4>
                      <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
                        {JSON.stringify(task.payload, null, 2)}
                      </pre>
                    </div>

                    {task.result && (
                      <div className="p-4 bg-gray-800 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Result</h4>
                        <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
                          {JSON.stringify(task.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Status Actions */}
                    {getNextStatuses(task.status).length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Transition to:</span>
                        {getNextStatuses(task.status).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleStatusUpdate(task.id, status)}
                            disabled={updatingTask === task.id}
                            className={`px-3 py-1 text-sm rounded-lg transition ${
                              status === 'cancelled' || status === 'failed'
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                : status === 'completed'
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            } disabled:opacity-50`}
                          >
                            {updatingTask === task.id ? '...' : status}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>ID: {task.id}</p>
                      <p>Created: {formatTime(task.created_at)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
