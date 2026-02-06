'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function TradingPage() {
  const router = useRouter();

  useEffect(() => {
    if (!api.isAuthenticated()) {
      router.replace('/login');
      return;
    }

    // Canonical trading dashboard route
    router.replace('/dashboard/trading');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  );
}
