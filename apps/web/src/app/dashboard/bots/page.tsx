'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Bot,
  RefreshCw,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Cpu,
  Zap,
} from 'lucide-react';

interface BotInfo {
  id: string;
  botType: string;
  instanceId: string;
  status: string;
  capabilities: string[];
  permissions: string[];
  lastHeartbeat: string | null;
  registeredAt: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ONLINE': return 'text-green-400 bg-green-500/20';
    case 'BUSY': return 'text-yellow-400 bg-yellow-500/20';
    case 'ERROR': return 'text-red-400 bg-red-500/20';
    case 'OFFLINE': return 'text-gray-400 bg-gray-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'ONLINE': return <CheckCircle className="w-4 h-4" />;
    case 'BUSY': return <Activity className="w-4 h-4" />;
    case 'ERROR': return <AlertTriangle className="w-4 h-4" />;
    case 'OFFLINE': return <XCircle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getBotIcon(botType: string) {
  switch (botType.toLowerCase()) {
    case 'trade':
    case 'tradebot':
      return '📈';
    case 'store':
    case 'storebot':
      return '🛒';
    case 'social':
    case 'socialbot':
      return '📱';
    case 'research':
    case 'researchbot':
      return '🔬';
    case 'ops':
    case 'opsbot':
      return '⚙️';
    case 'forge':
    case 'forgebot':
      return '🔧';
    default:
      return '🤖';
  }
}

function formatHeartbeat(ts: string | null) {
  if (!ts) return 'Never';
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

export default function BotsPage() {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBot, setExpandedBot] = useState<string | null>(null);

  const loadBots = useCallback(async () => {
    setIsLoading(true);
    const result = await api.getBots();
    if (result.success && result.data?.bots) {
      setBots(result.data.bots);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadBots();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadBots, 30000);
    return () => clearInterval(interval);
  }, [loadBots]);

  const onlineBots = bots.filter(b => b.status === 'ONLINE').length;
  const offlineBots = bots.filter(b => b.status === 'OFFLINE').length;
  const errorBots = bots.filter(b => b.status === 'ERROR').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bots</h1>
          <p className="text-gray-400 mt-1">Registered bot instances and their health status</p>
        </div>
        <button
          onClick={loadBots}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{bots.length}</p>
              <p className="text-sm text-gray-400">Total Bots</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{onlineBots}</p>
              <p className="text-sm text-gray-400">Online</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-500/20 rounded-lg">
              <XCircle className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-400">{offlineBots}</p>
              <p className="text-sm text-gray-400">Offline</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{errorBots}</p>
              <p className="text-sm text-gray-400">Errors</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bots List */}
      <div className="space-y-4">
        {isLoading && bots.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            Loading bots...
          </div>
        ) : bots.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No bots registered</p>
            <p className="text-sm mt-1">Bots will appear here once they connect to the orchestrator</p>
          </div>
        ) : (
          bots.map((bot) => (
            <div
              key={bot.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedBot(expandedBot === bot.id ? null : bot.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{getBotIcon(bot.botType)}</div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white capitalize">
                        {bot.botType.replace('bot', ' Bot')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${getStatusColor(bot.status)}`}>
                        {getStatusIcon(bot.status)}
                        {bot.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {bot.instanceId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Heartbeat: {formatHeartbeat(bot.lastHeartbeat)}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-gray-500">
                    {bot.capabilities.length} capabilities
                  </div>
                </div>
              </button>

              {expandedBot === bot.id && (
                <div className="px-4 pb-4 border-t border-gray-800">
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Capabilities */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Capabilities
                      </h4>
                      {bot.capabilities.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {bot.capabilities.map((cap, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                              {cap}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No capabilities registered</p>
                      )}
                    </div>

                    {/* Permissions */}
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Permissions
                      </h4>
                      {bot.permissions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {bot.permissions.map((perm, i) => (
                            <span key={i} className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                              {perm}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No permissions registered</p>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="mt-4 text-xs text-gray-500 space-y-1">
                    <p>ID: {bot.id}</p>
                    <p>Registered: {new Date(bot.registeredAt).toLocaleString()}</p>
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
