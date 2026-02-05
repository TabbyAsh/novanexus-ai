'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  Filter,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ListTodo,
} from 'lucide-react';

interface Approval {
  id: string;
  task_id: string;
  org_id: string;
  type: string;
  status: string;
  required_role: string;
  payload: Record<string, unknown>;
  decided_by?: string;
  decided_at?: string;
  decision_reason?: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'text-yellow-400 bg-yellow-500/20';
    case 'approved': return 'text-green-400 bg-green-500/20';
    case 'rejected': return 'text-red-400 bg-red-500/20';
    case 'expired': return 'text-gray-400 bg-gray-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4" />;
    case 'approved': return <CheckCircle className="w-4 h-4" />;
    case 'rejected': return <XCircle className="w-4 h-4" />;
    case 'expired': return <AlertTriangle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getTypeColor(type: string) {
  if (type.includes('high_value') || type.includes('risk')) return 'text-red-400 bg-red-500/20';
  if (type.includes('trade')) return 'text-blue-400 bg-blue-500/20';
  if (type.includes('social') || type.includes('content')) return 'text-purple-400 bg-purple-500/20';
  return 'text-gray-400 bg-gray-500/20';
}

/**
 * Backend may return either:
 *  A) Approval[] already matching our UI (snake_case)
 *  B) { approvals: [{ id, taskId, requiredRole, status, requestedAt, resolvedAt? }] }
 * Normalize everything into UI Approval objects.
 */
function normalizeApprovals(data: unknown): Approval[] {
  // case A: array
  if (Array.isArray(data)) {
    return data
      .filter(Boolean)
      .map((raw: any) => ({
        id: String(raw.id ?? ''),
        task_id: String(raw.task_id ?? raw.taskId ?? ''),
        org_id: String(raw.org_id ?? raw.orgId ?? ''),
        type: String(raw.type ?? raw.approval_type ?? 'general'),
        status: String(raw.status ?? 'pending'),
        required_role: String(raw.required_role ?? raw.requiredRole ?? 'admin'),
        payload: (raw.payload ?? raw.details ?? {}) as Record<string, unknown>,
        decided_by: raw.decided_by ?? raw.decidedBy,
        decided_at: raw.decided_at ?? raw.decidedAt ?? raw.resolvedAt,
        decision_reason: raw.decision_reason ?? raw.decisionReason,
        created_at: raw.created_at ?? raw.createdAt ?? raw.requestedAt ?? new Date().toISOString(),
      }))
      .filter((a) => a.id);
  }

  // case B: object wrapper
  if (data && typeof data === 'object') {
    const obj: any = data as any;
    if (Array.isArray(obj.approvals)) return normalizeApprovals(obj.approvals);
  }

  return [];
}

export default function ApprovalsPage() {
  const { hasScope } = useAuthStore();

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedApproval, setExpandedApproval] = useState<string | null>(null);
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  const canApprove = hasScope('approvals.decide');

  const loadApprovals = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getApprovals(statusFilter || undefined);
      if (result?.success) {
        setApprovals(normalizeApprovals(result.data));
      } else {
        setApprovals([]);
      }
    } catch {
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleDecision = async (approvalId: string, approved: boolean) => {
    if (!canApprove) return;

    setProcessingApproval(approvalId);
    try {
      const result = await api.decideApproval(approvalId, approved, decisionReason || undefined);
      if (result?.success) {
        setDecisionReason('');
        setExpandedApproval(null);
        await loadApprovals();
      }
    } finally {
      setProcessingApproval(null);
    }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleString();

  const pendingCount = approvals.filter((a: Approval) => a.status === 'pending').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="text-gray-400 mt-1">Review and approve pending bot actions</p>
        </div>
        <div className="flex items-center gap-4">
          {pendingCount > 0 && (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">
              {pendingCount} pending
            </span>
          )}
          <button
            onClick={() => void loadApprovals()}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
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
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <span className="text-sm text-gray-500">
            {approvals.length} approval{approvals.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            Loading approvals...
          </div>
        ) : approvals.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            No approvals found
          </div>
        ) : (
          approvals.map((approval: Approval) => (
            <div
              key={approval.id}
              className={`bg-gray-900 border rounded-xl overflow-hidden ${
                approval.status === 'pending' ? 'border-yellow-500/50' : 'border-gray-800'
              }`}
            >
              <button
                onClick={() => setExpandedApproval(expandedApproval === approval.id ? null : approval.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${getStatusColor(approval.status)}`}>
                    {getStatusIcon(approval.status)}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(approval.type)}`}>
                        {approval.type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(approval.status)}`}>
                        {approval.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded">
                        requires: {approval.required_role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <ListTodo className="w-3 h-3" />
                        Task: {approval.task_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-gray-500">
                    {formatTime(approval.created_at)}
                  </div>
                </div>
              </button>

              {expandedApproval === approval.id && (
                <div className="px-4 pb-4 border-t border-gray-800">
                  <div className="mt-4 space-y-4">
                    {/* Approval Details */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Details</h4>
                      <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
                        {JSON.stringify(approval.payload, null, 2)}
                      </pre>
                    </div>

                    {/* Decision Info (if decided) */}
                    {approval.decided_by && (
                      <div className={`p-4 rounded-lg ${
                        approval.status === 'approved'
                          ? 'bg-green-500/10 border border-green-500/30'
                          : 'bg-red-500/10 border border-red-500/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {approval.status === 'approved'
                            ? <CheckCircle className="w-4 h-4 text-green-400" />
                            : <XCircle className="w-4 h-4 text-red-400" />
                          }
                          <span className={`font-medium ${
                            approval.status === 'approved' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {approval.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400">By: {approval.decided_by}</p>
                        {approval.decided_at && <p className="text-sm text-gray-400">At: {formatTime(approval.decided_at)}</p>}
                        {approval.decision_reason && <p className="text-sm text-gray-400 mt-2">Reason: {approval.decision_reason}</p>}
                      </div>
                    )}

                    {/* Decision Actions (if pending) */}
                    {approval.status === 'pending' && (
                      <div className="space-y-3">
                        {canApprove ? (
                          <>
                            <input
                              type="text"
                              value={decisionReason}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDecisionReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                            />
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => void handleDecision(approval.id, true)}
                                disabled={processingApproval === approval.id}
                                className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2"
                              >
                                <ThumbsUp className="w-4 h-4" />
                                {processingApproval === approval.id ? 'Processing...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => void handleDecision(approval.id, false)}
                                disabled={processingApproval === approval.id}
                                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2"
                              >
                                <ThumbsDown className="w-4 h-4" />
                                {processingApproval === approval.id ? 'Processing...' : 'Reject'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-center text-sm text-gray-500">
                            You don&apos;t have permission to decide on approvals.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>ID: {approval.id}</p>
                      <p>Created: {formatTime(approval.created_at)}</p>
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
