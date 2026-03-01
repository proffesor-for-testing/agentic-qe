/**
 * Constitutional Enforcer for Agentic QE Fleet v3
 *
 * Parses and enforces the 7 invariants from the AQE Constitution.
 * Provides runtime invariant checking, violation blocking, and escalation.
 *
 * The 7 Constitution Invariants:
 * 1. Test Execution Integrity - claims require execution proof
 * 2. Security Scan Requirement - auth code requires security scan
 * 3. Backup Before Delete - destructive ops require backup
 * 4. Loop Detection - max consecutive retries, rework ratio
 * 5. Budget Enforcement - cost and token limits
 * 6. Memory Consistency - no contradictory patterns
 * 7. Verification Before Claim - all claims require verification
 *
 * @module governance/constitutional-enforcer
 * @see ADR-058-guidance-governance-integration.md
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  governanceFlags,
  isStrictMode,
  type GovernanceFeatureFlags,
} from './feature-flags.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Invariant definition parsed from constitution
 */
export interface Invariant {
  /** Unique invariant identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this invariant enforces */
  description: string;
  /** Formal condition from constitution (pseudo-code) */
  condition: string;
  /** How this invariant is enforced */
  enforcement: string;
  /** Whether this invariant is currently enabled */
  enabled: boolean;
}

/**
 * Result of checking an invariant
 */
export interface InvariantCheck {
  /** ID of the invariant checked */
  invariantId: string;
  /** Whether the check passed */
  passed: boolean;
  /** Context provided for the check */
  context: Record<string, unknown>;
  /** Timestamp of the check */
  timestamp: number;
  /** Details of any violation */
  violationDetails?: string;
  /** Recommendation for fixing violation */
  recommendation?: string;
}

/**
 * Result of enforcing an invariant
 */
export interface EnforcementResult {
  /** Whether the operation was blocked */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Whether this was escalated */
  escalated: boolean;
  /** Remediation action taken (if any) */
  remediation?: string;
}

/**
 * Enforcement statistics
 */
export interface EnforcementStats {
  /** Total checks performed */
  totalChecks: number;
  /** Number of checks that passed */
  passedChecks: number;
  /** Number of checks that failed */
  failedChecks: number;
  /** Number of violations blocked */
  blockedViolations: number;
  /** Number of escalations triggered */
  escalations: number;
  /** Check counts per invariant */
  checksByInvariant: Record<string, { passed: number; failed: number }>;
  /** Last check timestamp */
  lastCheckTimestamp: number | null;
  /** Pass rate (0-1) */
  passRate: number;
}

// ============================================================================
// Specific Check Context Types
// ============================================================================

/**
 * Execution proof for test integrity check
 */
export interface ExecutionProof {
  taskId: string;
  allTestsExecuted: boolean;
  timestamp: number;
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Security scan result
 */
export interface SecurityScan {
  changeId: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
  lowVulnerabilities: number;
  timestamp: number;
}

/**
 * Backup verification
 */
export interface Backup {
  source: string;
  destination: string;
  timestamp: number;
  verified: boolean;
  sizeBytes?: number;
}

/**
 * Delete operation context
 */
export interface DeleteOperation {
  type: 'delete';
  target: string;
  timestamp: number;
  reason?: string;
}

/**
 * Agent statistics for loop detection
 */
export interface AgentStats {
  agentId: string;
  consecutiveIdenticalActions: number;
  reworkRatio: number;
  totalActions: number;
  failedActions: number;
}

/**
 * Memory pattern for consistency check
 */
export interface MemoryPattern {
  key: string;
  domain: string;
  value: unknown;
  timestamp: number;
  tags?: string[];
  supersessionMarker?: string;
}

/**
 * Verification for claims
 */
export interface Verification {
  claimId: string;
  method: 'test_execution' | 'manual_review' | 'automated_check';
  result: 'passed' | 'failed' | 'pending';
  timestamp: number;
  evidence?: string;
}

// ============================================================================
// Feature Flags Extension
// ============================================================================

/**
 * Constitutional enforcer feature flags
 */
export interface ConstitutionalEnforcerFlags {
  enabled: boolean;
  strictEnforcement: boolean;
  escalateViolations: boolean;
  constitutionPath: string;
  logAllChecks: boolean;
}

/**
 * Default flags for constitutional enforcer
 */
export const DEFAULT_CONSTITUTIONAL_ENFORCER_FLAGS: ConstitutionalEnforcerFlags = {
  enabled: true,
  strictEnforcement: false,
  escalateViolations: true,
  constitutionPath: '.claude/guidance/constitution.md',
  logAllChecks: true,
};

// ============================================================================
// Main Implementation
// ============================================================================

/**
 * Constitutional Enforcer class
 *
 * Parses the AQE Constitution and enforces its 7 invariants at runtime.
 */
export class ConstitutionalEnforcer {
  private invariants: Map<string, Invariant> = new Map();
  private initialized = false;
  private constitutionLoaded = false;
  private flags: ConstitutionalEnforcerFlags;

