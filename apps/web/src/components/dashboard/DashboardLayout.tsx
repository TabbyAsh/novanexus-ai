'use client';

/**
 * DashboardLayout — Two-tier navigation.
 *
 * Regular users see: clean product path, 8 items, no admin machinery.
 * Founders/admins see: everything, in a separate Admin section at bottom.
 *
 * The logo goes to /dashboard when logged in.
 * The admin machine is never exposed to regular users.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, ReactNode, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

// ─────────────────────────────────────────────────────────────────────
// USER NAV — what regular users see (clean, guided, no admin)
// ─────────────────────────────────────────────────────────────────────

const USER_NAV = [
  {
    section: 'NOVA',
    color: 'text-emerald-400',
    items: [
      { name: 'Talk to Nova',  href: '/dashboard/nova',        icon: '◆', badge: '' },
      { name: 'Dashboard',     href: '/dashboard',             icon: '◈', badge: '' },
    ],
  },
  {
    section: 'BRANCHES',
    color: 'text-cyan-400',
    items: [
      { name: 'Flip Analyzer', href: '/flip',                    icon: '◇', badge: '' },
      { name: 'Flip Finder',   href: '/dashboard/scanner',       icon: '◈', badge: '' },
      { name: 'Flip Pipeline', href: '/dashboard/flips',         icon: '◇', badge: '' },
      { name: 'Trend Radar',   href: '/dashboard/trends',        icon: '◎', badge: '' },
      { name: 'Value Radar',   href: '/dashboard/value-radar',   icon: '◉', badge: 'NEW' },
      { name: 'Market',        href: '/dashboard/market',        icon: '◹', badge: '' },
      { name: 'Screener',      href: '/dashboard/screener',      icon: '◹', badge: '' },
      { name: 'Business OS',   href: '/dashboard/business',      icon: '◈', badge: '' },
      { name: 'Money Tools',   href: '/dashboard/tools',         icon: '◉', badge: '' },
      { name: 'Forge Control', href: '/dashboard/forge-control', icon: '⚒', badge: 'NEW' },
    ],
  },
  {
    section: 'KNOWLEDGE',
    color: 'text-violet-400',
    items: [
      { name: 'Decision Cards',href: '/decision-cards',     icon: '◇', badge: '' },
      { name: 'Field Manual',  href: '/field-manual',       icon: '◈', badge: '' },
      { name: 'Outcomes',      href: '/dashboard/outcomes', icon: '◉', badge: '' },
    ],
  },
  {
    section: 'ACCOUNT',
    color: 'text-gray-500',
    items: [
      { name: 'Settings',      href: '/dashboard/settings', icon: '◌', badge: '' },
    ],
  },
];

// Admin-only items — only visible to OWNER/ADMIN role
const ADMIN_NAV = [
  { name: 'Safety & Kill Switch',href: '/dashboard/safety',         icon: '🛡️' },
  { name: 'AI Agents',           href: '/dashboard/agents',         icon: '🤖' },
  { name: 'Analytics',           href: '/dashboard/analytics',      icon: '📉' },
  { name: 'API Keys',            href: '/dashboard/api-keys',       icon: '🔑' },
  { name: 'Team',                href: '/dashboard/team',           icon: '👥' },
  { name: 'Custom Indicators',   href: '/dashboard/custom-indicators', icon: '⚙️' },
  { name: 'Journal',             href: '/dashboard/journal',        icon: '📓' },
  { name: 'Daily Brief',         href: '/dashboard/nexus',          icon: '📰' },
  { name: 'Social Content',      href: '/dashboard/social',         icon: '📣' },
  { name: 'Marketplace',         href: '/dashboard/marketplace',    icon: '🏪' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Alert Bell ───────────────────────────────────────────────────────
function AlertBell() {
  const [count, setCount] = useState(0);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const token = localStorage.getItem('nova_access_token') || '';
    if (!token) return;
    const fetch_ = () =>
      fetch(`${API}/v1/alerts/unread-count`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.success) setCount(d.data?.count ?? 0); })
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Link href="/dashboard/alerts" className="relative p-2 rounded-lg hover:bg-white/10 transition-colors">
      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-cyan-500 flex items-center justify-center text-[10px] font-bold text-black px-0.5">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, isMobile }: {
  collapsed: boolean; onToggle: () => void; isMobile: boolean;
}) {
  const pathname = usePathname();
  const { scopes, user } = useAuthStore();
  const isAdmin = scopes.includes('ops.admin') || (user as any)?.role === 'OWNER' || (user as any)?.role === 'ADMIN';

  const sidebarWidth = isMobile ? 260 : (collapsed ? 68 : 240);
  const translateX = isMobile && collapsed ? -260 : 0;

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && !collapsed && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onToggle} />
      )}

      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth, x: translateX }}
        transition={{ duration: 0.2 }}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-[#0d0d14] border-r border-white/[0.06] overflow-hidden"
        style={{ height: '100dvh' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-white/[0.06] shrink-0">
          <AnimatePresence>
            {(!collapsed || isMobile) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Logo → dashboard when authenticated */}
                <Link href="/dashboard" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    N
                  </div>
                  <span className="font-bold text-white text-sm tracking-tight">Nova</span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors shrink-0">
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${collapsed && !isMobile ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {USER_NAV.map(section => (
            <div key={section.section} className="mb-1">
              {/* Section label */}
              {(!collapsed || isMobile) && (
                <div className={`px-3 py-1 text-[9px] font-bold tracking-[0.18em] uppercase ${section.color} opacity-60 mt-2`}>
                  {section.section}
                </div>
              )}
              {section.items.map(item => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link key={item.name} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group ${
                      isActive
                        ? 'bg-white/8 text-white'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }`}>
                    <span className="text-base shrink-0 w-5 text-center">{item.icon}</span>
                    {(!collapsed || isMobile) && (
                      <span className="flex-1 font-medium truncate">{item.name}</span>
                    )}
                    {item.badge && (!collapsed || isMobile) && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.badge === 'FREE' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.badge === 'NEW' ? 'bg-violet-500/20 text-violet-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Admin section — only visible to founders/admins */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              {(!collapsed || isMobile) && (
                <div className="px-3 py-1 text-[9px] font-bold tracking-[0.18em] uppercase text-amber-500/60">
                  ADMIN
                </div>
              )}
              {ADMIN_NAV.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.name} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                      isActive ? 'bg-white/8 text-amber-400' : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'
                    }`}>
                    <span className="text-base shrink-0 w-5 text-center opacity-60">{item.icon}</span>
                    {(!collapsed || isMobile) && (
                      <span className="font-medium truncate">{item.name}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User profile at bottom */}
        <UserProfile collapsed={collapsed} isMobile={isMobile} />
      </motion.aside>
    </>
  );
}

// ─── UserProfile ──────────────────────────────────────────────────────
function UserProfile({ collapsed, isMobile }: { collapsed: boolean; isMobile: boolean }) {
  const [userData, setUserData] = useState<{ email: string; plan?: string } | null>(null);
  const router = useRouter();
  const { logout } = useAuthStore();

  useEffect(() => {
    api.getMe().then(r => {
      if (r.success && r.data) {
        setUserData({ email: r.data.user.email });
      }
    }).catch(() => {});
    api.getBillingEntitlement().then((r: any) => {
      if (r.success) setUserData(p => p ? { ...p, plan: r.data?.entitlement?.plan } : null);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const displayName = userData?.email?.split('@')[0] || 'User';
  const plan = userData?.plan || 'FREE';
  const isFounder = plan === 'FOUNDING';

  return (
    <div className="border-t border-white/[0.06] p-3 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
          isFounder ? 'bg-amber-600/30 text-amber-400' : 'bg-gray-700 text-gray-300'
        }`}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        {(!collapsed || isMobile) && (
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{displayName}</div>
            {isFounder ? (
              <div className="text-[10px] text-amber-400 font-semibold">⭐ Founding Member</div>
            ) : (
              <div className="text-[10px] text-gray-600">{plan}</div>
            )}
          </div>
        )}
        {(!collapsed || isMobile) && (
          <button onClick={handleLogout}
            className="p-1 rounded text-gray-600 hover:text-gray-400 transition-colors shrink-0 text-xs">
            ↗
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────
function Header({ onMenuClick, isMobile }: { onMenuClick: () => void; isMobile: boolean }) {
  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-white/[0.06] backdrop-blur-xl bg-[#0a0a0f]/90 shrink-0">
      <div className="flex items-center gap-3">
        {isMobile && (
          <button onClick={onMenuClick} className="p-2 rounded-lg hover:bg-white/8 transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-gray-500 text-xs">Live</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AlertBell />
        <Link href="/start"
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all">
          Get a Card
        </Link>
      </div>
    </header>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile]);

  const sidebarW = isMobile ? 0 : (sidebarCollapsed ? 68 : 240);

  return (
    <div className="min-h-screen text-white flex relative" style={{ background: '#06060d' }}>
      {/* Nebula field — interstellar clouds where light is born */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* deep violet gas cloud */}
        <div className="absolute -top-[10%] left-[15%] w-[700px] h-[700px] rounded-full opacity-[0.13] blur-[130px]"
          style={{ background: 'radial-gradient(circle, #6d28d9 0%, transparent 70%)' }} />
        {/* cyan intersection — Nexus */}
        <div className="absolute top-[30%] right-[5%] w-[600px] h-[600px] rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: 'radial-gradient(circle, #0891b2 0%, transparent 70%)' }} />
        {/* the new light being born — warm emergence */}
        <div className="absolute bottom-[5%] left-[40%] w-[500px] h-[500px] rounded-full opacity-[0.08] blur-[110px]"
          style={{ background: 'radial-gradient(circle, #10b981 0%, #fbbf24 30%, transparent 70%)' }} />
      </div>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
        isMobile={isMobile}
      />

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200" style={{ marginLeft: sidebarW }}>
        <Header onMenuClick={() => setSidebarCollapsed(false)} isMobile={isMobile} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
