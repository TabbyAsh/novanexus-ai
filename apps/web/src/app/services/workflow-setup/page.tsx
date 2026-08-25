import type { Metadata } from 'next';
import { serializeStructuredData, workflowSetupStructuredData } from '@/lib/public-structured-data';
import BackOfficeClient from '../back-office-os/BackOfficeClient';

export const metadata: Metadata = {
  title: 'Workflow Setup Pilot — Nova',
  description: 'A bounded, human-delivered workflow setup for small operators. Five defined deliverables for $150 one-time.',
  alternates: { canonical: '/services/workflow-setup' },
  openGraph: {
    type: 'website',
    url: '/services/workflow-setup',
    title: 'Workflow Setup Pilot — Nova',
    description: 'Five defined, human-delivered workflow setup deliverables for $150 one-time. No subscription.',
  },
  twitter: {
    card: 'summary',
    title: 'Workflow Setup Pilot — Nova',
    description: 'Five defined, human-delivered workflow setup deliverables for $150 one-time. No subscription.',
  },
};

export default function WorkflowSetupPage() {
  return (
    <>
      <script
        id="workflow-setup-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(workflowSetupStructuredData) }}
      />
      <BackOfficeClient />
    </>
  );
}
