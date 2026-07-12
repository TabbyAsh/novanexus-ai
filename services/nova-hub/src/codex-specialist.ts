/**
 * CODEX SPECIALIST ADAPTER
 *
 * Codex enters Nova as a governed coding capability, not as an autonomous
 * sovereign. This adapter can inspect a configured workspace and propose work.
 * It cannot write files, use the network, request approval, or promote itself.
 */

import { writeArtifact } from './substrate';

export type CodexSpecialistMode = 'analyze' | 'propose';

export interface CodexSpecialistResult {
  available: boolean;
  mode: CodexSpecialistMode;
  response?: string;
  threadId?: string | null;
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
  } | null;
  authority: {
    sandbox: 'read-only';
    networkAccess: false;
    approvalPolicy: 'never';
    filesChanged: false;
    activationPerformed: false;
  };
  gap?: string;
}

export function codexSpecialistAvailable(): boolean {
  return process.env.CODEX_SPECIALIST_ENABLED === 'true'
    && Boolean(process.env.OPENAI_API_KEY)
    && Boolean(process.env.CODEX_WORKSPACE_ROOT);
}

export async function runCodexSpecialist(input: {
  objective: string;
  mode: CodexSpecialistMode;
}): Promise<CodexSpecialistResult> {
  const authority = {
    sandbox: 'read-only' as const,
    networkAccess: false as const,
    approvalPolicy: 'never' as const,
    filesChanged: false as const,
    activationPerformed: false as const,
  };
  if (!codexSpecialistAvailable()) {
    return {
      available: false,
      mode: input.mode,
      authority,
      gap: 'Codex specialist requires CODEX_SPECIALIST_ENABLED=true, OPENAI_API_KEY, and CODEX_WORKSPACE_ROOT.',
    };
  }

  const objective = input.objective.trim().slice(0, 8_000);
  if (!objective) return { available: false, mode: input.mode, authority, gap: 'A concrete coding objective is required.' };

  // Preserve native ESM loading while Nova Hub remains CommonJS.
  const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@openai/codex-sdk')>;
  const { Codex } = await importEsm('@openai/codex-sdk');
  const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY });
  const thread = codex.startThread({
    workingDirectory: process.env.CODEX_WORKSPACE_ROOT,
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    webSearchMode: 'disabled',
    modelReasoningEffort: 'high',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60_000);
  try {
    const modeInstruction = input.mode === 'analyze'
      ? 'Inspect and diagnose only. Return evidence, risks, and a prioritized plan. Do not edit files.'
      : 'Produce a reviewable implementation proposal and test plan. Do not edit files.';
    const turn = await thread.run(
      `${modeInstruction}\nDo not read, reproduce, or expose secrets, credentials, private keys, access tokens, or environment values.\n\nNova constitutional constraint: expand realizable potential or deepen the governed human relationship; preserve human authority.\n\nObjective:\n${objective}`,
      { signal: controller.signal },
    );

    await writeArtifact({
      kind: 'mission_report',
      regime: 'EXPLORATION',
      authorType: 'agent',
      authorId: 'codex-specialist',
      payload: {
        agent: 'Codex Specialist',
        findings: ['read-only coding analysis completed'],
        anomalies: [],
        mode: input.mode,
        contentRedacted: true,
        authority,
        usage: turn.usage ? {
          inputTokens: turn.usage.input_tokens,
          cachedInputTokens: turn.usage.cached_input_tokens,
          outputTokens: turn.usage.output_tokens,
          reasoningOutputTokens: turn.usage.reasoning_output_tokens,
        } : null,
      },
    }).catch(() => null);

    return {
      available: true,
      mode: input.mode,
      response: turn.finalResponse,
      threadId: thread.id,
      usage: turn.usage ? {
        inputTokens: turn.usage.input_tokens,
        cachedInputTokens: turn.usage.cached_input_tokens,
        outputTokens: turn.usage.output_tokens,
        reasoningOutputTokens: turn.usage.reasoning_output_tokens,
      } : null,
      authority,
    };
  } finally {
    clearTimeout(timeout);
  }
}
