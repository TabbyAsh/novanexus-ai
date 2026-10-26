export type ArchiveLink = { name: string; kind: string; detail: string; href: string };
export type WorldResources = { desk: string; atlas: string; auctions: string; pipeline: string; transport: string; archives: ArchiveLink[] };
function privateUrl(value: unknown) {
  try { if (typeof value !== 'string' || value.length > 2000) return ''; const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href.replace(/\/$/, '') : ''; } catch { return ''; }
}
export function normalizeResources(input: unknown): WorldResources {
  const x = input && typeof input === 'object' ? input as Record<string,unknown> : {};
  const desk = privateUrl(x.desk), atlas = privateUrl(x.atlas);
  const archives: ArchiveLink[] = [];
  if (Array.isArray(x.archives)) for (const item of x.archives.slice(0,25)) {
    const href=privateUrl(item?.href);
    if (href && typeof item.name === 'string' && item.name.length <= 200) archives.push({ href, name: item.name, kind: typeof item.kind === 'string' ? item.kind.slice(0,100) : 'Private archive', detail: typeof item.detail === 'string' ? item.detail.slice(0,1000) : '' });
  }
  return { desk, atlas, auctions: desk ? desk + '/auctions' : '', pipeline: desk ? desk + '/?view=pipeline' : '', transport: desk ? desk + '/transport' : '', archives };
}
