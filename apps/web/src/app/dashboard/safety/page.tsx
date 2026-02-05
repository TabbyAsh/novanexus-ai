'use client';

import { useEffect, useState } from 'react';
import { useKillSwitchStore, useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Power,
  Activity,
  Hash,
  RefreshCw,
} from 'lucide-react';

interface ChainStatus {
  valid: boolean;
  eventCount: number;
  brokenAt?: string;
  brokenReason?: string;
  lastHash: string;
}

export default function SafetyPage() {
  const { hasScope } = useAuthStore();
  const { status, isLoading, loadStatus, toggle } = useKillSwitchStore();
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const canControl = hasScope('admin.killswitch');

  useEffect(() => {
    loadStatus();
    verifyChain();
  }, [loadStatus]);

  const verifyChain = async () => {
    setIsVerifying(true);
    const result = await api.verifyEventChain();
    if (result.success && result.data) {
      setChainStatus(result.data);
    }
    setIsVerifying(false);
  };

  const handleToggle = async () => {
    if (!canControl) return;
    
    setIsToggling(true);
    const enable = !status?.enabled;
    
    const result = await toggle(enable, enable ? reason : undefined);
    
    if (result.success) {
      setShowConfirm(false);
      setReason('');
    }
    
    setIsToggling(false);
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Safety Controls</h1>
        <p className="text-gray-400 mt-1">Emergency controls and system integrity verification</p>
      </div>

      {/* Kill Switch Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${status?.enabled ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
              <Power className={`w-6 h-6 ${status?.enabled ? 'text-red-400' : 'text-green-400'}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Kill Switch</h2>
              <p className="text-sm text-gray-400">
                Emergency stop for all automated operations
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Status Display */}
          <div className={`p-4 rounded-lg mb-6 ${status?.enabled ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
            <div className="flex items-center gap-3">
              {status?.enabled ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
              <div>
                <p className={`font-medium ${status?.enabled ? 'text-red-400' : 'text-green-400'}`}>
                  {status?.enabled ? 'Kill Switch ACTIVE' : 'System Operational'}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {status?.enabled
                    ? 'All automated operations are halted'
                    : 'All bots and automation are running normally'}
                </p>
              </div>
            </div>
            
            {status?.enabled && status.enabledAt && (
              <div className="mt-4 pt-4 border-t border-red-500/20 text-sm text-gray-400">
                <p>Enabled: {formatTime(status.enabledAt)}</p>
                {status.reason && <p className="mt-1">Reason: {status.reason}</p>}
              </div>
            )}
          </div>

          {/* Toggle Button */}
          {canControl ? (
            status?.enabled ? (
              <button
                onClick={handleToggle}
                disabled={isToggling}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
              >
                {isToggling ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Disable Kill Switch
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-5 h-5" />
                Enable Kill Switch
              </button>
            )
          ) : (
            <p className="text-center text-gray-500 text-sm">
              You don&apos;t have permission to control the kill switch.
              Contact an admin if you need to enable it.
            </p>
          )}
        </div>
      </div>

      {/* Event Chain Verification */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Hash className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Event Chain Integrity</h2>
              <p className="text-sm text-gray-400">
                Cryptographic verification of the audit log
              </p>
            </div>
          </div>
          <button
            onClick={verifyChain}
            disabled={isVerifying}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
            Verify
          </button>
        </div>

        <div className="p-6">
          {chainStatus ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${chainStatus.valid ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <div className="flex items-center gap-3">
                  {chainStatus.valid ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                  <p className={`font-medium ${chainStatus.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {chainStatus.valid ? 'Chain Verified' : 'Chain Integrity Compromised'}
                  </p>
                </div>
                {!chainStatus.valid && chainStatus.brokenReason && (
                  <p className="text-sm text-red-400/70 mt-2">{chainStatus.brokenReason}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-400">Total Events</p>
                  <p className="text-xl font-semibold text-white mt-1">{chainStatus.eventCount}</p>
                </div>
                <div className="p-4 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-400">Last Hash</p>
                  <p className="text-xs font-mono text-gray-300 mt-2 truncate">
                    {chainStatus.lastHash}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {isVerifying ? 'Verifying chain...' : 'Click Verify to check chain integrity'}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Enable Kill Switch</h2>
              </div>

              <p className="text-gray-400 mb-4">
                This will immediately halt all automated operations including trading, posting, and order processing.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  placeholder="Why are you enabling the kill switch?"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleToggle}
                  disabled={isToggling}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition"
                >
                  {isToggling ? 'Enabling...' : 'Enable Kill Switch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