  // Statistics
  private stats: EnforcementStats = {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    blockedViolations: 0,
    escalations: 0,
    checksByInvariant: {},
    lastCheckTimestamp: null,
    passRate: 1,
  };

  // Escalation callbacks
  private escalationCallbacks: Set<(check: InvariantCheck) => void> = new Set();

  // Gate integrations
  private gateIntegrations: Map<string, () => InvariantCheck> = new Map();

  /**
   * Create a new ConstitutionalEnforcer instance
   */
  constructor(flags?: Partial<ConstitutionalEnforcerFlags>) {
    this.flags = { ...DEFAULT_CONSTITUTIONAL_ENFORCER_FLAGS, ...flags };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the constitutional enforcer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load default invariants
    this.loadDefaultInvariants();

    // Try to load constitution from file
    try {
      await this.loadConstitution();
    } catch (error) {
      // Constitution file may not exist in all environments
      if (this.flags.logAllChecks) {
        console.warn('[ConstitutionalEnforcer] Could not load constitution file, using defaults');
      }
    }

    this.initialized = true;
  }

  /**
   * Check if the enforcer is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Constitution Loading
  // ============================================================================

  /**
   * Load default invariants (used when constitution file not available)
   */
  private loadDefaultInvariants(): void {
    const defaultInvariants: Invariant[] = [
      {
        id: 'test-execution-integrity',
        name: 'Test Execution Integrity',
        description: 'Claims of test success require execution proof',
        condition: 'IF task.claims_tests_passed THEN EXISTS execution_proof',
        enforcement: 'ContinueGate blocks claims without execution proof',
        enabled: true,
      },
      {
        id: 'security-scan-required',
        name: 'Security Scan Requirement',
        description: 'Auth/security code changes require security scan',
        condition: 'IF change.affects_auth_code THEN EXISTS security_scan WITH status=complete AND critical_vulnerabilities=0',
        enforcement: 'Quality gates block deployment without security scan',
        enabled: true,
      },
      {
        id: 'backup-before-delete',
        name: 'Backup Before Delete',
        description: 'Destructive operations require verified backup',
        condition: 'IF operation.type=delete AND target IN protected_files THEN EXISTS backup.verified=true',
        enforcement: 'MemoryWriteGate blocks destructive operations without backup',
        enabled: true,
      },
      {
        id: 'loop-detection',
        name: 'Loop Detection',
        description: 'Agents must not exceed retry or rework limits',
        condition: 'agent.consecutive_identical_actions < 3 AND agent.rework_ratio < 0.5',
        enforcement: 'ContinueGate throttles or blocks agents exceeding limits',
        enabled: true,
      },
      {
        id: 'budget-enforcement',
        name: 'Budget Enforcement',
        description: 'Sessions must not exceed budget limits',
        condition: 'session.total_cost <= budget_limit AND session.token_usage <= token_limit',
        enforcement: 'BudgetMeter blocks operations exceeding budget',
        enabled: true,
      },
      {
        id: 'memory-consistency',
        name: 'Memory Consistency',
        description: 'No contradictory patterns without supersession',
        condition: 'NOT EXISTS conflicting_pattern WHERE supersession_marker IS NULL',
        enforcement: 'MemoryWriteGate blocks contradictory patterns',
        enabled: true,
      },
      {
        id: 'verification-before-claim',
        name: 'Verification Before Claim',
        description: 'All success claims require verification proof',
        condition: 'FOR ALL claim IN success_claims: EXISTS verification.result=passed',
        enforcement: 'All success claims require proof of verification',
        enabled: true,
      },
    ];

    for (const invariant of defaultInvariants) {
      this.invariants.set(invariant.id, invariant);
      this.stats.checksByInvariant[invariant.id] = { passed: 0, failed: 0 };
    }
  }

