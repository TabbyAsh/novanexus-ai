'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function WorldEntry({ reason }: { reason: number }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(reason === 503 ? 'The authentication service is unavailable. Your workspace remains locked.' : reason === 403 ? 'This account does not have private workspace access.' : '');
  const login = useAuthStore(s => s.login);
  async function enter(existing = false) {
    setBusy(true); setError('');
    try {
      if (!existing) {
        const result = await login(email, password);
        if (!result.success) throw new Error(result.error || 'Sign-in failed.');
      } else {
        const me = await api.getMe(); // Refresh an expired access token through the existing auth flow.
        if (!me.success) throw new Error('Sign in with your email and password.');
      }
      const token = api.getAccessToken();
      if (!token) throw new Error('Sign in with your email and password.');
      const response = await fetch('/api/world/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Workspace access could not be verified.');
      window.location.replace('/world');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in could not be completed.'); }
    finally { setBusy(false); }
  }
  return <main className="world-office world-entry">
    <Link className="world-wordmark" href="/">NOVA<span>ENTERPRISES</span></Link>
    <section className="world-lock">
      <span className="world-eyebrow">PRIVATE WORKSPACE / LOCKED</span>
      <h1>Your place<br/>to see the next move.</h1>
      <p>Sign in with your Nova account password. Access is checked before workspace links, records or downloads are returned.</p>
      <form onSubmit={e => { e.preventDefault(); void enter(); }}>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
        {error && <p className="world-error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? 'Checking access…' : 'Enter your world →'}</button>
        <button type="button" className="world-secondary" disabled={busy} onClick={() => void enter(true)}>Continue an existing Nova session</button>
      </form>
      <p className="world-fine">A new customer account does not grant access here. No shared PIN is embedded in this page.</p>
      <Link className="world-back" href="/">← Back to Nova Enterprises</Link>
    </section>
  </main>;
}
