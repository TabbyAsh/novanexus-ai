import type { Metadata } from 'next';
import DecisionCardsClient from './DecisionCardsClient';

export const metadata: Metadata = {
  title: 'Decision Cards — Nova Enterprises',
  description: 'Every business situation has a next move. Decision Cards give you the checklist, script, template, and action for your exact moment.',
  keywords: ['business decision cards', 'small business templates', 'business situation guide', 'contractor templates', 'freelancer business tools'],
};

export default function DecisionCardsPage() {
  return <DecisionCardsClient />;
}
