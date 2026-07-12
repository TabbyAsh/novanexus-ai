const VISITOR_ID_KEY = 'nova_visitor_id';
let ephemeralVisitorId = '';

function createVisitorId(): string {
  const randomPart = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  return `v_${randomPart}`.slice(0, 64);
}

/**
 * Stable anonymous identity for public Nova loops.
 *
 * Decision Cards must survive a page refresh so a person can return later and
 * tell Nova what actually happened. This identifier is deliberately local to
 * the browser; it is not authentication and carries no authority beyond the
 * public artifacts created with the same id.
 */
export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY)?.slice(0, 64);
    if (existing) return existing;

    const visitorId = createVisitorId();
    window.localStorage.setItem(VISITOR_ID_KEY, visitorId);
    return visitorId;
  } catch {
    // Privacy modes may deny localStorage. Preserve continuity for this page
    // session; persistence across a full reload is unavailable.
    if (!ephemeralVisitorId) ephemeralVisitorId = createVisitorId();
    return ephemeralVisitorId;
  }
}

export function isVisitorIdDurable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(VISITOR_ID_KEY));
  } catch {
    return false;
  }
}
