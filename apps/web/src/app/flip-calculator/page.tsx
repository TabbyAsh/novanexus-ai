/**
 * /flip-calculator — Public SEO landing page.
 *
 * Targets: "flip calculator", "resale profit calculator", "ebay fee calculator",
 * "craigslist flip calculator", "is this item worth flipping"
 *
 * No login required. Paste-your-own-comps via the public /v1/flip/appraise
 * endpoint (manualComps). CTA to sign up + the full /analyze appraiser.
 */

import type { Metadata } from 'next';
import FlipCalculatorClient from './FlipCalculatorClient';

export const metadata: Metadata = {
  title: 'Free Flip Calculator — Honest Resale Profit Math | NovaNexus',
  description:
    'Paste real eBay sold prices (linked one click away) and get an honest flip verdict: net profit after fees and shipping, a safe max-buy price, and a negotiation script. Free, no signup.',
  keywords: [
    'flip calculator', 'resale profit calculator', 'ebay fee calculator',
    'is this worth flipping', 'craigslist flip', 'resale value estimator',
    'ebay profit calculator', 'flip profit margin', 'item resale calculator',
  ],
  openGraph: {
    title: 'Free Flip Calculator — Honest Resale Profit Math',
    description: 'Paste real sold prices, get a real verdict: net profit, safe max-buy, and a negotiation script. The basis of every number is labeled.',
    type: 'website',
  },
};

export default function FlipCalculatorPage() {
  return <FlipCalculatorClient />;
}
