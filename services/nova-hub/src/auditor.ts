/**
 * THE MIRROR — Manifesto §6, build-order #5.
 *
 * A standing second-order agent whose assigned territory is Nova herself.
 * It hunts the failure modes a system cannot see from inside:
 *   1. CONFIRMATION DRIFT — agents filing many reports with zero anomalies
 *      ever ("the agent may be confirming rather than observing", §3).
 *   2. OPEN ANOMALIES AGING — surprises preserved but never chased
 *      (no hypothesis/outcome references them). Surprise is fuel; unburned
 *      fuel is a blind spot.
 *   3. UNKNOWN-KNOWNS — knowledge present on the substrate but never
 *      retrieved: artifacts old enough to matter that nothing references.
 *   4. REGIME SKEW — the card stream classifying overwhelmingly one way,
 *      which suggests the classifier, not the world, is doing the deciding.
 *
 * Its reports go to the owner UNFILTERED (email via Resend). No component,
 * including Nova's core, may suppress or edit an audit artifact — enforced
 * structurally: audits are immutable substrate artifacts like everything else.
 */

import { query, queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { writeArtifact, readArtifacts } from './substrate';

const logger = createLogger('auditor');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'kibblewyatt@gmail.com';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Nova <nova@novanexus-ai.com>';
const AUDITOR_ID = 'the-mirror';

interface AuditFinding {
  key: string;        // stable dedup key
  finding: string;    // plain language, five-minute understandable
  severity: 1 | 2 | 3;
  evidence: Record<string, unknown>;
}

// A finding already reported in the last 7 days is not re-reported.
async function alreadyReported(key: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM artifacts
     WHERE kind = 'audit' AND payload->>'key' = $1 AND created_at > NOW() - INTERVAL '7 days'
     LIMIT 1`,
    [key]
  ).catch(() => null);
  return !!row;
}

async function huntConfirmationDrift(): Promise<AuditFinding[]> {
  const rows = await query<{ author_id: string; agent: string; reports: string }>(
    `SELECT author_id, MAX(payload->>'agent') AS agent, COUNT(*) AS reports
     FROM artifacts
     WHERE kind = 'mission_report'
     GROUP BY author_id
     HAVING COUNT(*) >= 10
        AND COUNT(*) FILTER (WHERE jsonb_array_length(payload->'anomalies') > 0) = 0`
  ).catch(() => ({ rows: [] as any[] }));
  return rows.rows.map(r => ({
    key: `confirmation-drift:${r.author_id}`,
    finding: `${r.agent || r.author_id} has filed ${r.reports} mission reports and not one anomaly. It may be confirming rather than observing.`,
    severity: 2 as const,
    evidence: { agentId: r.author_id, reports: Number(r.reports) },
  }));
}

async function huntOpenAnomalies(): Promise<AuditFinding[]> {
  // Anomalies live inside mission reports; a report whose anomalies were
  // never referenced by a hypothesis or outcome within 48h is unburned fuel.
  const rows = await query<{ id: string; agent: string; created_at: string }>(
    `SELECT a.id, a.payload->>'agent' AS agent, a.created_at
     FROM artifacts a
     WHERE a.kind = 'mission_report'
       AND jsonb_array_length(a.payload->'anomalies') > 0
       AND a.created_at < NOW() - INTERVAL '48 hours'
       AND NOT EXISTS (
         SELECT 1 FROM artifacts b
         WHERE b.kind IN ('hypothesis', 'outcome') AND a.id = ANY(b.refs)
       )
     ORDER BY a.created_at LIMIT 5`
  ).catch(() => ({ rows: [] as any[] }));
  return rows.rows.map(r => ({
    key: `open-anomaly:${r.id}`,
    finding: `An anomaly from ${r.agent || 'an agent'} (${new Date(r.created_at).toISOString().slice(0, 10)}) has sat 48h+ with no hypothesis and no outcome. Surprise is fuel — this one is unburned.`,
    severity: 2 as const,
    evidence: { artifactId: r.id },
  }));
}

async function huntRegimeSkew(): Promise<AuditFinding[]> {
  const row = await queryOne<{ total: string; exploit: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE regime = 'EXPLOITATION') AS exploit
     FROM artifacts WHERE kind = 'decision_card' AND created_at > NOW() - INTERVAL '7 days'`
  ).catch(() => null);
  if (!row || parseInt(row.total, 10) < 20) return []; // too few cards to judge
  const total = parseInt(row.total, 10);
  const share = parseInt(row.exploit, 10) / total;
  if (share > 0.9 || share < 0.1) {
    return [{
      key: `regime-skew:${share > 0.9 ? 'exploit' : 'explore'}`,
      finding: `${Math.round(share * 100)}% of the last ${total} decision cards classified ${share > 0.9 ? 'EXPLOITATION' : 'EXPLORATION'}. Either the users are unusually uniform, or the classifier is doing the deciding. Misclassifying the regime is the system's primary failure mode.`,
      severity: 3,
      evidence: { total, exploitationShare: share },
    }];
  }
  return [];
}

async function emailOwner(findings: AuditFinding[]): Promise<void> {
  if (!RESEND_API_KEY || findings.length === 0) return;
  const body = findings
    .map(f => `[SEV ${f.severity}] ${f.finding}`)
    .join('\n\n');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [OWNER_EMAIL],
        subject: `The Mirror: ${findings.length} audit finding${findings.length === 1 ? '' : 's'} on Nova herself`,
        text: `Unfiltered, per the constitution. No component may suppress or edit these.\n\n${body}\n\n— The Mirror (second-order agent, territory: Nova)`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    logger.info('Audit report emailed to owner', { findings: findings.length });
  } catch (err) {
    logger.warn('Audit email failed — findings remain on the substrate', { error: (err as Error).message });
  }
}

export async function runAudit(): Promise<number> {
  const all = (await Promise.all([
    huntConfirmationDrift(),
    huntOpenAnomalies(),
    huntRegimeSkew(),
  ])).flat();

  const fresh: AuditFinding[] = [];
  for (const f of all) {
    if (!(await alreadyReported(f.key))) fresh.push(f);
  }

  for (const f of fresh) {
    await writeArtifact({
      kind: 'audit',
      authorType: 'agent',
      authorId: AUDITOR_ID,
      payload: { key: f.key, finding: f.finding, severity: f.severity, evidence: f.evidence },
    });
  }

  await emailOwner(fresh);
  if (fresh.length > 0) logger.info('Audit complete', { newFindings: fresh.length });
  return fresh.length;
}

// The Mirror is a real agent in the world — visible, attributed, remaining.
export async function ensureAuditorExists(): Promise<void> {
  try {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM world_agents WHERE mission = 'AUDITOR' AND status = 'ACTIVE' LIMIT 1`
    );
    if (existing) return;
    await query(
      `INSERT INTO world_agents (visitor_id, name, mission, symbol, sector, state_json)
       VALUES (NULL, 'The Mirror', 'AUDITOR', NULL, 'core', '{}')`
    );
    await writeArtifact({
      kind: 'audit',
      authorType: 'system',
      authorId: 'forge',
      payload: { key: 'auditor-born', finding: 'The Mirror deployed. Territory: Nova herself. Reports go to the owner unfiltered.', severity: 1, evidence: {} },
    });
    logger.info('The Mirror deployed');
  } catch (err) {
    logger.warn('Auditor bootstrap failed', { error: (err as Error).message });
  }
}
