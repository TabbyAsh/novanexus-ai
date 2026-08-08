'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  deriveBillingSuccessView,
  type CheckoutVerificationAttempt,
} from '@/lib/billing-success-state';

function BillingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [attempt, setAttempt] = useState<CheckoutVerificationAttempt>({ phase: 'verifying' });
  const [retryCount, setRetryCount] = useState(0);
  const view = useMemo(() => deriveBillingSuccessView(attempt), [attempt]);

  useEffect(() => {
    const controller = new AbortController();

    async function verifyCheckout() {
      if (!sessionId) {
        setAttempt({ phase: 'error', message: 'This return link does not contain a checkout to verify.' });
        return;
      }

      const token = localStorage.getItem('nova_access_token');
      if (!token) {
        setAttempt({ phase: 'error', status: 401 });
        return;
      }

      setAttempt({ phase: 'verifying' });
      try {
        const response = await fetch(
          `/api/proxy/v1/billing/checkout-session/status?session_id=${encodeURIComponent(sessionId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setAttempt({
            phase: 'error',
            status: response.status,
            message: payload?.error?.message,
          });
          return;
        }

        setAttempt({ phase: 'response', payload });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setAttempt({
          phase: 'error',
          message: 'Nova could not reach billing verification. Try again before assuming access changed.',
        });
      }
    }

    void verifyCheckout();
    return () => controller.abort();
  }, [sessionId, retryCount]);

  useEffect(() => {
    if (view.kind !== 'processing' || retryCount >= 3) return;
    const timer = window.setTimeout(() => setRetryCount(count => count + 1), 2500);
    return () => window.clearTimeout(timer);
  }, [view.kind, retryCount]);

  const accent = view.kind === 'verified'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : view.kind === 'processing' || view.kind === 'verifying'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      : 'border-red-500/40 bg-red-500/10 text-red-200';

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-16 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-3 text-gray-300 hover:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 font-bold">N</span>
          <span className="text-xl font-semibold">Nova</span>
        </Link>

        <section className={`rounded-2xl border p-7 ${accent}`} aria-live="polite">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]">
            {view.kind === 'verified' ? 'Verified receipt' : 'Verification status'}
          </p>
          <h1 className="mb-3 text-3xl font-bold text-white">{view.title}</h1>
          <p className="leading-7 text-gray-200">{view.message}</p>
        </section>

        {view.kind === 'verified' && (
          <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold">What is proven</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-300">
              <li>✓ The Stripe checkout belongs to the signed-in Nova account.</li>
              <li>✓ Checkout is complete and Stripe reports payment as paid.</li>
              <li>✓ Nova currently reports an active entitlement.</li>
            </ul>
          </section>
        )}

        {view.kind === 'processing' && (
          <p className="mt-5 text-sm text-gray-400">
            Nova will retry briefly. If access is still processing, use Retry or contact support; do not submit a second payment.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {view.kind === 'verified' && (
            <>
              <Link href="/world" className="rounded-xl bg-cyan-600 px-5 py-3 text-center font-medium hover:bg-cyan-500">
                Open Nova
              </Link>
              <Link href="/dashboard/settings" className="rounded-xl border border-white/15 px-5 py-3 text-center font-medium hover:bg-white/10">
                Account settings
              </Link>
            </>
          )}

          {view.requiresSignIn && (
            <a
              href="/login"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-cyan-600 px-5 py-3 text-center font-medium hover:bg-cyan-500"
            >
              Sign in in a new tab
            </a>
          )}

          {view.canRetry && (
            <button
              type="button"
              onClick={() => setRetryCount(count => count + 1)}
              className="rounded-xl border border-white/15 px-5 py-3 font-medium hover:bg-white/10"
            >
              Retry verification
            </button>
          )}

          {(view.kind === 'processing' || view.kind === 'unable') && (
            <a
              href="mailto:hello@novanexus-ai.com?subject=Checkout%20verification%20help"
              className="rounded-xl border border-white/15 px-5 py-3 text-center font-medium text-gray-300 hover:bg-white/10"
            >
              Contact support
            </a>
          )}
        </div>

        <p className="mt-8 text-xs leading-5 text-gray-500">
          This page does not display the checkout identifier and does not infer payment from the browser redirect alone.
        </p>
      </div>
    </main>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen bg-gray-950 px-4 py-16 text-gray-400">
          <div className="mx-auto max-w-2xl">Loading checkout verification…</div>
        </div>
      )}
    >
      <BillingSuccessContent />
    </Suspense>
  );
}
