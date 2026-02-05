'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Target, Plus, Clock, CheckCircle, AlertCircle, XCircle, X } from 'lucide-react';

interface Goal {
  id: string;
  title: string;
  intent: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  NEW: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Clock },
  PLANNED: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: Clock },
  EXECUTING: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: Clock },
  REVIEW: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: AlertCircle },
  COMPLETE: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
  BLOCKED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
  CANCELLED: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: XCircle },
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', intent: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    loadGoals();
  }, [filter]);

  const loadGoals = async () => {
    setIsLoading(true);
    const result = await api.getGoals(filter || undefined);
    if (result.success && result.data) {
      setGoals(result.data.goals);
    }
    setIsLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    
    const result = await api.createGoal(newGoal.title, newGoal.intent);
    if (result.success) {
      setShowModal(false);
      setNewGoal({ title: '', intent: '' });
      loadGoals();
    }
    
    setIsCreating(false);
  };

  const handleStatusChange = async (goalId: string, newStatus: string) => {
    await api.updateGoalStatus(goalId, newStatus);
    loadGoals();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Goals</h1>
          <p className="text-gray-400 mt-1">Manage your objectives and track progress</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          New Goal
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['', 'NEW', 'EXECUTING', 'COMPLETE'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      {/* Goals List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading goals...</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No goals yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-blue-400 hover:text-blue-300"
          >
            Create your first goal
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => {
            const statusConfig = statusColors[goal.status] || statusColors.NEW;
            const StatusIcon = statusConfig.icon;
            
            return (
              <div
                key={goal.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${statusConfig.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white">{goal.title}</h3>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{goal.intent}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <span className={`text-xs px-2 py-1 rounded ${statusConfig.bg} ${statusConfig.text}`}>
                        {goal.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        Created {formatDate(goal.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <select
                      value={goal.status}
                      onChange={(e) => handleStatusChange(goal.id, e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    >
                      <option value="NEW">New</option>
                      <option value="PLANNED">Planned</option>
                      <option value="EXECUTING">Executing</option>
                      <option value="REVIEW">Review</option>
                      <option value="COMPLETE">Complete</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Create New Goal</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="What do you want to achieve?"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Intent
                </label>
                <textarea
                  value={newGoal.intent}
                  onChange={(e) => setNewGoal({ ...newGoal, intent: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 h-32 resize-none"
                  placeholder="Describe what you want Nova to accomplish..."
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition"
                >
                  {isCreating ? 'Creating...' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
