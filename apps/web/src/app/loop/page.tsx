import type { Metadata } from 'next';
import NovaLoopClient from './NovaLoopClient';

export const metadata: Metadata = {
  title: 'Nova Loop — Turn change into an evidenced next move',
  description: 'A private, local-only workspace for turning a changing problem into a decision, owned action, evidence standard, and learning loop.',
};

export default function NovaLoopPage() {
  return <NovaLoopClient />;
}