  /**
   * Load constitution from file
   */
  async loadConstitution(customPath?: string): Promise<void> {
    const constitutionPath = customPath || this.flags.constitutionPath;

    // Resolve path relative to project root
    let fullPath = constitutionPath;
    if (!path.isAbsolute(constitutionPath)) {
      // Try to find the file from common locations
      const possiblePaths = [
        path.join(process.cwd(), constitutionPath),
        path.join(process.cwd(), '..', constitutionPath),
        path.join(process.cwd(), '../..', constitutionPath),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          fullPath = p;
          break;
        }
      }
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Constitution file not found: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    this.parseConstitution(content);
    this.constitutionLoaded = true;
  }

  /**
   * Parse constitution markdown content
   */
  private parseConstitution(content: string): void {
    // Parse each invariant section
    const invariantRegex = /### Invariant (\d+): ([^\n]+)\n+```\n([\s\S]*?)```\n+\*\*Enforcement\*\*: ([^\n]+)/g;

    let match;
    while ((match = invariantRegex.exec(content)) !== null) {
      const [, number, name, condition, enforcement] = match;
      const id = this.generateInvariantId(name);

      const existing = this.invariants.get(id);
      if (existing) {
        // Update with parsed values
        existing.condition = condition.trim();
        existing.enforcement = enforcement.trim();
      }
    }
  }

  /**
   * Generate invariant ID from name
   */
  private generateInvariantId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  // ============================================================================
  // Invariant Access
  // ============================================================================

  /**
   * Get all invariants
   */
  getInvariants(): Invariant[] {
    return Array.from(this.invariants.values());
  }

  /**
   * Get a specific invariant by ID
   */
  getInvariant(id: string): Invariant | null {
    return this.invariants.get(id) || null;
  }

  /**
   * Enable or disable an invariant
   */
  setInvariantEnabled(id: string, enabled: boolean): void {
    const invariant = this.invariants.get(id);
    if (invariant) {
      invariant.enabled = enabled;
    }
  }

  // ============================================================================
  // Generic Invariant Checking
  // ============================================================================

  /**
   * Check a specific invariant
   */
  checkInvariant(invariantId: string, context: Record<string, unknown>): InvariantCheck {
    const invariant = this.invariants.get(invariantId);

    if (!invariant) {
      return this.createCheck(invariantId, false, context, `Unknown invariant: ${invariantId}`);
    }

    if (!invariant.enabled) {
      return this.createCheck(invariantId, true, context);
    }

    // Route to specific check method
    switch (invariantId) {
      case 'test-execution-integrity':
        return this.checkTestExecutionIntegrity(
          context.taskId as string,
          context.claimsTestsPassed as boolean,
          context.executionProof as ExecutionProof | undefined
        );

      case 'security-scan-required':
        return this.checkSecurityScanRequirement(
          context.changeId as string,
          context.affectsAuthCode as boolean,
          context.securityScan as SecurityScan | undefined
        );

      case 'backup-before-delete':
        return this.checkBackupBeforeDelete(
          context.operation as DeleteOperation,
          context.backup as Backup | undefined
        );

      case 'loop-detection':
        return this.checkLoopDetection(
          context.agentId as string,
          context.stats as AgentStats
        );

      case 'budget-enforcement':
        return this.checkBudgetEnforcement(
          context.sessionCost as number,
          context.sessionTokens as number
        );

      case 'memory-consistency':
        return this.checkMemoryConsistency(
          context.pattern as MemoryPattern,
          context.existingPatterns as MemoryPattern[]
        );

      case 'verification-before-claim':
        return this.checkVerificationBeforeClaim(
          context.claimId as string,
          context.verification as Verification | undefined
        );

      default:
        return this.createCheck(invariantId, true, context);
    }
  }

