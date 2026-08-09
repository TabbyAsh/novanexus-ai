import type { Metadata } from 'next';
import NovaLoopClient from './NovaLoopClient';

export const metadata: Metadata = {
  title: 'Nova Loop — Turn change into a clear next move',
  description: 'A local-only worksheet for capturing a change, decision, owned next action, evidence check, and what to do next.',
};

export default function NovaLoopPage() {
  return <NovaLoopClient />;
}
