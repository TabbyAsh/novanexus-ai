'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useKillSwitchStore } from '@/lib/store';
import {
  LayoutDashboard,
  Target,
  ListTodo,
  CheckSquare,
  BookOpen,
  Shield,
  TrendingUp,
  ShoppingCart,
  Video,
  Search,
  Settings,
  LogOut,
  AlertTriangle,
  Bot,
  Lightbulb,
  LineChart,
  Wallet,
  Activity,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'divider', label: 'Nova Hub' },
  { href: '/dashboard/journal', label: 'Journal', icon: BookOpen },
  { href: '/dashboard/thesis', label: 'Trade Ideas', icon: Lightbulb },
  { href: '/dashboard/backtest', label: 'Backtest', icon: LineChart },
  { href: '/dashboard/portfolio', label: 'Portfolio', icon: Wallet },
  { type: 'divider', label: 'Automation' },
  { href: '/dashboard/bots', label: 'Bots', icon: Bot },
  { href: '/dashboard/goals', label: 'Goals', icon: Target },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/dashboard/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/dashboard/logbook', label: 'Events', icon: Activity },
  { href: '/dashboard/safety', label: 'Safety', icon: Shield },
  { type: 'divider', label: 'Modules' },
  { href: '/dashboard/trade', label: 'Scanner', icon: TrendingUp },
  { href: '/dashboard/store', label: 'Store', icon: ShoppingCart, badge: 'Soon' },
  { href: '/dashboard/social', label: 'Social', icon: Video },
  { href: '/dashboard/research', label: 'Research', icon: Search },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, org, isLoading, isAuthenticated, loadUser, logout } = useAuthStore();
  const { status: killSwitchStatus, loadStatus: loadKillSwitch } = useKillSwitchStore();

  useEffect(() => {
    loadUser();
    loadKillSwitch();
  }, [loadUser, loadKillSwitch]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
            <span className="text-xl font-bold text-white">Nova</span>
          </Link>
        </div>

        {/* Kill Switch Warning */}
        {killSwitchStatus?.enabled && (
          <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Kill Switch Active</span>
            </div>
            {killSwitchStatus.reason && (
              <p className="text-xs text-red-400/70 mt-1">{killSwitchStatus.reason}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item, i) => {
            if (item.type === 'divider') {
              return (
                <div key={i} className="pt-4 pb-2">
                  {item.label && (
                    <span className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {item.label}
                    </span>
                  )}
                </div>
              );
            }
            
            const Icon = item.icon!;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            
            return (
              <Link
                key={item.href}
                href={item.href!}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {(item as any).badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded">
                    {(item as any).badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-gray-500 truncate">{org?.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
