import { readWorldSession } from '@/lib/world/session.server';
import WorldEntry from '../WorldEntry';
import WorldRuntime from '../WorldRuntime';
import '../world-office.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'World lab — Nova', robots: { index: false, follow: false } };
export default async function WorldLab() {
  const access = await readWorldSession();
  if (!access.ok) return <WorldEntry reason={access.status}/>;
  return <WorldRuntime/>;
}
