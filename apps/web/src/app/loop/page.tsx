import type { Metadata } from 'next';
import NovaLoopClient from './NovaLoopClient';

export const metadata: Metadata = {
  title: 'Nova Loop — The public Nexus protocol',
  description: 'A local-only worksheet for practicing how reality, potential, human authority, evidence, and adaptation move through the Nexus protocol.',
};

export default function NovaLoopPage() {
  return <NovaLoopClient />;
}
