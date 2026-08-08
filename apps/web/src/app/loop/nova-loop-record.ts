export type NovaLoopDraft = {
  changed: string;
  signalSource: string;
  decision: string;
  unknowns: string;
  constraints: string;
  nextAction: string;
  owner: string;
  boundary: string;
  requiredEvidence: string;
  observedEvidence: string;
  reviewAt: string;
  learning: string;
  nextChange: string;
};

export const EMPTY_NOVA_LOOP: NovaLoopDraft = {
  changed: '',
  signalSource: '',
  decision: '',
  unknowns: '',
  constraints: '',
  nextAction: '',
  owner: '',
  boundary: '',
  requiredEvidence: '',
  observedEvidence: '',
  reviewAt: '',
  learning: '',
  nextChange: '',
};

function valueOrOpen(value: string): string {
  return value.trim() || '[open]';
}

export function operatingStatus(draft: NovaLoopDraft): string {
  if (draft.observedEvidence.trim() && draft.learning.trim()) {
    return 'REVIEWED — evidence and learning were recorded by the operator.';
  }
  if (draft.observedEvidence.trim()) {
    return 'EVIDENCE RECORDED — the learning review remains open.';
  }
  return 'OPEN — the next action is defined; its result is not yet evidenced.';
}

export function formatOperatingRecord(draft: NovaLoopDraft, createdAt: string): string {
  const recordedLearning = draft.observedEvidence.trim() ? draft.learning : '';
  return `# Nova Operating Record

Created: ${createdAt}
Status: ${operatingStatus(draft)}

## 1. Notice

What changed: ${valueOrOpen(draft.changed)}
Signal or source: ${valueOrOpen(draft.signalSource)}

## 2. Frame

Decision to make: ${valueOrOpen(draft.decision)}
Important unknowns: ${valueOrOpen(draft.unknowns)}
Constraints: ${valueOrOpen(draft.constraints)}

## 3. Commit

Next action: ${valueOrOpen(draft.nextAction)}
Owner: ${valueOrOpen(draft.owner)}
Boundary: ${valueOrOpen(draft.boundary)}

## 4. Verify

Evidence required: ${valueOrOpen(draft.requiredEvidence)}
Evidence observed: ${valueOrOpen(draft.observedEvidence)}

## 5. Adapt

Review date or trigger: ${valueOrOpen(draft.reviewAt)}
Learning: ${valueOrOpen(recordedLearning)}
Next change: ${valueOrOpen(draft.nextChange)}

---
This record preserves an operator's reasoning and evidence. It does not prove that an external action occurred unless the underlying evidence is independently checked.
`;
}
