'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { hasWorldAuthority } from '@/lib/world-authority';

export default function PrivateOpsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, loadUser, scopes } = useAuthStore();

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#080a08] text-stone-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-stone-400" role="status">
          <span className="h-2 w-2 rounded-full bg-lime-300 animate-pulse" />
          Checking operator access…
        </div>
      </div>
    );
  }

  if (!hasWorldAuthority(scopes)) {
    return (
      <div className="min-h-screen bg-[#080a08] text-stone-200 flex items-center justify-center px-6">
        <section className="w-full max-w-lg border border-stone-800 bg-[#10130f] p-8">
          <p className="text-[11px] uppercase tracking-[0.22em] text-lime-300">Private operations</p>
          <h1 className="mt-3 text-2xl font-semibold">Proof Desk access is not assigned.</h1>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            This surface is limited to the configured platform operator. The API checks the same authority on every read and command.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex border border-stone-700 px-4 py-2 text-sm text-stone-200 hover:border-lime-300 hover:text-lime-200">
            Return to Nexus
          </Link>
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
