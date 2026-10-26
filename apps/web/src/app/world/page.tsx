import type { Metadata } from 'next';
import { readWorldSession } from '@/lib/world/session.server';
import { worldResources } from '@/lib/world/resources.server';
import WorldEntry from './WorldEntry';
import WorldDesk from './WorldDesk';
import './world-office.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Private workspace — Nova', description: 'Private Nova workspace. Sign-in required.', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function WorldPage() {
  const access = await readWorldSession();
  if (!access.ok) return <WorldEntry reason={access.status}/>;
  return <WorldDesk identity={access.identity.id} resources={worldResources()}/>;
}
