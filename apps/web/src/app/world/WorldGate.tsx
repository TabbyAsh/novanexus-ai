'use client';

/**
 * THE DOOR — the world opens to the word, and to nothing else.
 *
 * Nova OS is the founder's private command world (Manifesto §XIII). The gate
 * asks for the word (WORLD_PASSWORD on the backend), trades it for an
 * HMAC-signed key that holds for 30 days, and only then lets the world load.
 * The key is checked server-side on /v1/world/os — this gate is a door,
 * not a curtain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import WorldClient from './WorldClient';
import { WORLD_KEY, getWorldKey } from './world-key';

type DoorState = 'checking' | 'sealed' | 'open';

export default function WorldGate() {
  const [state, setState] = useState<DoorState>('checking');
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A held key is proven against the server, never trusted locally.
  useEffect(() => {
    const key = getWorldKey();
    if (!key) { setState('sealed'); return; }
    fetch('/api/proxy/v1/world/os', { headers: { 'x-world-key': key } })
      .then(r => setState(r.ok ? 'open' : 'sealed'))
      .catch(() => setState('sealed'));
  }, []);

  useEffect(() => {
    if (state === 'sealed') inputRef.current?.focus();
  }, [state]);

  const speak = useCallback(async () => {
    const password = word.trim();
    if (!password || asking) return;
    setAsking(true);
    setError(null);
    try {
      const r = await fetch('/api/proxy/v1/world/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (d?.success && d.data?.key) {
        localStorage.setItem(WORLD_KEY, d.data.key);
        setState('open');
      } else {
        setWord('');
        setError(d?.error?.message || 'That is not the word.');
      }
    } catch {
      setError('The door is unreachable.');
    } finally {
      setAsking(false);
    }
  }, [word, asking]);

  if (state === 'checking') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#01030a' }}>
        <div className="text-[12px] tracking-[0.35em] uppercase animate-pulse" style={{ color: '#3d5266' }}>
          Listening
        </div>
      </div>
    );
  }

  if (state === 'open') return <WorldClient />;

  // The sealed door — void, wordmark, one question.
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #060d1a 0%, #01030a 70%)' }}
    >
      <div className="text-[12px] tracking-[0.5em] uppercase mb-14 select-none" style={{ color: '#7fa6c2' }}>
        novanexus
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center text-[13px] leading-relaxed mb-8" style={{ color: '#5d7891' }}>
          This chamber is private.
        </div>

        <div
          className="flex items-center gap-3 rounded-full px-5 py-3 backdrop-blur-sm"
          style={{
            border: '1px solid rgba(150, 220, 255, 0.22)',
            background: 'rgba(4, 10, 20, 0.55)',
            boxShadow: '0 0 24px rgba(125, 216, 255, 0.08), inset 0 0 18px rgba(125, 216, 255, 0.03)',
          }}
        >
          <input
            ref={inputRef}
            type="password"
            value={word}
            onChange={e => setWord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') speak(); }}
            placeholder="Speak the word."
            autoComplete="current-password"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: '#dbeefb', caretColor: '#7dd8ff' }}
          />
          <button
            onClick={speak}
            disabled={asking || !word.trim()}
            className="text-[11px] tracking-[0.25em] uppercase disabled:opacity-30"
            style={{ color: '#7dd8ff' }}
          >
            {asking ? '· · ·' : 'enter'}
          </button>
        </div>

        <div className="h-6 mt-4 text-center text-[12px]" style={{ color: '#8a5a52' }}>
          {error}
        </div>
      </div>
    </div>
  );
}
