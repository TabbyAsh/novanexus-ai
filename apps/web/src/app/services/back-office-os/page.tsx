import type { Metadata } from 'next';
import BackOfficeClient from './BackOfficeClient';

export const metadata: Metadata = {
  title: 'Nova Back Office OS — Done-for-You Business Admin',
  description: 'A monthly admin system for small businesses: estimates, invoices, expense tracking, customer scripts, and weekly business visibility. From $150/month.',
  keywords: ['small business admin', 'done for you bookkeeping', 'business templates', 'contractor admin system', 'small business back office'],
};

export default function BackOfficeOSPage() {
  return <BackOfficeClient />;
}
