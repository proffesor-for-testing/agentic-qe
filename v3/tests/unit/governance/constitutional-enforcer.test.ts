/**
 * Unit tests for governance/constitutional-enforcer.ts
 *
 * Tests: invariant loading, specific invariant checks (all 7),
 * enforcement, escalation, statistics, and flag management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock feature-flags with controllable return values
const mockGetFlags = vi.fn().mockReturnValue({
  continueGate: { maxConsecutiveRetries: 3, reworkRatioThreshold: 0.5 },
  budgetMeter: { maxSessionCostUsd: 50, maxTokensPerSession: 1_000_000 },
  global: { strictMode: false },
});
const mockIsStrictMode = vi.fn().mockReturnValue(false);

vi.mock('../../../src/governance/feature-flags.js', () => ({
  governanceFlags: { getFlags: () => mockGetFlags() },
  isStrictMode: () => mockIsStrictMode(),
}));

import {
  ConstitutionalEnforcer,
  createConstitutionalEnforcer,
  type ExecutionProof,
  type SecurityScan,
  type DeleteOperation,
  type Backup,
  type AgentStats,
  type MemoryPattern,
  type Verification,
} from '../../../src/governance/constitutional-enforcer.js';

describe('ConstitutionalEnforcer', () => {
  let enforcer: ConstitutionalEnforcer;

  beforeEach(() => {
    mockIsStrictMode.mockReturnValue(false);
    enforcer = createConstitutionalEnforcer({
      enabled: true,
      strictEnforcement: false,
      escalateViolations: false,
      constitutionPath: '/nonexistent/constitution.md',
      logAllChecks: false,
    });
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  describe('initialization', () => {
    it('should load 7 default invariants on initialize', async () => {
      await enforcer.initialize();
      const invariants = enforcer.getInvariants();
      expect(invariants).toHaveLength(7);
    });

    it('should set initialized flag', async () => {
      expect(enforcer.isInitialized()).toBe(false);
      await enforcer.initialize();
      expect(enforcer.isInitialized()).toBe(true);
    });

    it('should be idempotent on double initialize', async () => {
      await enforcer.initialize();
      await enforcer.initialize(); // should not throw
      expect(enforcer.getInvariants()).toHaveLength(7);
    });

    it('should allow fetching invariant by id', async () => {
      await enforcer.initialize();
      const inv = enforcer.getInvariant('test-execution-integrity');
      expect(inv).not.toBeNull();
      expect(inv!.name).toBe('Test Execution Integrity');
    });

    it('should return null for unknown invariant id', async () => {
      await enforcer.initialize();
      expect(enforcer.getInvariant('nonexistent')).toBeNull();
    });
  });

  // ============================================================================
  // Invariant 1: Test Execution Integrity
  // ============================================================================

  describe('checkTestExecutionIntegrity', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass when not claiming tests passed', () => {
      const check = enforcer.checkTestExecutionIntegrity('task-1', false);
      expect(check.passed).toBe(true);
    });

    it('should fail when claiming success without proof', () => {
      const check = enforcer.checkTestExecutionIntegrity('task-1', true);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without execution proof');
    });

    it('should fail when proof task id does not match', () => {
      const proof: ExecutionProof = {
        taskId: 'task-other',
        allTestsExecuted: true,
        timestamp: Date.now(),
      };
      const check = enforcer.checkTestExecutionIntegrity('task-1', true, proof);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('does not match');
    });

    it('should fail when not all tests executed', () => {
      const proof: ExecutionProof = {
        taskId: 'task-1',
        allTestsExecuted: false,
        timestamp: Date.now(),
      };
      const check = enforcer.checkTestExecutionIntegrity('task-1', true, proof);
      expect(check.passed).toBe(false);
    });

    it('should pass with valid execution proof', () => {
      const proof: ExecutionProof = {
        taskId: 'task-1',
        allTestsExecuted: true,
        timestamp: Date.now(),
      };
      const check = enforcer.checkTestExecutionIntegrity('task-1', true, proof);
      expect(check.passed).toBe(true);
    });
  });

  // ============================================================================
  // Invariant 2: Security Scan Requirement
  // ============================================================================

  describe('checkSecurityScanRequirement', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass when change does not affect auth code', () => {
      const check = enforcer.checkSecurityScanRequirement('change-1', false);
      expect(check.passed).toBe(true);
    });

    it('should fail when auth code changed without scan', () => {
      const check = enforcer.checkSecurityScanRequirement('change-1', true);
      expect(check.passed).toBe(false);
    });

    it('should fail when scan has critical vulnerabilities', () => {
      const scan: SecurityScan = {
        changeId: 'change-1',
        status: 'complete',
        criticalVulnerabilities: 2,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        timestamp: Date.now(),
      };
      const check = enforcer.checkSecurityScanRequirement('change-1', true, scan);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('critical vulnerabilities');
    });

    it('should pass with clean complete scan', () => {
      const scan: SecurityScan = {
        changeId: 'change-1',
        status: 'complete',
        criticalVulnerabilities: 0,
        highVulnerabilities: 0,
        mediumVulnerabilities: 1,
        lowVulnerabilities: 3,
        timestamp: Date.now(),
      };
      const check = enforcer.checkSecurityScanRequirement('change-1', true, scan);
      expect(check.passed).toBe(true);
    });
  });

  // ============================================================================
  // Invariant 3: Backup Before Delete
  // ============================================================================

  describe('checkBackupBeforeDelete', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass for non-protected targets', () => {
      const op: DeleteOperation = { type: 'delete', target: 'temp.txt', timestamp: Date.now() };
      const check = enforcer.checkBackupBeforeDelete(op);
      expect(check.passed).toBe(true);
    });

    it('should fail for protected target without backup', () => {
      const op: DeleteOperation = { type: 'delete', target: 'memory.db', timestamp: Date.now() };
      const check = enforcer.checkBackupBeforeDelete(op);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without backup');
    });

    it('should fail when backup is unverified', () => {
      const op: DeleteOperation = { type: 'delete', target: 'memory.db', timestamp: 2000 };
      const backup: Backup = { source: 'memory.db', destination: '/tmp/bak', timestamp: 1000, verified: false };
      const check = enforcer.checkBackupBeforeDelete(op, backup);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('not verified');
    });

    it('should pass with valid verified backup', () => {
      const op: DeleteOperation = { type: 'delete', target: 'memory.db', timestamp: 2000 };
      const backup: Backup = { source: 'memory.db', destination: '/tmp/bak', timestamp: 1000, verified: true };
      const check = enforcer.checkBackupBeforeDelete(op, backup);
      expect(check.passed).toBe(true);
    });
  });

  // ============================================================================
  // Invariant 4: Loop Detection
  // ============================================================================

  describe('checkLoopDetection', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass when agent stats are within limits', () => {
      const stats: AgentStats = {
        agentId: 'agent-1',
        consecutiveIdenticalActions: 1,
        reworkRatio: 0.1,
        totalActions: 10,
        failedActions: 1,
      };
      const check = enforcer.checkLoopDetection('agent-1', stats);
      expect(check.passed).toBe(true);
    });

    it('should fail when consecutive retries exceed limit', () => {
      const stats: AgentStats = {
        agentId: 'agent-1',
        consecutiveIdenticalActions: 5,
        reworkRatio: 0.1,
        totalActions: 10,
        failedActions: 1,
      };
      const check = enforcer.checkLoopDetection('agent-1', stats);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('max consecutive retries');
    });

    it('should fail when rework ratio is too high', () => {
      const stats: AgentStats = {
        agentId: 'agent-1',
        consecutiveIdenticalActions: 1,
        reworkRatio: 0.8,
        totalActions: 10,
        failedActions: 8,
      };
      const check = enforcer.checkLoopDetection('agent-1', stats);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('rework ratio');
    });
  });

  // ============================================================================
  // Invariant 5: Budget Enforcement
  // ============================================================================

  describe('checkBudgetEnforcement', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass when within budget', () => {
      const check = enforcer.checkBudgetEnforcement(10, 100_000);
      expect(check.passed).toBe(true);
    });

    it('should fail when cost exceeds limit', () => {
      const check = enforcer.checkBudgetEnforcement(100, 100_000);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('cost');
    });

    it('should fail when tokens exceed limit', () => {
      const check = enforcer.checkBudgetEnforcement(10, 2_000_000);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('tokens');
    });
  });

  // ============================================================================
  // Invariant 6: Memory Consistency
  // ============================================================================

  describe('checkMemoryConsistency', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should pass for non-conflicting patterns', () => {
      const pattern: MemoryPattern = { key: 'k1', domain: 'd1', value: 'v1', timestamp: Date.now() };
      const existing: MemoryPattern[] = [{ key: 'k2', domain: 'd1', value: 'v2', timestamp: Date.now() }];
      const check = enforcer.checkMemoryConsistency(pattern, existing);
      expect(check.passed).toBe(true);
    });

    it('should fail for contradictory pattern without supersession', () => {
      const pattern: MemoryPattern = { key: 'k1', domain: 'd1', value: 'new_value', timestamp: Date.now() };
      const existing: MemoryPattern[] = [{ key: 'k1', domain: 'd1', value: 'old_value', timestamp: Date.now() }];
      const check = enforcer.checkMemoryConsistency(pattern, existing);
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('contradicts');
    });

    it('should pass when supersession marker is present', () => {
      const pattern: MemoryPattern = {
        key: 'k1', domain: 'd1', value: 'new_value', timestamp: Date.now(),
        supersessionMarker: 'replaces-old',
      };
      const existing: MemoryPattern[] = [{ key: 'k1', domain: 'd1', value: 'old_value', timestamp: Date.now() }];
      const check = enforcer.checkMemoryConsistency(pattern, existing);
      expect(check.passed).toBe(true);
    });
  });

  // ============================================================================
  // Invariant 7: Verification Before Claim
  // ============================================================================

  describe('checkVerificationBeforeClaim', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should fail without verification', () => {
      const check = enforcer.checkVerificationBeforeClaim('claim-1');
      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without verification');
    });

    it('should fail when verification result is not passed', () => {
      const v: Verification = { claimId: 'claim-1', method: 'test_execution', result: 'failed', timestamp: Date.now() };
      const check = enforcer.checkVerificationBeforeClaim('claim-1', v);
      expect(check.passed).toBe(false);
    });

    it('should pass with valid passed verification', () => {
      const v: Verification = { claimId: 'claim-1', method: 'test_execution', result: 'passed', timestamp: Date.now() };
      const check = enforcer.checkVerificationBeforeClaim('claim-1', v);
      expect(check.passed).toBe(true);
    });
  });

  // ============================================================================
  // Enforcement
  // ============================================================================

  describe('enforceInvariant', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should not block passing checks', () => {
      const check = enforcer.checkTestExecutionIntegrity('task-1', false);
      const result = enforcer.enforceInvariant(check);
      expect(result.blocked).toBe(false);
      expect(result.escalated).toBe(false);
    });

    it('should block critical invariants even in non-strict mode', () => {
      const check = enforcer.checkTestExecutionIntegrity('task-1', true);
      const result = enforcer.enforceInvariant(check);
      expect(result.blocked).toBe(true);
    });

    it('should block all failed checks in strict mode', () => {
      enforcer.updateFlags({ strictEnforcement: true });
      const stats: AgentStats = {
        agentId: 'agent-1',
        consecutiveIdenticalActions: 5,
        reworkRatio: 0.1,
        totalActions: 10,
        failedActions: 1,
      };
      const check = enforcer.checkLoopDetection('agent-1', stats);
      const result = enforcer.enforceInvariant(check);
      expect(result.blocked).toBe(true);
    });
  });

  // ============================================================================
  // Escalation
  // ============================================================================

  describe('escalation', () => {
    beforeEach(async () => {
      enforcer.updateFlags({ escalateViolations: true });
      await enforcer.initialize();
    });

    it('should call escalation callbacks on violation', () => {
      const callback = vi.fn();
      enforcer.onEscalation(callback);

      const check = enforcer.checkTestExecutionIntegrity('task-1', true);
      enforcer.enforceInvariant(check);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
    });

    it('should allow unsubscribing from escalation', () => {
      const callback = vi.fn();
      const unsubscribe = enforcer.onEscalation(callback);
      unsubscribe();

      const check = enforcer.checkTestExecutionIntegrity('task-1', true);
      enforcer.enforceInvariant(check);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================

  describe('getEnforcementStats', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should track check counts', () => {
      enforcer.checkTestExecutionIntegrity('task-1', false);
      enforcer.checkTestExecutionIntegrity('task-2', true);
      enforcer.checkBudgetEnforcement(10, 100_000);

      const stats = enforcer.getEnforcementStats();
      expect(stats.totalChecks).toBe(3);
      expect(stats.passedChecks).toBe(2);
      expect(stats.failedChecks).toBe(1);
      expect(stats.passRate).toBeCloseTo(2 / 3, 2);
    });

    it('should reset stats', () => {
      enforcer.checkBudgetEnforcement(10, 100_000);
      enforcer.resetStats();
      const stats = enforcer.getEnforcementStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.passRate).toBe(1);
    });
  });

  // ============================================================================
  // Invariant Toggle
  // ============================================================================

  describe('setInvariantEnabled', () => {
    beforeEach(async () => { await enforcer.initialize(); });

    it('should disable a specific invariant', () => {
      enforcer.setInvariantEnabled('test-execution-integrity', false);
      const check = enforcer.checkInvariant('test-execution-integrity', {
        taskId: 'task-1',
        claimsTestsPassed: true,
      });
      // Disabled invariant should auto-pass
      expect(check.passed).toBe(true);
    });
  });
});
