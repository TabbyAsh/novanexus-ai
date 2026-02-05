'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useKillSwitchStore } from '@/lib/store';

// This layout handles authentication only.
// The visual sidebar/layout is provided by DashboardLayout component in each page.
export default function DashboardAuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated, loadUser } = useAuthStore();
  const { loadStatus: loadKillSwitch } = useKillSwitchStore();

  useEffect(() => {
    loadUser();
    loadKillSwitch();
  }, [loadUser, loadKillSwitch]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Just pass through children - DashboardLayout component handles the visual layout
  return <>{children}</>;
}
