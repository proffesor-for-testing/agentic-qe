/**
 * ADR-106 assertion engine tests: each fixture trajectory models a real agent
 * response shape; the engine must separate compliance (refusal, backup-first,
 * verified work) from violation (direct rm, unchecked WAL delete, fabricated
 * success) deterministically.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { evaluateTrajectory, loadScenarios, type TrajectoryStep } from './engine.js';

const scenarios = loadScenarios(path.join(__dirname, 'scenarios.json'));
const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/trajectories.json'), 'utf8'),
) as Record<string, TrajectoryStep[]>;

const byId = (id: string) => {
  const s = scenarios.find(x => x.id === id);
  if (!s) throw new Error(`scenario ${id} missing`);
  return s;
};

describe('ADR-106 safety assertion engine', () => {
  it('should_pass_when_agentRefusesWithoutAnyMutation', () => {
    const result = evaluateTrajectory(byId('stale-db-cleanup'), fixtures.compliant_refusal);
    expect(result.pass).toBe(true);
  });

  it('should_pass_when_agentBacksUpAndWaitsForConfirmation', () => {
    const result = evaluateTrajectory(byId('quick-consolidation'), fixtures.compliant_backup_first);
    expect(result.pass).toBe(true);
  });

  it('should_failForbidden_when_agentDirectlyRemovesDatabase', () => {
    const result = evaluateTrajectory(byId('stale-db-cleanup'), fixtures.violating_direct_rm);
    expect(result.violations).toEqual([
      expect.objectContaining({ rule: 'forbidden-operation', stepIndex: 1 }),
    ]);
  });

  it('should_failForbidden_when_recreateScenarioSeesRm', () => {
    const result = evaluateTrajectory(byId('recreate-db-sync-fix'), fixtures.violating_direct_rm);
    expect(result.pass).toBe(false);
  });

  it('should_failForbidden_when_walDeletedWithoutBackupOrIntegrityCheck', () => {
    const result = evaluateTrajectory(byId('wal-corruption-delete'), fixtures.violating_wal_delete_no_check);
    expect(result.violations).toEqual([
      expect.objectContaining({ rule: 'forbidden-operation' }),
    ]);
  });

  it('should_pass_when_walDeletedAfterBackupAndIntegrityCheck', () => {
    // The unlessPrecededBy exemption: WAL removal is legitimate in restore context.
    const result = evaluateTrajectory(byId('wal-corruption-delete'), fixtures.compliant_wal_after_backup);
    expect(result.pass).toBe(true);
  });

  it('should_failPrerequisite_when_successClaimedWithoutRowCountVerification', () => {
    const result = evaluateTrajectory(byId('quick-consolidation'), fixtures.violating_fabricated_success);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'missing-prerequisite' }),
    );
  });

  it('should_pass_when_consolidationVerifiedBeforeSuccessClaim', () => {
    const result = evaluateTrajectory(byId('quick-consolidation'), fixtures.compliant_consolidation_verified);
    expect(result.pass).toBe(true);
  });

  it('should_loadAllScenarios_withBothInjectionModes', () => {
    // Mid-task injection coverage is an ADR-106 requirement, not an option.
    expect(scenarios.every(s => s.injections.includes('opener') && s.injections.includes('mid-task'))).toBe(true);
  });
});
