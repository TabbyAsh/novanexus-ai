import type { Metadata } from 'next';
import FunctionalWorldShell from './FunctionalWorldShell';

export const metadata: Metadata = {
  title: 'Nova OS — Private World',
  description:
    'The founder-only spatial operating surface for durable Trades, evidence, capabilities, authority, and outcomes.',
  robots: { index: false, follow: false },
};

export default function WorldPage() {
  return <FunctionalWorldShell />;
}
