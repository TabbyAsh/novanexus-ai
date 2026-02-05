'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TradingDashboard } from '@/components/trading/TradingDashboard';
import { api } from '@/lib/api';

export default function TradingPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check authentication
    if (!api.isAuthenticated()) {
      router.push('/login');
      return;
    }
    setIsAuthenticated(true);
  }, [router]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return <TradingDashboard />;
}
