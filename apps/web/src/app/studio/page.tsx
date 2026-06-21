import type { Metadata } from 'next';
import StudioClient from './StudioClient';

export const metadata: Metadata = {
  title: 'Nova Studio — Websites & Lead Systems for Local Businesses',
  description: 'Clean, fast, modern websites and lead systems for local businesses and brands. Built in days, not months. From $800. A division of Nova Enterprises.',
  keywords: ['website for small business', 'local business website', 'freelance web designer', 'cheap website builder service', 'website for contractors', 'brand storefront'],
  openGraph: {
    title: 'Nova Studio — Websites that make you look like the real thing',
    description: 'Clean websites and lead systems for local businesses and brands. Built in days. From $800.',
    type: 'website',
  },
};

export default function StudioPage() {
  return <StudioClient />;
}