  /**
   * Check all invariants against a context
   */
  checkAllInvariants(context: Record<string, unknown>): InvariantCheck[] {
    const checks: InvariantCheck[] = [];

    for (const invariant of this.invariants.values()) {
      if (invariant.enabled) {
        const check = this.checkInvariant(invariant.id, context);
        checks.push(check);
      }
    }

    return checks;
  }

  // ============================================================================
  // Specific Invariant Checks
  // ============================================================================

  /**
   * Invariant 1: Test Execution Integrity
   * Claims of test success require execution proof
   */
  checkTestExecutionIntegrity(
    taskId: string,
    claimsTestsPassed: boolean,
    executionProof?: ExecutionProof
  ): InvariantCheck {
    const context = { taskId, claimsTestsPassed, hasProof: !!executionProof };

    // If not claiming tests passed, invariant is satisfied
    if (!claimsTestsPassed) {
      return this.createCheck('test-execution-integrity', true, context);
    }

    // Must have execution proof
    if (!executionProof) {
      return this.createCheck(
        'test-execution-integrity',
        false,
        context,
        'Test success claimed without execution proof',
        'Provide ExecutionProof with task_id matching the claim and all_tests_executed=true'
      );
    }

    // Proof must match task
    if (executionProof.taskId !== taskId) {
      return this.createCheck(
        'test-execution-integrity',
        false,
        context,
        `Execution proof task_id (${executionProof.taskId}) does not match claim task_id (${taskId})`,
        'Ensure execution proof is for the correct task'
      );
    }

    // All tests must have been executed
    if (!executionProof.allTestsExecuted) {
      return this.createCheck(
        'test-execution-integrity',
        false,
        context,
        'Execution proof indicates not all tests were executed',
        'Execute all tests before claiming success'
      );
    }

    // Timestamp must be present
    if (!executionProof.timestamp) {
      return this.createCheck(
        'test-execution-integrity',
        false,
        context,
        'Execution proof missing timestamp',
        'Include timestamp in execution proof'
      );
    }

    return this.createCheck('test-execution-integrity', true, context);
  }

  /**
   * Invariant 2: Security Scan Requirement
   * Auth/security code changes require security scan
   */
  checkSecurityScanRequirement(
    changeId: string,
    affectsAuthCode: boolean,
    securityScan?: SecurityScan
  ): InvariantCheck {
    const context = { changeId, affectsAuthCode, hasScan: !!securityScan };

    // If not affecting auth code, invariant is satisfied
    if (!affectsAuthCode) {
      return this.createCheck('security-scan-required', true, context);
    }

    // Must have security scan
    if (!securityScan) {
      return this.createCheck(
        'security-scan-required',
        false,
        context,
        'Auth/security code change without security scan',
        'Run security scan before deploying auth-related changes'
      );
    }

    // Scan must match change
    if (securityScan.changeId !== changeId) {
      return this.createCheck(
        'security-scan-required',
        false,
        context,
        `Security scan change_id (${securityScan.changeId}) does not match (${changeId})`,
        'Ensure security scan is for the correct change'
      );
    }

    // Scan must be complete
    if (securityScan.status !== 'complete') {
      return this.createCheck(
        'security-scan-required',
        false,
        context,
        `Security scan status is ${securityScan.status}, not complete`,
        'Wait for security scan to complete'
      );
    }

    // No critical vulnerabilities
    if (securityScan.criticalVulnerabilities > 0) {
      return this.createCheck(
        'security-scan-required',
        false,
        context,
        `Security scan found ${securityScan.criticalVulnerabilities} critical vulnerabilities`,
        'Fix all critical vulnerabilities before deploying'
      );
    }

    return this.createCheck('security-scan-required', true, context);
  }

