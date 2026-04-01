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
    name: 'COMMAND',
    icon: '◆',
    color: 'text-cyan-400',
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
        name: 'Flip Card',
        href: '/dashboard/analyze',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        badge: 'NEW',
      },
      {
        name: 'Nexus',
        href: '/dashboard/nexus',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M8 8h8v8H8V8z" />
          </svg>
        ),
        badge: 'NEW',
      },
      {
        name: 'Decisions',
        href: '/dashboard/decisions',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m-6-8h6m3 12H6a2 2 0 01-2-2V6a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2z" />
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
        name: 'Agents',
        href: '/dashboard/agents',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
          </svg>
        ),
        badge: 'NEW',
      },
      {
        name: 'Outcomes',
        href: '/dashboard/outcomes',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        ),
        badge: 'ROI',
      },
    ],
  },
  {
    name: 'WALL STREET',
    icon: '📈',
    color: 'text-green-400',
    items: [
      {
        name: 'Screener',
        href: '/dashboard/screener',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
        badge: 'LIVE',
      },
      {
        name: 'Trading',
        href: '/dashboard/trading',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        ),
      },
      {
        name: 'Simulator',
        href: '/dashboard/simulator',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        name: 'Strategy',
        href: '/dashboard/strategy-performance',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16M7 6v12M17 6v12" />
          </svg>
        ),
      },
      {
        name: 'Analytics',
        href: '/dashboard/analytics',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'MARKETPLACE',
    icon: '🏪',
    color: 'text-pink-400',
    items: [
      {
        name: 'Marketplace',
        href: '/dashboard/marketplace',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        ),
      },
      {
        name: 'Value Radar',
        href: '/dashboard/value-radar',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a5 5 0 010-7.072m5.656 0a5 5 0 010 7.072M12 12h.01" />
          </svg>
        ),
        badge: 'NEW',
      },
    ],
  },
  {
    name: 'SOCIAL',
    icon: '📡',
    color: 'text-purple-400',
    items: [
      {
        name: 'Social Hub',
        href: '/dashboard/social-hub',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        name: 'Content Engine',
        href: '/dashboard/content-engine',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        badge: 'NEW',
      },
    ],
  },
  {
    name: 'OPS',
    icon: '⚙️',
    color: 'text-orange-400',
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
  const [user, setUser] = useState<{ email: string; role: string; orgName?: string } | null>(null);
  
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await api.getMe();
        if (response.success && response.data) {
          setUser({
            email: response.data.user.email,
            role: response.data.role,
            orgName: response.data.org?.name,
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
              <p className="text-gray-500 text-xs">{displayRole}</p>
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
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${
                        item.badge === 'NEW'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                      }`}>
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
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-white/10 transition-colors">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400" />
        </button>
        
        {/* Quick actions */}
        <button className="px-3 md:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium text-sm hover:shadow-lg hover:shadow-cyan-500/25 transition-all">
          <span className="hidden sm:inline">Quick Trade</span>
          <span className="sm:hidden">Trade</span>
        </button>
      </div>
    </header>
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
