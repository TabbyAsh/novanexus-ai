import type { Metadata } from 'next';
import WorldGate from './WorldGate';

export const metadata: Metadata = {
  title: 'The Nexus — Nova',
  description: 'Private. Nova’s operating floor.',
  // The World is founder-only now: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

export default function WorldPage() {
  return <WorldGate />;
}