  /**
   * Invariant 3: Backup Before Delete
   * Destructive operations require verified backup
   */
  checkBackupBeforeDelete(
    operation: DeleteOperation,
    backup?: Backup
  ): InvariantCheck {
    const context = { operation, hasBackup: !!backup };

    // Handle undefined operation gracefully
    if (!operation || !operation.target) {
      return this.createCheck('backup-before-delete', true, context);
    }

    // Check if target is protected
    const protectedPatterns = ['memory.db', 'coverage/', '.db'];
    const isProtected = protectedPatterns.some(pattern =>
      operation.target.includes(pattern)
    );

    if (!isProtected) {
      return this.createCheck('backup-before-delete', true, context);
    }

    // Must have backup
    if (!backup) {
      return this.createCheck(
        'backup-before-delete',
        false,
        context,
        `Delete operation on protected target (${operation.target}) without backup`,
        'Create and verify backup before deleting protected files'
      );
    }

    // Backup must be for the correct target
    if (backup.source !== operation.target) {
      return this.createCheck(
        'backup-before-delete',
        false,
        context,
        `Backup source (${backup.source}) does not match delete target (${operation.target})`,
        'Create backup for the correct target'
      );
    }

    // Backup must be before the operation
    if (backup.timestamp >= operation.timestamp) {
      return this.createCheck(
        'backup-before-delete',
        false,
        context,
        'Backup timestamp is after operation timestamp',
        'Create backup before starting delete operation'
      );
    }

    // Backup must be verified
    if (!backup.verified) {
      return this.createCheck(
        'backup-before-delete',
        false,
        context,
        'Backup is not verified',
        'Verify backup integrity before proceeding'
      );
    }

    return this.createCheck('backup-before-delete', true, context);
  }

  /**
   * Invariant 4: Loop Detection
   * Agents must not exceed retry or rework limits
   */
  checkLoopDetection(agentId: string, stats: AgentStats): InvariantCheck {
    const context = { agentId, stats };

    // Handle undefined stats gracefully
    if (!stats) {
      return this.createCheck('loop-detection', true, context);
    }

    const maxConsecutive = governanceFlags.getFlags().continueGate.maxConsecutiveRetries;
    const maxReworkRatio = governanceFlags.getFlags().continueGate.reworkRatioThreshold;

    // Check consecutive identical actions
    if (stats.consecutiveIdenticalActions >= maxConsecutive) {
      return this.createCheck(
        'loop-detection',
        false,
        context,
        `Agent ${agentId} exceeded max consecutive retries (${stats.consecutiveIdenticalActions}/${maxConsecutive})`,
        'Break the loop by trying a different approach or escalating'
      );
    }

    // Check rework ratio
    if (stats.reworkRatio > maxReworkRatio) {
      return this.createCheck(
        'loop-detection',
        false,
        context,
        `Agent ${agentId} rework ratio too high (${(stats.reworkRatio * 100).toFixed(1)}% > ${maxReworkRatio * 100}%)`,
        'Review agent strategy or reassign task'
      );
    }

    return this.createCheck('loop-detection', true, context);
  }

  /**
   * Invariant 5: Budget Enforcement
   * Sessions must not exceed budget limits
   */
  checkBudgetEnforcement(sessionCost: number, sessionTokens: number): InvariantCheck {
    const context = { sessionCost, sessionTokens };
    const budgetFlags = governanceFlags.getFlags().budgetMeter;

    // Check cost limit
    if (sessionCost > budgetFlags.maxSessionCostUsd) {
      return this.createCheck(
        'budget-enforcement',
        false,
        context,
        `Session cost ($${sessionCost.toFixed(2)}) exceeds limit ($${budgetFlags.maxSessionCostUsd})`,
        'Stop current operations or request budget increase'
      );
    }

    // Check token limit
    if (sessionTokens > budgetFlags.maxTokensPerSession) {
      return this.createCheck(
        'budget-enforcement',
        false,
        context,
        `Session tokens (${sessionTokens}) exceeds limit (${budgetFlags.maxTokensPerSession})`,
        'Optimize token usage or request limit increase'
      );
    }

    return this.createCheck('budget-enforcement', true, context);
  }

