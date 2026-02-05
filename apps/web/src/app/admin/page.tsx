'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Shield,
  Users,
  Activity,
  AlertTriangle,
  Power,
  Search,
  ChevronDown,
  Eye,
  Ban,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Settings,
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: string;
  createdAt: string;
  lastActive: string;
}

interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userEmail: string;
  resource: string;
  details: string;
  createdAt: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    revenue: 0,
    alerts: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    // Mock data for admin dashboard
    setStats({
      totalUsers: 1247,
      activeUsers: 892,
      revenue: 24580,
      alerts: 3,
    });

    setUsers([
      { id: '1', email: 'user1@example.com', name: 'John Doe', plan: 'PRO', status: 'active', createdAt: '2025-01-10', lastActive: '2025-01-20' },
      { id: '2', email: 'user2@example.com', name: 'Jane Smith', plan: 'LITE', status: 'active', createdAt: '2025-01-12', lastActive: '2025-01-20' },
      { id: '3', email: 'user3@example.com', name: 'Bob Wilson', plan: 'FREE', status: 'suspended', createdAt: '2025-01-15', lastActive: '2025-01-18' },
    ]);

    setAuditLogs([
      { id: '1', action: 'user.login', userId: '1', userEmail: 'user1@example.com', resource: 'auth', details: 'Successful login', createdAt: '2025-01-20T10:30:00Z' },
      { id: '2', action: 'backtest.run', userId: '2', userEmail: 'user2@example.com', resource: 'backtest', details: 'SMA crossover on AAPL', createdAt: '2025-01-20T09:15:00Z' },
      { id: '3', action: 'thesis.generate', userId: '1', userEmail: 'user1@example.com', resource: 'thesis', details: 'AI thesis for TSLA', createdAt: '2025-01-20T08:45:00Z' },
    ]);

    setIsLoading(false);
  };

  const toggleKillSwitch = async () => {
    const confirm = window.confirm(
      killSwitchEnabled
        ? 'Re-enable all automated trading operations?'
        : 'WARNING: This will disable ALL automated trading operations. Continue?'
    );
    if (confirm) {
      setKillSwitchEnabled(!killSwitchEnabled);
      // API call would go here
    }
  };

  const suspendUser = (userId: string) => {
    if (window.confirm('Suspend this user?')) {
      setUsers(users.map(u => u.id === userId ? { ...u, status: 'suspended' } : u));
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-gray-400">Nova Enterprises Management</p>
              </div>
            </div>

            {/* Kill Switch */}
            <button
              onClick={toggleKillSwitch}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                killSwitchEnabled
                  ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
              }`}
            >
              <Power className="w-4 h-4" />
              {killSwitchEnabled ? 'Kill Switch ACTIVE' : 'Trading Enabled'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Kill Switch Warning */}
        {killSwitchEnabled && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <div className="font-medium text-red-400">Emergency Kill Switch Active</div>
              <div className="text-sm text-red-400/70">All automated trading operations are currently disabled.</div>
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Users className="w-5 h-5 text-blue-400" />
                  <span className="text-xs text-green-400">+12%</span>
                </div>
                <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Total Users</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Activity className="w-5 h-5 text-green-400" />
                  <span className="text-xs text-green-400">+8%</span>
                </div>
                <div className="text-2xl font-bold">{stats.activeUsers.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Active Users</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  <span className="text-xs text-green-400">+23%</span>
                </div>
                <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
                <div className="text-sm text-gray-400">MRR</div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-2xl font-bold">{stats.alerts}</div>
                <div className="text-sm text-gray-400">Active Alerts</div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="p-4 border-b border-gray-800">
                <h2 className="font-semibold">Recent Activity</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {auditLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                        <Activity className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{log.action}</div>
                        <div className="text-xs text-gray-400">{log.userEmail}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{formatDate(log.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">User Management</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search users..."
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Last Active</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {users.filter(u => u.email.includes(searchQuery) || u.name.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                    <tr key={user.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          user.plan === 'PRO' ? 'bg-purple-500/20 text-purple-400' :
                          user.plan === 'LITE' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {user.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-sm ${
                          user.status === 'active' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {user.status === 'active' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{user.createdAt}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{user.lastActive}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button className="p-1.5 hover:bg-gray-700 rounded" title="View">
                            <Eye className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            onClick={() => suspendUser(user.id)}
                            className="p-1.5 hover:bg-gray-700 rounded"
                            title="Suspend"
                          >
                            <Ban className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800">
              <h2 className="font-semibold">Audit Logs</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {auditLogs.map(log => (
                <div key={log.id} className="p-4 flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.action}</span>
                      <span className="px-2 py-0.5 text-xs bg-gray-800 rounded">{log.resource}</span>
                    </div>
                    <div className="text-sm text-gray-400">{log.details}</div>
                    <div className="text-xs text-gray-500 mt-1">{log.userEmail}</div>
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="font-semibold mb-4">Platform Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-800">
                  <div>
                    <div className="font-medium">Maintenance Mode</div>
                    <div className="text-sm text-gray-400">Disable access for non-admin users</div>
                  </div>
                  <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
                    Disabled
                  </button>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-800">
                  <div>
                    <div className="font-medium">New User Registration</div>
                    <div className="text-sm text-gray-400">Allow new users to sign up</div>
                  </div>
                  <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm">
                    Enabled
                  </button>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">AI Features</div>
                    <div className="text-sm text-gray-400">Enable AI-powered features</div>
                  </div>
                  <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm">
                    Enabled
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <h2 className="font-semibold text-red-400 mb-4">Danger Zone</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Emergency Kill Switch</div>
                  <div className="text-sm text-gray-400">Immediately disable all automated trading</div>
                </div>
                <button
                  onClick={toggleKillSwitch}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    killSwitchEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {killSwitchEnabled ? 'Re-enable Trading' : 'Activate Kill Switch'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
