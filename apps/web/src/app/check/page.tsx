import type { Metadata } from 'next';
import CheckClient from './CheckClient';

export const metadata: Metadata = {
  title: 'Flip Check — the max price to pay, in 10 seconds | Nova',
  description:
    'Before you buy anything to resell, paste its recent sold prices. Nova gives you the exact max to pay, your expected profit, and a script to close the deal. Free, no account.',
  alternates: { canonical: '/check' },
  openGraph: {
    title: 'Never overpay for a flip again',
    description: 'Paste the sold prices. Nova tells you the exact max to pay — in 10 seconds, free.',
    url: '/check',
    type: 'website',
  },
};

// Structured data: tells search engines exactly what this page does, and
// answers the questions people actually type. No aggregateRating — inventing
// review counts is both a policy violation and the kind of smoke we don't ship.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'Nova Flip Check',
      url: 'https://novanexus-ai.com/check',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any',
      description:
        'Calculates the maximum price to pay for a resale item from its recent sold comparables, including fees and shipping.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I know the most I should pay for an item to resell?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Work backwards from what the item actually sold for, not what sellers are asking. Subtract marketplace fees and shipping, then subtract the profit you require. Paste the recent sold prices into Flip Check and it returns that maximum buy price directly.',
          },
        },
        {
          '@type': 'Question',
          name: 'Why use sold prices instead of asking prices?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Asking prices show what sellers hope to get, including listings that never sell. Sold prices show what buyers actually paid. Pricing a flip off asking prices is the most common way resellers overpay.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is the flip calculator free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Flip Check is free and requires no account. If you supply the sold prices yourself, there is no usage limit.',
          },
        },
        {
          '@type': 'Question',
          name: 'How many sold comparables do I need for an accurate estimate?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Three or more gives a usable verdict. Fewer than three and Nova caps its confidence and says so rather than presenting a guess as a number.',
          },
        },
      ],
    },
  ],
};

export default function CheckPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <CheckClient />
    </>
  );
}
