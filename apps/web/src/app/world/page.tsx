import type { Metadata } from 'next';
import WorldClient from './WorldClient';

export const metadata: Metadata = {
  title: 'The World — Nexus',
  description:
    'A spatial Nexus interface where Nova capabilities, real memory, active work, and human authority become visible.',
};

export default function WorldPage() {
  return <WorldClient />;
}
