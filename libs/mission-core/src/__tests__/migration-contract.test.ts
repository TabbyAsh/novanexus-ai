import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve(__dirname, '../../../../infra/migrations/037_nova_missions.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('Nova mission persistence authority contract', () => {
  it('derives effect from an immutable trusted action policy', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS nova_mission_action_policies');
    expect(sql).toContain('NEW.effect := target_policy.effect');
    expect(sql).toContain('FOREIGN KEY (action_type, capability_id)');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON nova_mission_action_policies');
  });

  it('cryptographically binds canonical payload and action envelope', () => {
    expect(sql).toContain("payload_hash = encode(digest(convert_to(payload_canonical_json, 'UTF8'), 'sha256'), 'hex')");
    expect(sql).toContain("action_envelope_hash = encode(digest(convert_to(action_envelope_canonical_json, 'UTF8'), 'sha256'), 'hex')");
    expect(sql).toContain('action_envelope_canonical_json::jsonb = jsonb_build_object');
    expect(sql).not.toContain('preview_hash');
    expect(sql).not.toContain('explicit_approval_reference');
  });

  it('allows only forward execution transitions with evidence-gated success', () => {
    expect(sql).toContain("OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED', 'CANCELLED')");
    expect(sql).toContain("OLD.status = 'APPROVED' AND NEW.status IN ('RUNNING', 'CANCELLED')");
    expect(sql).toContain("OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')");
    expect(sql).toContain("NEW.status = 'SUCCEEDED' AND jsonb_array_length(NEW.result_evidence_json) = 0");
  });

  it('rechecks live authority and consumes approval and ACT_ONCE at dispatch claim', () => {
    expect(sql).toContain("target_mission.state <> 'RUNNING'");
    expect(sql).toContain('CURRENT_TIMESTAMP >= target_mandate.expires_at');
    expect(sql).toContain('Nova mission mandate was revoked before dispatch claim');
    expect(sql).toContain("target_kill_switch.state <> 'DISABLED'");
    expect(sql).toContain('INSERT INTO nova_mission_action_approval_uses');
    expect(sql).toContain('INSERT INTO nova_mission_act_once_uses');
    expect(sql).toContain('dispatch_claim_hash');
  });

  it('prevents late actions from violating terminal closeout', () => {
    expect(sql).toContain('Nova mission actions may be recorded only while the mission is running');
    expect(sql).toContain('A Nova mission cannot close while an action remains non-terminal');
  });
});
