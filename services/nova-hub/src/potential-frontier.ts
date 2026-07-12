import type { NexusCapabilityDescriptor } from '@nova/shared';

export const RECURSIVE_IMPROVEMENT_CONTRACT = {
  name: 'bounded recursive capability improvement',
  stages: [
    'observe outcomes',
    'identify a falsifiable capability gap',
    'propose a candidate capability or instruction',
    'run it in a bounded sandbox',
    'compare it against an incumbent on held-out evaluations',
    'request human promotion',
    'monitor real outcomes',
    'retire or roll back when evidence degrades',
  ],
  invariants: [
    'the candidate cannot promote itself',
    'generated output is not evidence of improvement',
    'external side effects require separate authority',
    'missing or unreadable authority fails closed',
    'human purpose and permission remain sovereign',
  ],
} as const;

const HORIZON = [
  'multimodal perception',
  'realtime voice interaction',
  'scientific research and simulation',
  'invention and engineering',
  'computer and browser operation',
  'durable tenant-owned memory',
  'economic experimentation and allocation',
  'multi-agent orchestration',
  'capability acquisition through MCP and tools',
  'evaluation-driven recursive improvement',
] as const;

export function assessPotentialFrontier(capabilities: NexusCapabilityDescriptor[]) {
  const counts = capabilities.reduce<Record<string, number>>((acc, capability) => {
    acc[capability.status] = (acc[capability.status] || 0) + 1;
    return acc;
  }, {});
  const gaps = capabilities
    .filter(capability => capability.status !== 'available')
    .map(capability => ({
      capabilityId: capability.id,
      status: capability.status,
      requirements: capability.requires,
      authority: capability.authority,
    }));
  return {
    definition: 'Nova is potential made executable; this frontier measures what can actually be realized now.',
    measuredAt: new Date().toISOString(),
    counts,
    capabilities: capabilities.length,
    gaps,
    horizon: HORIZON,
    recursiveImprovement: RECURSIVE_IMPROVEMENT_CONTRACT,
  };
}
