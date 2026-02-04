/**
 * Integration tests for Constitutional Enforcer governance integration
 *
 * Tests verify:
 * - Constitution loading and parsing
 * - Each of the 7 invariant checks
 * - Enforcement logic (blocking/allowing)
 * - Escalation to Queen Coordinator
 * - Gate integration
 * - Feature flag integration
 * - Statistics tracking
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
  isConstitutionalEnforcerEnabled,
  isStrictMode,
} from '../../../src/governance/feature-flags.js';
import {
  ConstitutionalEnforcer,
  constitutionalEnforcer,
  createConstitutionalEnforcer,
  isConstitutionalEnforcementEnabled,
  isStrictEnforcementEnabled,
  DEFAULT_CONSTITUTIONAL_ENFORCER_FLAGS,
  type Invariant,
  type InvariantCheck,
  type ExecutionProof,
  type SecurityScan,
  type Backup,
  type DeleteOperation,
  type AgentStats,
  type MemoryPattern,
  type Verification,
} from '../../../src/governance/constitutional-enforcer.js';

describe('Constitutional Enforcer Integration - ADR-058 Phase 4', () => {
  beforeEach(async () => {
    // Reset to defaults before each test
    governanceFlags.reset();
    constitutionalEnforcer.reset();
  });

  describe('Initialization and Constitution Loading', () => {
    it('should initialize with default invariants', async () => {
      const enforcer = new ConstitutionalEnforcer();
      await enforcer.initialize();

      expect(enforcer.isInitialized()).toBe(true);

      const invariants = enforcer.getInvariants();
      expect(invariants.length).toBe(7);
    });

    it('should have all 7 default invariants', async () => {
      const enforcer = new ConstitutionalEnforcer();
      await enforcer.initialize();

      const invariantIds = enforcer.getInvariants().map(i => i.id);

      expect(invariantIds).toContain('test-execution-integrity');
      expect(invariantIds).toContain('security-scan-required');
      expect(invariantIds).toContain('backup-before-delete');
      expect(invariantIds).toContain('loop-detection');
      expect(invariantIds).toContain('budget-enforcement');
      expect(invariantIds).toContain('memory-consistency');
      expect(invariantIds).toContain('verification-before-claim');
    });

    it('should get specific invariant by ID', async () => {
      const enforcer = new ConstitutionalEnforcer();
      await enforcer.initialize();

      const invariant = enforcer.getInvariant('test-execution-integrity');

      expect(invariant).not.toBeNull();
      expect(invariant?.name).toBe('Test Execution Integrity');
      expect(invariant?.enabled).toBe(true);
    });

    it('should return null for unknown invariant', async () => {
      const enforcer = new ConstitutionalEnforcer();
      await enforcer.initialize();

      const invariant = enforcer.getInvariant('unknown-invariant');
      expect(invariant).toBeNull();
    });

    it('should enable/disable invariants', async () => {
      const enforcer = new ConstitutionalEnforcer();
      await enforcer.initialize();

      enforcer.setInvariantEnabled('test-execution-integrity', false);
      expect(enforcer.getInvariant('test-execution-integrity')?.enabled).toBe(false);

      enforcer.setInvariantEnabled('test-execution-integrity', true);
      expect(enforcer.getInvariant('test-execution-integrity')?.enabled).toBe(true);
    });

    it('should use singleton instance', () => {
      expect(constitutionalEnforcer).toBeDefined();
      expect(constitutionalEnforcer).toBeInstanceOf(ConstitutionalEnforcer);
    });

    it('should create new instances with factory', () => {
      const enforcer1 = createConstitutionalEnforcer();
      const enforcer2 = createConstitutionalEnforcer();

      expect(enforcer1).not.toBe(enforcer2);
    });

    it('should accept custom flags', () => {
      const enforcer = new ConstitutionalEnforcer({
        strictEnforcement: true,
        logAllChecks: false,
      });

      const flags = enforcer.getFlags();
      expect(flags.strictEnforcement).toBe(true);
      expect(flags.logAllChecks).toBe(false);
    });
  });

  describe('Invariant 1: Test Execution Integrity', () => {
    it('should pass when not claiming tests passed', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkTestExecutionIntegrity(
        'task-123',
        false, // not claiming tests passed
        undefined
      );

      expect(check.passed).toBe(true);
      expect(check.invariantId).toBe('test-execution-integrity');
    });

    it('should fail when claiming tests passed without proof', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkTestExecutionIntegrity(
        'task-123',
        true, // claiming tests passed
        undefined // no proof
      );

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without execution proof');
    });

    it('should fail when proof task_id does not match', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const proof: ExecutionProof = {
        taskId: 'different-task',
        allTestsExecuted: true,
        timestamp: Date.now(),
      };

      const check = enforcer.checkTestExecutionIntegrity('task-123', true, proof);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('does not match');
    });

    it('should fail when not all tests executed', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const proof: ExecutionProof = {
        taskId: 'task-123',
        allTestsExecuted: false,
        timestamp: Date.now(),
      };

      const check = enforcer.checkTestExecutionIntegrity('task-123', true, proof);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('not all tests were executed');
    });

    it('should fail when proof missing timestamp', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const proof: ExecutionProof = {
        taskId: 'task-123',
        allTestsExecuted: true,
        timestamp: 0, // Missing/falsy timestamp
      };

      const check = enforcer.checkTestExecutionIntegrity('task-123', true, proof);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('missing timestamp');
    });

    it('should pass with valid execution proof', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const proof: ExecutionProof = {
        taskId: 'task-123',
        allTestsExecuted: true,
        timestamp: Date.now(),
        testResults: {
          total: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
        },
      };

      const check = enforcer.checkTestExecutionIntegrity('task-123', true, proof);

      expect(check.passed).toBe(true);
    });
  });

  describe('Invariant 2: Security Scan Requirement', () => {
    it('should pass when not affecting auth code', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkSecurityScanRequirement(
        'change-123',
        false, // not affecting auth code
        undefined
      );

      expect(check.passed).toBe(true);
    });

    it('should fail when affecting auth code without scan', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkSecurityScanRequirement(
        'change-123',
        true, // affecting auth code
        undefined // no scan
      );

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without security scan');
    });

    it('should fail when scan change_id does not match', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const scan: SecurityScan = {
        changeId: 'different-change',
        status: 'complete',
        criticalVulnerabilities: 0,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        timestamp: Date.now(),
      };

      const check = enforcer.checkSecurityScanRequirement('change-123', true, scan);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('does not match');
    });

    it('should fail when scan not complete', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const scan: SecurityScan = {
        changeId: 'change-123',
        status: 'running',
        criticalVulnerabilities: 0,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        timestamp: Date.now(),
      };

      const check = enforcer.checkSecurityScanRequirement('change-123', true, scan);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('not complete');
    });

    it('should fail when critical vulnerabilities found', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const scan: SecurityScan = {
        changeId: 'change-123',
        status: 'complete',
        criticalVulnerabilities: 2,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        timestamp: Date.now(),
      };

      const check = enforcer.checkSecurityScanRequirement('change-123', true, scan);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('critical vulnerabilities');
    });

    it('should pass with clean security scan', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const scan: SecurityScan = {
        changeId: 'change-123',
        status: 'complete',
        criticalVulnerabilities: 0,
        highVulnerabilities: 1, // Non-critical are allowed
        mediumVulnerabilities: 2,
        lowVulnerabilities: 5,
        timestamp: Date.now(),
      };

      const check = enforcer.checkSecurityScanRequirement('change-123', true, scan);

      expect(check.passed).toBe(true);
    });
  });

  describe('Invariant 3: Backup Before Delete', () => {
    it('should pass for non-protected targets', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const operation: DeleteOperation = {
        type: 'delete',
        target: '/tmp/some-file.txt',
        timestamp: Date.now(),
      };

      const check = enforcer.checkBackupBeforeDelete(operation, undefined);

      expect(check.passed).toBe(true);
    });

    it('should fail when deleting protected file without backup', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const operation: DeleteOperation = {
        type: 'delete',
        target: '.agentic-qe/memory.db',
        timestamp: Date.now(),
      };

      const check = enforcer.checkBackupBeforeDelete(operation, undefined);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without backup');
    });

    it('should fail when backup source does not match', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const operation: DeleteOperation = {
        type: 'delete',
        target: '.agentic-qe/memory.db',
        timestamp: Date.now(),
      };

      const backup: Backup = {
        source: 'different-file.db',
        destination: '/backup/different.db',
        timestamp: Date.now() - 1000,
        verified: true,
      };

      const check = enforcer.checkBackupBeforeDelete(operation, backup);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('does not match');
    });

    it('should fail when backup timestamp is after operation', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const now = Date.now();
      const operation: DeleteOperation = {
        type: 'delete',
        target: '.agentic-qe/memory.db',
        timestamp: now,
      };

      const backup: Backup = {
        source: '.agentic-qe/memory.db',
        destination: '/backup/memory.db',
        timestamp: now + 1000, // After operation
        verified: true,
      };

      const check = enforcer.checkBackupBeforeDelete(operation, backup);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('after operation');
    });

    it('should fail when backup is not verified', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const now = Date.now();
      const operation: DeleteOperation = {
        type: 'delete',
        target: '.agentic-qe/memory.db',
        timestamp: now,
      };

      const backup: Backup = {
        source: '.agentic-qe/memory.db',
        destination: '/backup/memory.db',
        timestamp: now - 1000,
        verified: false,
      };

      const check = enforcer.checkBackupBeforeDelete(operation, backup);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('not verified');
    });

    it('should pass with valid backup', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const now = Date.now();
      const operation: DeleteOperation = {
        type: 'delete',
        target: '.agentic-qe/memory.db',
        timestamp: now,
      };

      const backup: Backup = {
        source: '.agentic-qe/memory.db',
        destination: '/backup/memory.db',
        timestamp: now - 1000,
        verified: true,
        sizeBytes: 1024,
      };

      const check = enforcer.checkBackupBeforeDelete(operation, backup);

      expect(check.passed).toBe(true);
    });

    it('should detect coverage directory as protected', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const operation: DeleteOperation = {
        type: 'delete',
        target: 'coverage/lcov.info',
        timestamp: Date.now(),
      };

      const check = enforcer.checkBackupBeforeDelete(operation, undefined);

      expect(check.passed).toBe(false);
    });
  });

  describe('Invariant 4: Loop Detection', () => {
    it('should pass when under limits', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const stats: AgentStats = {
        agentId: 'agent-123',
        consecutiveIdenticalActions: 1,
        reworkRatio: 0.2,
        totalActions: 10,
        failedActions: 2,
      };

      const check = enforcer.checkLoopDetection('agent-123', stats);

      expect(check.passed).toBe(true);
    });

    it('should fail when exceeding consecutive retries', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const stats: AgentStats = {
        agentId: 'agent-123',
        consecutiveIdenticalActions: 5, // Exceeds default of 3
        reworkRatio: 0.2,
        totalActions: 10,
        failedActions: 2,
      };

      const check = enforcer.checkLoopDetection('agent-123', stats);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('consecutive retries');
    });

    it('should fail when rework ratio too high', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const stats: AgentStats = {
        agentId: 'agent-123',
        consecutiveIdenticalActions: 1,
        reworkRatio: 0.7, // Exceeds default of 0.5
        totalActions: 10,
        failedActions: 7,
      };

      const check = enforcer.checkLoopDetection('agent-123', stats);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('rework ratio');
    });

    it('should respect custom thresholds from governance flags', async () => {
      governanceFlags.updateFlags({
        continueGate: {
          ...DEFAULT_GOVERNANCE_FLAGS.continueGate,
          maxConsecutiveRetries: 5,
          reworkRatioThreshold: 0.8,
        },
      });

      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const stats: AgentStats = {
        agentId: 'agent-123',
        consecutiveIdenticalActions: 4, // Under new limit of 5
        reworkRatio: 0.7, // Under new limit of 0.8
        totalActions: 10,
        failedActions: 7,
      };

      const check = enforcer.checkLoopDetection('agent-123', stats);

      expect(check.passed).toBe(true);
    });
  });

  describe('Invariant 5: Budget Enforcement', () => {
    it('should pass when under budget', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkBudgetEnforcement(10.0, 100000);

      expect(check.passed).toBe(true);
    });

    it('should fail when exceeding cost limit', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkBudgetEnforcement(100.0, 100000); // Default is $50

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('cost');
      expect(check.violationDetails).toContain('exceeds limit');
    });

    it('should fail when exceeding token limit', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkBudgetEnforcement(10.0, 2000000); // Default is 1M

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('tokens');
      expect(check.violationDetails).toContain('exceeds limit');
    });

    it('should respect custom limits', async () => {
      governanceFlags.updateFlags({
        budgetMeter: {
          ...DEFAULT_GOVERNANCE_FLAGS.budgetMeter,
          maxSessionCostUsd: 200.0,
          maxTokensPerSession: 5000000,
        },
      });

      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkBudgetEnforcement(150.0, 4000000);

      expect(check.passed).toBe(true);
    });
  });

  describe('Invariant 6: Memory Consistency', () => {
    it('should pass when no existing patterns', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const pattern: MemoryPattern = {
        key: 'new-pattern',
        domain: 'test-generation',
        value: { strategy: 'tdd' },
        timestamp: Date.now(),
      };

      const check = enforcer.checkMemoryConsistency(pattern, []);

      expect(check.passed).toBe(true);
    });

    it('should pass when pattern is in different domain', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const existingPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-execution',
        value: { parallel: true },
        timestamp: Date.now() - 1000,
      };

      const newPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation', // Different domain
        value: { parallel: false },
        timestamp: Date.now(),
      };

      const check = enforcer.checkMemoryConsistency(newPattern, [existingPattern]);

      expect(check.passed).toBe(true);
    });

    it('should fail when contradicting existing pattern without supersession', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const existingPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'bdd' },
        timestamp: Date.now() - 1000,
      };

      const newPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'tdd' }, // Different value
        timestamp: Date.now(),
      };

      const check = enforcer.checkMemoryConsistency(newPattern, [existingPattern]);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('contradicts');
    });

    it('should pass when supersession marker provided', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const existingPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'bdd' },
        timestamp: Date.now() - 1000,
      };

      const newPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'tdd' },
        timestamp: Date.now(),
        supersessionMarker: 'strategy-update-2024', // Has supersession
      };

      const check = enforcer.checkMemoryConsistency(newPattern, [existingPattern]);

      expect(check.passed).toBe(true);
    });

    it('should pass when updating with same value', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const existingPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'tdd' },
        timestamp: Date.now() - 1000,
      };

      const newPattern: MemoryPattern = {
        key: 'test-pattern',
        domain: 'test-generation',
        value: { strategy: 'tdd' }, // Same value
        timestamp: Date.now(),
      };

      const check = enforcer.checkMemoryConsistency(newPattern, [existingPattern]);

      expect(check.passed).toBe(true);
    });
  });

  describe('Invariant 7: Verification Before Claim', () => {
    it('should fail when no verification provided', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkVerificationBeforeClaim('claim-123', undefined);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('without verification');
    });

    it('should fail when verification claim_id does not match', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'different-claim',
        method: 'test_execution',
        result: 'passed',
        timestamp: Date.now(),
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('does not match');
    });

    it('should fail when verification result is not passed', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'claim-123',
        method: 'test_execution',
        result: 'failed',
        timestamp: Date.now(),
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('not passed');
    });

    it('should fail when verification result is pending', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'claim-123',
        method: 'automated_check',
        result: 'pending',
        timestamp: Date.now(),
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(false);
    });

    it('should pass with valid verification (test_execution)', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'claim-123',
        method: 'test_execution',
        result: 'passed',
        timestamp: Date.now(),
        evidence: 'All 50 tests passed in 2.5s',
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(true);
    });

    it('should pass with valid verification (manual_review)', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'claim-123',
        method: 'manual_review',
        result: 'passed',
        timestamp: Date.now(),
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(true);
    });

    it('should pass with valid verification (automated_check)', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const verification: Verification = {
        claimId: 'claim-123',
        method: 'automated_check',
        result: 'passed',
        timestamp: Date.now(),
      };

      const check = enforcer.checkVerificationBeforeClaim('claim-123', verification);

      expect(check.passed).toBe(true);
    });
  });

  describe('Generic Invariant Checking', () => {
    it('should route to correct check method via checkInvariant', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkInvariant('budget-enforcement', {
        sessionCost: 100.0,
        sessionTokens: 100000,
      });

      expect(check.invariantId).toBe('budget-enforcement');
      expect(check.passed).toBe(false); // Over budget
    });

    it('should return failure for unknown invariant', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkInvariant('unknown-invariant', {});

      expect(check.passed).toBe(false);
      expect(check.violationDetails).toContain('Unknown invariant');
    });

    it('should skip disabled invariants', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.setInvariantEnabled('budget-enforcement', false);

      const check = enforcer.checkInvariant('budget-enforcement', {
        sessionCost: 100.0, // Over budget
        sessionTokens: 100000,
      });

      expect(check.passed).toBe(true); // Passes because disabled
    });

    it('should check all invariants', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const checks = enforcer.checkAllInvariants({
        // Provide context for various invariants
        taskId: 'task-123',
        claimsTestsPassed: false,
        sessionCost: 10.0,
        sessionTokens: 100000,
      });

      expect(checks.length).toBeGreaterThan(0);
      // Most should pass with benign context
      const failedChecks = checks.filter(c => !c.passed);
      expect(failedChecks.length).toBeLessThan(checks.length);
    });
  });

  describe('Enforcement Logic', () => {
    it('should not block passed checks', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check: InvariantCheck = {
        invariantId: 'test-execution-integrity',
        passed: true,
        context: {},
        timestamp: Date.now(),
      };

      const result = enforcer.enforceInvariant(check);

      expect(result.blocked).toBe(false);
      expect(result.escalated).toBe(false);
    });

    it('should block failed checks in strict mode', async () => {
      const enforcer = new ConstitutionalEnforcer({
        strictEnforcement: true,
        logAllChecks: false,
        escalateViolations: false,
      });
      await enforcer.initialize();

      const check: InvariantCheck = {
        invariantId: 'memory-consistency',
        passed: false,
        context: {},
        timestamp: Date.now(),
        violationDetails: 'Contradiction detected',
      };

      const result = enforcer.enforceInvariant(check);

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Contradiction');
    });

    it('should block critical invariants even in non-strict mode', async () => {
      const enforcer = new ConstitutionalEnforcer({
        strictEnforcement: false,
        logAllChecks: false,
        escalateViolations: false,
      });
      await enforcer.initialize();

      // test-execution-integrity is a critical invariant
      const check: InvariantCheck = {
        invariantId: 'test-execution-integrity',
        passed: false,
        context: {},
        timestamp: Date.now(),
        violationDetails: 'No execution proof',
      };

      const result = enforcer.enforceInvariant(check);

      expect(result.blocked).toBe(true);
    });

    it('should escalate violations when configured', async () => {
      const enforcer = new ConstitutionalEnforcer({
        escalateViolations: true,
        logAllChecks: false,
      });
      await enforcer.initialize();

      const escalationCallback = vi.fn();
      enforcer.onEscalation(escalationCallback);

      const check: InvariantCheck = {
        invariantId: 'loop-detection',
        passed: false,
        context: {},
        timestamp: Date.now(),
        violationDetails: 'Loop detected',
      };

      const result = enforcer.enforceInvariant(check);

      expect(result.escalated).toBe(true);
      expect(escalationCallback).toHaveBeenCalledWith(check);
    });

    it('should not escalate when disabled', async () => {
      const enforcer = new ConstitutionalEnforcer({
        escalateViolations: false,
        logAllChecks: false,
      });
      await enforcer.initialize();

      const escalationCallback = vi.fn();
      enforcer.onEscalation(escalationCallback);

      const check: InvariantCheck = {
        invariantId: 'loop-detection',
        passed: false,
        context: {},
        timestamp: Date.now(),
      };

      const result = enforcer.enforceInvariant(check);

      expect(result.escalated).toBe(false);
      expect(escalationCallback).not.toHaveBeenCalled();
    });

    it('should unsubscribe from escalation callbacks', async () => {
      const enforcer = new ConstitutionalEnforcer({
        escalateViolations: true,
        logAllChecks: false,
      });
      await enforcer.initialize();

      const callback = vi.fn();
      const unsubscribe = enforcer.onEscalation(callback);

      unsubscribe();

      const check: InvariantCheck = {
        invariantId: 'loop-detection',
        passed: false,
        context: {},
        timestamp: Date.now(),
      };

      enforcer.enforceInvariant(check);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Gate Integration', () => {
    it('should register gate integrations', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const mockCheck: InvariantCheck = {
        invariantId: 'test-gate',
        passed: true,
        context: {},
        timestamp: Date.now(),
      };

      enforcer.integrateWithGate('test-gate', () => mockCheck);

      const checks = enforcer.runGateChecks();
      expect(checks).toHaveLength(1);
      expect(checks[0]).toEqual(mockCheck);
    });

    it('should run multiple gate checks', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.integrateWithGate('gate-1', () => ({
        invariantId: 'gate-1',
        passed: true,
        context: {},
        timestamp: Date.now(),
      }));

      enforcer.integrateWithGate('gate-2', () => ({
        invariantId: 'gate-2',
        passed: false,
        context: {},
        timestamp: Date.now(),
      }));

      const checks = enforcer.runGateChecks();
      expect(checks).toHaveLength(2);
      expect(checks.filter(c => c.passed)).toHaveLength(1);
      expect(checks.filter(c => !c.passed)).toHaveLength(1);
    });

    it('should handle gate check errors gracefully', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.integrateWithGate('error-gate', () => {
        throw new Error('Gate error');
      });

      const checks = enforcer.runGateChecks();
      expect(checks).toHaveLength(0); // Error gate returns no check
    });
  });

  describe('Statistics Tracking', () => {
    it('should track check statistics', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      // Run some checks
      enforcer.checkBudgetEnforcement(10.0, 100000); // Pass
      enforcer.checkBudgetEnforcement(100.0, 100000); // Fail

      const stats = enforcer.getEnforcementStats();

      expect(stats.totalChecks).toBe(2);
      expect(stats.passedChecks).toBe(1);
      expect(stats.failedChecks).toBe(1);
      expect(stats.passRate).toBe(0.5);
    });

    it('should track per-invariant statistics', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.checkBudgetEnforcement(10.0, 100000); // Pass
      enforcer.checkBudgetEnforcement(10.0, 100000); // Pass
      enforcer.checkBudgetEnforcement(100.0, 100000); // Fail

      const stats = enforcer.getEnforcementStats();

      expect(stats.checksByInvariant['budget-enforcement'].passed).toBe(2);
      expect(stats.checksByInvariant['budget-enforcement'].failed).toBe(1);
    });

    it('should track blocked violations', async () => {
      const enforcer = new ConstitutionalEnforcer({
        strictEnforcement: true,
        logAllChecks: false,
        escalateViolations: false,
      });
      await enforcer.initialize();

      const failedCheck = enforcer.checkBudgetEnforcement(100.0, 100000);
      enforcer.enforceInvariant(failedCheck);

      const stats = enforcer.getEnforcementStats();
      expect(stats.blockedViolations).toBe(1);
    });

    it('should track escalations', async () => {
      const enforcer = new ConstitutionalEnforcer({
        escalateViolations: true,
        logAllChecks: false,
      });
      await enforcer.initialize();

      const failedCheck = enforcer.checkBudgetEnforcement(100.0, 100000);
      enforcer.enforceInvariant(failedCheck);

      const stats = enforcer.getEnforcementStats();
      expect(stats.escalations).toBe(1);
    });

    it('should reset statistics', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.checkBudgetEnforcement(10.0, 100000);
      enforcer.checkBudgetEnforcement(100.0, 100000);

      expect(enforcer.getEnforcementStats().totalChecks).toBe(2);

      enforcer.resetStats();

      const stats = enforcer.getEnforcementStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.passedChecks).toBe(0);
      expect(stats.failedChecks).toBe(0);
    });

    it('should track last check timestamp', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const before = Date.now();
      enforcer.checkBudgetEnforcement(10.0, 100000);
      const after = Date.now();

      const stats = enforcer.getEnforcementStats();
      expect(stats.lastCheckTimestamp).toBeGreaterThanOrEqual(before);
      expect(stats.lastCheckTimestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should respect enabled flag', async () => {
      const enforcer = new ConstitutionalEnforcer({
        enabled: false,
        logAllChecks: false,
      });
      await enforcer.initialize();

      expect(enforcer.getFlags().enabled).toBe(false);
    });

    it('should update flags at runtime', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      enforcer.updateFlags({ strictEnforcement: true });

      expect(enforcer.getFlags().strictEnforcement).toBe(true);
    });

    it('should use global strict mode', async () => {
      governanceFlags.enableStrictMode();

      const enforcer = new ConstitutionalEnforcer({
        strictEnforcement: false, // Local is false
        logAllChecks: false,
      });
      await enforcer.initialize();

      // Global strict mode should affect shouldBlock
      const check: InvariantCheck = {
        invariantId: 'loop-detection',
        passed: false,
        context: {},
        timestamp: Date.now(),
      };

      expect(enforcer.shouldBlock(check)).toBe(true); // Global takes precedence
    });

    it('should provide helper functions', () => {
      expect(typeof isConstitutionalEnforcementEnabled).toBe('function');
      expect(typeof isStrictEnforcementEnabled).toBe('function');
    });

    it('isConstitutionalEnforcerEnabled should check gate', () => {
      expect(isConstitutionalEnforcerEnabled()).toBe(true); // Enabled by default

      governanceFlags.disableAllGates();
      expect(isConstitutionalEnforcerEnabled()).toBe(false);
    });
  });

  describe('Reset and Cleanup', () => {
    it('should reset all state', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      // Do some operations
      enforcer.checkBudgetEnforcement(10.0, 100000);
      enforcer.integrateWithGate('test', () => ({
        invariantId: 'test',
        passed: true,
        context: {},
        timestamp: Date.now(),
      }));
      enforcer.onEscalation(() => {});

      // Reset
      enforcer.reset();

      expect(enforcer.isInitialized()).toBe(false);
      expect(enforcer.getInvariants()).toHaveLength(0);
      expect(enforcer.getEnforcementStats().totalChecks).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined context gracefully', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      // These should not throw
      const check1 = enforcer.checkTestExecutionIntegrity('task', false, undefined);
      const check2 = enforcer.checkSecurityScanRequirement('change', false, undefined);

      expect(check1.passed).toBe(true);
      expect(check2.passed).toBe(true);
    });

    it('should handle re-initialization', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });

      await enforcer.initialize();
      expect(enforcer.isInitialized()).toBe(true);

      await enforcer.initialize(); // Second call
      expect(enforcer.isInitialized()).toBe(true);
      expect(enforcer.getInvariants().length).toBe(7);
    });

    it('should include recommendations in failed checks', async () => {
      const enforcer = new ConstitutionalEnforcer({ logAllChecks: false });
      await enforcer.initialize();

      const check = enforcer.checkTestExecutionIntegrity('task', true, undefined);

      expect(check.passed).toBe(false);
      expect(check.recommendation).toBeDefined();
      expect(check.recommendation).toContain('ExecutionProof');
    });
  });
});
