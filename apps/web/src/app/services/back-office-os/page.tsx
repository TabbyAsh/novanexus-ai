import type { Metadata } from 'next';
import BackOfficeClient from './BackOfficeClient';

export const metadata: Metadata = {
  title: 'Back Office OS Starter Pilot — Nova',
  description: 'A bounded, human-delivered back-office setup pilot for small operators. Five defined deliverables for $150 one-time.',
};

export default function BackOfficeOSPage() {
  return <BackOfficeClient />;
}
