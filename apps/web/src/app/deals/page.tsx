import type { Metadata } from 'next';
import DealsClient from './DealsClient';

export const metadata: Metadata = {
  title: "Today's verified flips — real listings, real sold comps | Nova",
  description:
    'Nova reads local classifieds, looks up what each item actually sold for on eBay, subtracts fees and shipping, and publishes only what clears a real profit. Every number traces to real sold listings.',
  openGraph: {
    title: "Today's verified flips",
    description: 'Real listings. Real sold comps. Only what clears a real profit after fees and shipping.',
  },
};

export const revalidate = 0;

export default function DealsPage() {
  return <DealsClient />;
}
