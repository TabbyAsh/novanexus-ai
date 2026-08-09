import type { Metadata } from 'next';
import BackOfficeClient from '../back-office-os/BackOfficeClient';

export const metadata: Metadata = {
  title: 'Workflow Setup Pilot — Nova',
  description: 'A bounded, human-delivered workflow setup for small operators. Five defined deliverables for $150 one-time.',
};

export default function WorkflowSetupPage() {
  return <BackOfficeClient />;
}
