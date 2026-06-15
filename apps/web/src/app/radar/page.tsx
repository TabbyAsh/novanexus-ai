import type { Metadata } from 'next';
import RadarClient from './RadarClient';

export const metadata: Metadata = {
  title: 'Nova Trend Radar — What\'s About to Sell, Before It Peaks',
  description: 'Live demand radar for resellers and online sellers. Nova scans surging trends across multiple countries and turns them into ranked product opportunities — what to sell, who buys it, where to source it. No inventory.',
  keywords: ['what to dropship', 'trending products', 'what to sell online', 'print on demand ideas', 'reseller trends', 'product research tool'],
  openGraph: {
    title: 'Nova Trend Radar — What\'s About to Sell, Before It Peaks',
    description: 'Live trending product opportunities, scored across multiple countries. The product is the ad.',
    type: 'website',
  },
};

export default function RadarPage() {
  return <RadarClient />;
}
