/**
 * /flip-calculator — Public SEO landing page.
 *
 * Targets: "flip calculator", "resale profit calculator", "ebay fee calculator",
 * "craigslist flip calculator", "is this item worth flipping"
 *
 * No login required. Real eBay comps via the public /v1/flip/appraise endpoint.
 * CTA to sign up for Flip Finder (automated scanning) + full features.
 */

import type { Metadata } from 'next';
import FlipCalculatorClient from './FlipCalculatorClient';

export const metadata: Metadata = {
  title: 'Free Flip Calculator — Real eBay Resale Profit Estimator | NovaNexus',
  description:
    'Enter any item to instantly see estimated resale value, eBay fees, shipping costs, and net profit based on real sold listings. Free flip profit calculator — no signup needed.',
  keywords: [
    'flip calculator', 'resale profit calculator', 'ebay fee calculator',
    'is this worth flipping', 'craigslist flip', 'resale value estimator',
    'ebay profit calculator', 'flip profit margin', 'item resale calculator',
  ],
  openGraph: {
    title: 'Free Flip Calculator — Real eBay Resale Profit Estimator',
    description: 'Instantly see if an item is worth flipping. Real eBay sold comps, fee math, and a clear verdict.',
    type: 'website',
  },
};

export default function FlipCalculatorPage() {
  return <FlipCalculatorClient />;
}
