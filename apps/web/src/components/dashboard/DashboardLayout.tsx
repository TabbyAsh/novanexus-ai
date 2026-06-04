'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, ReactNode, useEffect } from 'react';
import { api } from '@/lib/api';

interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  locked?: boolean;
}

// ═══════════════════════════════════════════════════════
// SECTOR-BASED NAVIGATION — The Nova Universe
// ═══════════════════════════════════════════════════════

interface NavSector {
  name: string;
  icon: string;
  color: string;
  items: NavItem[];
}

const navSectors: NavSector[] = [
  {
    name: 'ACTIVE',
    icon: '⚡',
    color: 'text-emerald-400',
    items: [
      {
        name: 'Overview',
        href: '/dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        ),
      },
      {
        name: 'Flip Finder',
        href: '/dashboard/scanner',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ),
        badge: 'LIVE',
      },
      {
        name: 'Flip Card',
        href: '/flip',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        badge: 'FREE',
      },
      {
        name: 'Stock Screener',
        href: '/dashboard/screener',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
        badge: 'LIVE',
      },
    ],
  },
  {
    name: 'YOUR WORK',
    icon: '📋',
    color: 'text-gray-400',
    items: [
      {
        name: 'Outcomes',
        href: '/dashboard/outcomes',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        ),
      },
      {
        name: 'Decision Cards',
        href: '/dashboard/decision-cards',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        ),
      },
      {
        name: 'Journal',
        href: '/dashboard/journal',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
      },
      {
        name: 'Daily Brief',
        href: '/dashboard/nexus',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'COMING SOON',
    icon: '🔒',
    color: 'text-gray-600',
    items: [
      {
        name: 'Marketplace',
        href: '#',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        ),
        badge: 'SOON',
        locked: true,
      },
      {
        name: 'Social Hub',
        href: '#',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        badge: 'SOON',
        locked: true,
      },
      {
        name: 'AI Agents',
        href: '#',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
          </svg>
        ),
        badge: 'SOON',
        locked: true,
      },
      {
        name: 'Analytics',
        href: '#',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        badge: 'SOON',
        locked: true,
      },
    ],
  },
  {
    name: 'OPS',
    icon: '⚙️',
    color: 'text-gray-500',
    items: [
      {
        name: 'Safety',
        href: '/dashboard/safety',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
      {
        name: 'Alert Inbox',
        href: '/dashboard/alerts',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
      {
        name: 'Flip History',
        href: '/dashboard/flip-history',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        name: 'Custom Indicators',
        href: '/dashboard/custom-indicators',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        ),
      },
      {
        name: 'Team',
        href: '/dashboard/team',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        name: 'API Keys',
        href: '/dashboard/api-keys',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        ),
      },
      {
        name: 'Refer & Earn',
        href: '/dashboard/referrals',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        ),
      },
      {
        name: 'Settings',
        href: '/dashboard/settings',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

// User Profile component - fetches actual logged-in user data
function UserProfile({ collapsed, isMobile }: { collapsed: boolean; isMobile: boolean }) {
  const [user, setUser] = useState<{ email: string; role: string; orgName?: string; plan?: string } | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const [meRes, entRes] = await Promise.all([
          api.getMe(),
          api.getBillingEntitlement().catch(() => null),
        ]);
        if (meRes.success && meRes.data) {
          setUser({
            email: meRes.data.user.email,
            role: meRes.data.role,
            orgName: meRes.data.org?.name,
            plan: (entRes as any)?.data?.entitlement?.plan ?? null,
          });
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
      }
    }
    
    if (api.isAuthenticated()) {
      fetchUser();
    }
  }, []);
  
  // Extract display name from email (before @)
  const displayName = user?.email?.split('@')[0] || 'User';
  // Map raw DB roles to user-friendly labels
  const ROLE_LABELS: Record<string, string> = {
    OWNER: 'Admin',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    MEMBER: 'Member',
    VIEWER: 'Viewer',
  };
  const displayRole = user?.orgName || ROLE_LABELS[user?.role || ''] || user?.role || 'Member';
  const initials = displayName.charAt(0).toUpperCase();
  
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold">{initials}</span>
        </div>
        <AnimatePresence>
          {(!collapsed || isMobile) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="text-white font-medium text-sm truncate">{displayName}</p>
              {user?.plan === 'FOUNDING' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                  ⭐ Founding Member
                </span>
              ) : (
                <p className="text-gray-500 text-xs">{displayRole}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, isMobile }: { collapsed: boolean; onToggle: () => void; isMobile: boolean }) {
  const pathname = usePathname();
  
  // On mobile, sidebar slides in/out from left; on desktop it collapses to icon-only
  const sidebarWidth = isMobile ? 280 : (collapsed ? 80 : 260);
  const translateX = isMobile && collapsed ? -280 : 0;
  
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && !collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>
      
      <motion.aside
        initial={false}
        animate={{ 
          width: sidebarWidth,
          x: translateX 
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 bottom-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl border-r border-white/10"
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl">N</span>
            </div>
            <AnimatePresence>
              {(!collapsed || isMobile) && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-white font-bold text-lg tracking-tight whitespace-nowrap"
                >
                  Nova<span className="text-cyan-400">Nexus</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          
          {/* Desktop collapse button */}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors hidden md:block"
          >
            <svg 
              className={`w-5 h-5 text-gray-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          
          {/* Mobile close button */}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors md:hidden"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Sector Navigation */}
        <nav className="p-3 space-y-1 overflow-y-auto scroll-container" style={{ maxHeight: 'calc(100dvh - 160px)' }}>
          {navSectors.map((sector) => (
            <div key={sector.name} className="mb-2">
              {/* Sector Header */}
              <AnimatePresence>
                {(!collapsed || isMobile) ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase ${sector.color} select-none`}
                  >
                    <span>{sector.icon}</span>
                    <span>{sector.name}</span>
                  </motion.div>
                ) : (
                  <div className="flex justify-center py-1.5">
                    <div className={`w-5 h-px bg-white/10 rounded`} />
                  </div>
                )}
              </AnimatePresence>
              {/* Sector Items */}
              {sector.items.map((item) => {
                const isActive = pathname === item.href;
                
                // Badge color logic
                const badgeClass =
                  item.badge === 'LIVE'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : item.badge === 'FREE'
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    : item.badge === 'NEW'
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-gray-800/80 text-gray-600 border-gray-700/50'; // SOON

                // Locked items — non-interactive
                if (item.locked) {
                  return (
                    <div
                      key={item.name}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 cursor-not-allowed select-none"
                    >
                      <span className="flex-shrink-0 text-gray-700 opacity-50">{item.icon}</span>
                      <AnimatePresence>
                        {(!collapsed || isMobile) && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="font-medium whitespace-nowrap"
                          >
                            {item.name}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {item.badge && (!collapsed || isMobile) && (
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${badgeClass}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && onToggle()}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl
                      transition-all duration-200 text-sm
                      ${isActive
                        ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-white shadow-lg shadow-cyan-500/10'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-cyan-400' : ''}`}>{item.icon}</span>
                    <AnimatePresence>
                      {(!collapsed || isMobile) && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-medium whitespace-nowrap"
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {item.badge && (!collapsed || isMobile) && (
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${badgeClass}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        
        {/* Bottom section - User Info */}
        <UserProfile collapsed={collapsed} isMobile={isMobile} />
      </motion.aside>
    </>
  );
}

function Header({ onMenuClick, isMobile }: { onMenuClick: () => void; isMobile: boolean }) {
  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/10 backdrop-blur-xl bg-[#0a0a0f]/80">
      <div className="flex items-center gap-4">
        {/* Mobile hamburger menu */}
        {isMobile && (
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors md:hidden"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-sm font-medium hidden sm:inline">Systems Online</span>
          <span className="text-green-400 text-sm font-medium sm:hidden">Online</span>
        </span>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Alert bell — live unread count */}
        <AlertBell />
        
        {/* Quick actions */}
        <Link
          href="/dashboard/scanner"
          className="px-3 md:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-medium text-sm hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
        >
          <span className="hidden sm:inline">Flip Finder</span>
          <span className="sm:hidden">Scan</span>
        </Link>
      </div>
    </header>
  );
}

// ─── Alert Bell — polls unread count every 60s ───────────────────────────────
function AlertBell() {
  const [count, setCount] = useState(0);
  const token = typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchCount = async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API}/v1/alerts/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) setCount(d.data?.count ?? 0);
    } catch { /* */ }
  };

  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => clearInterval(t);
  }, [token]);

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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Start collapsed on mobile
  
  // Auto-collapse on mobile, auto-expand on desktop
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);
  
  // Calculate main content margin based on sidebar state
  const mainMarginLeft = isMobile ? 0 : (sidebarCollapsed ? 80 : 260);
  
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        isMobile={isMobile}
      />
      
      <motion.div
        initial={false}
        animate={{ marginLeft: mainMarginLeft }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="min-h-screen flex flex-col"
      >
        <Header onMenuClick={() => setSidebarCollapsed(false)} isMobile={isMobile} />
        <main className="p-4 md:p-6 flex-1">
          {children}
        </main>
        {/* Build identity footer */}
        <footer className="px-4 py-2 text-right text-xs text-gray-600 border-t border-white/5">
          <span title={`Built: ${process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown'}`}>
            v{(process.env.NEXT_PUBLIC_GIT_SHA || 'dev').substring(0, 7)}
          </span>
        </footer>
      </motion.div>
    </div>
  );
}