  /**
   * Invariant 6: Memory Consistency
   * No contradictory patterns without supersession
   */
  checkMemoryConsistency(
    pattern: MemoryPattern,
    existingPatterns: MemoryPattern[]
  ): InvariantCheck {
    const context = { patternKey: pattern?.key, domain: pattern?.domain };

    // Handle undefined pattern or existing patterns gracefully
    if (!pattern || !existingPatterns) {
      return this.createCheck('memory-consistency', true, context);
    }

    // Find patterns in the same domain
    const samedomainPatterns = existingPatterns.filter(p => p.domain === pattern.domain);

    for (const existing of samedomainPatterns) {
      // Simple contradiction check: same key, different value
      if (existing.key === pattern.key) {
        // Check for supersession marker
        if (!pattern.supersessionMarker) {
          // Check if values are different (simple deep comparison)
          if (JSON.stringify(existing.value) !== JSON.stringify(pattern.value)) {
            return this.createCheck(
              'memory-consistency',
              false,
              { ...context, conflictingPattern: existing.key },
              `Pattern ${pattern.key} contradicts existing pattern without supersession marker`,
              'Add supersession marker to explicitly replace the old pattern'
            );
          }
        }
      }
    }

    return this.createCheck('memory-consistency', true, context);
  }

  /**
   * Invariant 7: Verification Before Claim
   * All success claims require verification proof
   */
  checkVerificationBeforeClaim(
    claimId: string,
    verification?: Verification
  ): InvariantCheck {
    const context = { claimId, hasVerification: !!verification };

    // Must have verification
    if (!verification) {
      return this.createCheck(
        'verification-before-claim',
        false,
        context,
        `Success claim ${claimId} made without verification`,
        'Provide verification through test_execution, manual_review, or automated_check'
      );
    }

    // Verification must match claim
    if (verification.claimId !== claimId) {
      return this.createCheck(
        'verification-before-claim',
        false,
        context,
        `Verification claim_id (${verification.claimId}) does not match (${claimId})`,
        'Ensure verification is for the correct claim'
      );
    }

    // Method must be valid
    const validMethods = ['test_execution', 'manual_review', 'automated_check'];
    if (!validMethods.includes(verification.method)) {
      return this.createCheck(
        'verification-before-claim',
        false,
        context,
        `Invalid verification method: ${verification.method}`,
        'Use one of: test_execution, manual_review, automated_check'
      );
    }

    // Result must be passed
    if (verification.result !== 'passed') {
      return this.createCheck(
        'verification-before-claim',
        false,
        context,
        `Verification result is ${verification.result}, not passed`,
        'Cannot claim success with pending or failed verification'
      );
    }

    return this.createCheck('verification-before-claim', true, context);
  }

  // ============================================================================
  // Enforcement
  // ============================================================================

  /**
   * Enforce an invariant check result
   */
  enforceInvariant(check: InvariantCheck): EnforcementResult {
    const result: EnforcementResult = {
      blocked: false,
      escalated: false,
    };

    // If check passed, no enforcement needed
    if (check.passed) {
      return result;
    }

    // Determine if we should block
    const shouldBlock = this.shouldBlock(check);

    if (shouldBlock) {
      result.blocked = true;
      result.reason = check.violationDetails;
      this.stats.blockedViolations++;

      if (this.flags.logAllChecks) {
        console.warn(`[ConstitutionalEnforcer] BLOCKED: ${check.invariantId}`, {
          violation: check.violationDetails,
          context: check.context,
        });
      }
    }

    // Escalate if configured
    if (this.flags.escalateViolations) {
      this.escalateViolation(check);
      result.escalated = true;
      this.stats.escalations++;
    }

    return result;
  }

  /**
   * Determine if a check should block the operation
   */
  shouldBlock(check: InvariantCheck): boolean {
    // Always block if check failed and we're in strict mode
    if (!check.passed && (this.flags.strictEnforcement || isStrictMode())) {
      return true;
    }

    // Block certain invariants even in non-strict mode
    const alwaysBlockInvariants = [
      'test-execution-integrity',
      'security-scan-required',
      'budget-enforcement',
    ];

    if (!check.passed && alwaysBlockInvariants.includes(check.invariantId)) {
      return true;
    }

    return false;
  }

  /**
   * Escalate a violation to Queen Coordinator
   */
  escalateViolation(check: InvariantCheck): void {
    if (!check.passed) {
      if (this.flags.logAllChecks) {
        console.warn(`[ConstitutionalEnforcer] ESCALATION: ${check.invariantId}`, {
          violation: check.violationDetails,
          recommendation: check.recommendation,
        });
      }

      // Notify all registered callbacks
      this.escalationCallbacks.forEach(cb => {
        try {
          cb(check);
        } catch (error) {
          console.error('[ConstitutionalEnforcer] Escalation callback error:', error);
        }
      });
    }
  }

