import 'server-only';
import { normalizeResources } from './resources';
// Personal workspace addresses and file identifiers belong in private runtime
// configuration, never in the public source tree or client bundle.
export function worldResources() {
  let archives: unknown = [];
  try { archives = JSON.parse(process.env.NOVA_PRIVATE_ARCHIVES_JSON || '[]'); } catch { /* Keep unconfigured archives empty. */ }
  return normalizeResources({ desk: process.env.NOVA_PRIVATE_DESK_URL, atlas: process.env.NOVA_PRIVATE_ATLAS_URL, archives });
}
