import type { Metadata } from 'next';
import CheckClient from './CheckClient';

export const metadata: Metadata = {
  title: 'Flip Check — the max price to pay, in 10 seconds | Nova',
  description:
    'Before you buy anything to resell, paste its recent sold prices. Nova gives you the exact max to pay, your expected profit, and a script to close the deal. Free, no account.',
  openGraph: {
    title: 'Never overpay for a flip again',
    description: 'Paste the sold prices. Nova tells you the exact max to pay — in 10 seconds, free.',
  },
};

export default function CheckPage() {
  return <CheckClient />;
}
