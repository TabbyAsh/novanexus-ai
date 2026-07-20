// The world key — issued by the door (/v1/world/unlock), proven by the
// server on every /v1/world/os call. Shared between the gate and the world.

export const WORLD_KEY = 'nova_world_key';

export function getWorldKey(): string {
  try { return localStorage.getItem(WORLD_KEY) || ''; } catch { return ''; }
}
