import type { Metadata } from 'next';
import WorldRuntime from './WorldRuntime';

export const metadata: Metadata = {
  title: 'Nova OS — Private World',
  description:
    'The founder-only spatial operating surface for durable Trades, evidence, capabilities, measured scope, fixed pricing, authority, and outcomes.',
  robots: { index: false, follow: false },
};

export default function WorldPage() {
  return <WorldRuntime />;
}
