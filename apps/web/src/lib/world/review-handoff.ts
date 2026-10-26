// Per-tab handoff; source text never travels in a URL or sends itself to AI.
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function queueReview(storage: Store, owner: string, brief: string, now = Date.now()) {
  const id = crypto.randomUUID();
  storage.setItem('nova:review:' + id, JSON.stringify({ owner, brief: brief.slice(0,30000), at: now }));
  return '/dashboard/nova?review=' + id;
}
export function takeReview(storage: Store, id: string | null, owner: string, now = Date.now()): string | null {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) return null;
  const key = 'nova:review:' + id;
  try {
    const record = JSON.parse(storage.getItem(key) || 'null');
    if (!record || record.owner !== owner) return null;
    storage.removeItem(key);
    if (typeof record.brief !== 'string' || record.brief.length > 30000 || !Number.isFinite(record.at) || now < record.at || now - record.at > 15 * 60 * 1000) return null;
    return record.brief;
  } catch { return null; }
}
