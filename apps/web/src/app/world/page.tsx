import type { Metadata } from 'next';
import WorldClient from './WorldClient';

export const metadata: Metadata = {
  title: 'The Nexus — Nova',
  description:
    'The interaction engine of Nova Enterprises. A living space where real agents, real memory, and real work are visible — and Nova finds your next move.',
};

export default function WorldPage() {
  return <WorldClient />;
}