  /**
   * Register escalation callback
   */
  onEscalation(callback: (check: InvariantCheck) => void): () => void {
    this.escalationCallbacks.add(callback);
    return () => this.escalationCallbacks.delete(callback);
  }

  // ============================================================================
  // Gate Integration
  // ============================================================================

  /**
   * Integrate with a governance gate
   */
  integrateWithGate(gateName: string, checkFn: () => InvariantCheck): void {
    this.gateIntegrations.set(gateName, checkFn);
  }

  /**
   * Run all gate integrations
   */
  runGateChecks(): InvariantCheck[] {
    const checks: InvariantCheck[] = [];

    for (const [gateName, checkFn] of this.gateIntegrations) {
      try {
        const check = checkFn();
        checks.push(check);
      } catch (error) {
        console.error(`[ConstitutionalEnforcer] Gate check error for ${gateName}:`, error);
      }
    }

    return checks;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get enforcement statistics
   */
  getEnforcementStats(): EnforcementStats {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0
        ? this.stats.passedChecks / this.stats.totalChecks
        : 1,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      blockedViolations: 0,
      escalations: 0,
      checksByInvariant: {},
      lastCheckTimestamp: null,
      passRate: 1,
    };

    // Reinitialize per-invariant stats
    for (const id of this.invariants.keys()) {
      this.stats.checksByInvariant[id] = { passed: 0, failed: 0 };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create an invariant check result
   */
  private createCheck(
    invariantId: string,
    passed: boolean,
    context: Record<string, unknown>,
    violationDetails?: string,
    recommendation?: string
  ): InvariantCheck {
    const check: InvariantCheck = {
      invariantId,
      passed,
      context,
      timestamp: Date.now(),
      violationDetails,
      recommendation,
    };

    // Update statistics
    this.stats.totalChecks++;
    this.stats.lastCheckTimestamp = check.timestamp;

    if (passed) {
      this.stats.passedChecks++;
    } else {
      this.stats.failedChecks++;
    }

    // Per-invariant stats
    if (!this.stats.checksByInvariant[invariantId]) {
      this.stats.checksByInvariant[invariantId] = { passed: 0, failed: 0 };
    }
    if (passed) {
      this.stats.checksByInvariant[invariantId].passed++;
    } else {
      this.stats.checksByInvariant[invariantId].failed++;
    }

    // Log if configured
    if (this.flags.logAllChecks && !passed) {
      console.warn(`[ConstitutionalEnforcer] Check failed: ${invariantId}`, {
        violationDetails,
        recommendation,
      });
    }

    return check;
  }

  /**
   * Get current feature flags
   */
  getFlags(): ConstitutionalEnforcerFlags {
    return { ...this.flags };
  }

  /**
   * Update feature flags
   */
  updateFlags(updates: Partial<ConstitutionalEnforcerFlags>): void {
    this.flags = { ...this.flags, ...updates };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.invariants.clear();
    this.gateIntegrations.clear();
    this.escalationCallbacks.clear();
    this.initialized = false;
    this.constitutionLoaded = false;
    this.resetStats();
  }
}

// ============================================================================
// Singleton and Factory
// ============================================================================

/**
 * Singleton instance
 */
export const constitutionalEnforcer = new ConstitutionalEnforcer();

/**
 * Factory function for creating new instances
 */
export function createConstitutionalEnforcer(
  flags?: Partial<ConstitutionalEnforcerFlags>
): ConstitutionalEnforcer {
  return new ConstitutionalEnforcer(flags);
}

/**
 * Helper to check if constitutional enforcement is enabled
 */
export function isConstitutionalEnforcementEnabled(): boolean {
  return constitutionalEnforcer.getFlags().enabled;
}

/**
 * Helper to check if strict enforcement is active
 */
export function isStrictEnforcementEnabled(): boolean {
  return constitutionalEnforcer.getFlags().strictEnforcement || isStrictMode();
}
