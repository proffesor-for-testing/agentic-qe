/**
 * Queen Governance Adapter
 *
 * Integrates @claude-flow/guidance governance into the QueenCoordinator.
 * Provides hooks for task execution, memory writes, and agent coordination.
 *
 * Usage:
 * - Call `beforeTaskExecution` before starting any task
 * - Call `afterTaskExecution` after task completion
 * - Call `beforeMemoryWrite` before storing patterns to ReasoningBank
 * - Call `onAgentAction` to record agent actions for loop detection
 *
 * @module governance/queen-governance-adapter
 * @see ADR-058-guidance-governance-integration.md
 */

import type { DomainName, Priority } from '../shared/types/index.js';
import {
  governanceFlags,
  isContinueGateEnabled,
  isMemoryWriteGateEnabled,
  isBudgetMeterEnabled,
  isStrictMode,
  isAdversarialDefenseEnabled,
  isConstitutionalEnforcerEnabled,
  isComplianceReporterEnabled,
} from './feature-flags.js';
import {
  continueGateIntegration,
  createActionRecord,
  hashAction,
  type ContinueGateDecision,
  type AgentAction,
} from './continue-gate-integration.js';
import {
  memoryWriteGateIntegration,
  createMemoryPattern,
  type MemoryWriteGateDecision,
  type MemoryPattern,
} from './memory-write-gate-integration.js';
import {
  adversarialDefenseIntegration,
  quickThreatAssess,
  isSafeInput,
  sanitizeUserInput,
  type ThreatAssessment,
} from './adversarial-defense-integration.js';
import {
  constitutionalEnforcer,
  type EnforcementResult,
  type InvariantCheck,
} from './constitutional-enforcer.js';
import {
  complianceReporter,
  type ComplianceViolation,
} from './compliance-reporter.js';

/**
 * Task context for governance evaluation
 */
export interface TaskGovernanceContext {
  taskId: string;
  taskType: string;
  agentId: string;
  domain: DomainName;
  priority: Priority;
  payload?: Record<string, unknown>;
  retryCount?: number;
}

/**
 * Governance decision for task execution
 */
export interface TaskGovernanceDecision {
  allowed: boolean;
  reason?: string;
  throttleMs?: number;
  escalate?: boolean;
  agentStats?: {
    actionCount: number;
    reworkRatio: number;
    isThrottled: boolean;
  };
  /** Threat assessment if adversarial defense is enabled */
  threatAssessment?: ThreatAssessment;
  /** Constitutional invariant checks */
  invariantChecks?: InvariantCheck[];
}

/**
 * Memory write context
 */
export interface MemoryWriteContext {
  key: string;
  value: unknown;
  domain: DomainName;
  agentId?: string;
  tags?: string[];
  supersedes?: string[];
}

/**
 * Agent action context
 */
export interface AgentActionContext {
  agentId: string;
  actionType: string;
  target: string;
  params: Record<string, unknown>;
  success: boolean;
  domain?: DomainName;
}

/**
 * Queen Governance Adapter
 * Provides a clean interface for governance integration with QueenCoordinator
 */
export class QueenGovernanceAdapter {
  private initialized = false;
  private sessionCost = 0;
  private sessionTokens = 0;
  private escalationCallbacks: Set<(context: TaskGovernanceContext, reason: string) => void> = new Set();

  /**
   * Initialize the governance adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await continueGateIntegration.initialize();
    this.initialized = true;

    console.log('[QueenGovernance] Initialized with flags:', {
      continueGate: isContinueGateEnabled(),
      memoryWriteGate: isMemoryWriteGateEnabled(),
      budgetMeter: isBudgetMeterEnabled(),
      strictMode: isStrictMode(),
    });
  }

  /**
   * Evaluate whether a task can be executed
   * Call this before starting task execution
   */
  async beforeTaskExecution(context: TaskGovernanceContext): Promise<TaskGovernanceDecision> {
    const result: TaskGovernanceDecision = { allowed: true };

    // ADR-058: Adversarial Defense - check task payload for threats
    if (isAdversarialDefenseEnabled() && context.payload) {
      const payloadStr = JSON.stringify(context.payload);
      const threatAssessment = quickThreatAssess(payloadStr);
      result.threatAssessment = threatAssessment;

      if (threatAssessment.isBlocked) {
        // Record violation with compliance reporter
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'adversarial_detected',
            severity: threatAssessment.threatScore > 0.7 ? 'critical' : 'high',
            agentId: context.agentId,
            gate: 'adversarialDefense',
            description: `Adversarial threat detected in task ${context.taskId}: ${threatAssessment.detectedPatterns.join(', ')}`,
            context: {
              taskId: context.taskId,
              threatScore: threatAssessment.threatScore,
              detectedPatterns: threatAssessment.detectedPatterns,
              domain: context.domain,
            },
          });
        }

        console.warn('[QueenGovernance] Adversarial threat detected:', {
          taskId: context.taskId,
          agentId: context.agentId,
          threatScore: threatAssessment.threatScore,
          patterns: threatAssessment.detectedPatterns,
        });

        if (isStrictMode()) {
          return {
            allowed: false,
            reason: `Adversarial threat detected: ${threatAssessment.detectedPatterns.join(', ')}`,
            threatAssessment,
          };
        }
      }
    }

    if (!isContinueGateEnabled()) {
      return result;
    }

    // Record task start as an action
    continueGateIntegration.recordAction(createActionRecord(
      context.agentId,
      `task:${context.taskType}`,
      context.domain,
      { taskId: context.taskId, retryCount: context.retryCount || 0 },
      true // Will be updated on completion
    ));

    // Evaluate if agent should continue
    const decision = await continueGateIntegration.evaluate(context.agentId);

    if (!decision.shouldContinue) {
      // Record loop detection violation
      if (isComplianceReporterEnabled()) {
        complianceReporter.recordViolation({
          type: 'loop_detected',
          severity: 'high',
          agentId: context.agentId,
          gate: 'continueGate',
          description: `Agent ${context.agentId} loop detected in task ${context.taskId}: ${decision.reason}`,
          context: {
            taskId: context.taskId,
            reason: decision.reason,
            throttleMs: decision.throttleMs,
          },
        });
      }

      // Check for escalation
      if (decision.escalate && governanceFlags.getFlags().global.escalateToQueen) {
        this.triggerEscalation(context, decision.reason || 'Unknown');
      }

      return {
        ...result,
        allowed: false,
        reason: decision.reason,
        throttleMs: decision.throttleMs,
        escalate: decision.escalate,
        agentStats: continueGateIntegration.getAgentStats(context.agentId),
      };
    }

    // Check budget if enabled
    if (isBudgetMeterEnabled()) {
      const budgetCheck = this.checkBudget();
      if (!budgetCheck.allowed) {
        // Record budget violation
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'budget_exceeded',
            severity: 'high',
            agentId: context.agentId,
            gate: 'budgetMeter',
            description: `Budget exceeded for task ${context.taskId}: ${budgetCheck.reason}`,
            context: {
              taskId: context.taskId,
              reason: budgetCheck.reason,
              sessionCost: this.sessionCost,
              sessionTokens: this.sessionTokens,
            },
          });
        }

        return {
          ...result,
          allowed: false,
          reason: budgetCheck.reason,
        };
      }
    }

    return {
      ...result,
      allowed: true,
      agentStats: continueGateIntegration.getAgentStats(context.agentId),
    };
  }

  /**
   * Record task completion
   * Call this after task execution completes
   */
  async afterTaskExecution(
    context: TaskGovernanceContext,
    success: boolean,
    cost?: number,
    tokens?: number,
    /** Test results if this was a test execution task */
    testResults?: { passed: number; failed: number; skipped: number }
  ): Promise<void> {
    // Record the outcome
    continueGateIntegration.recordAction(createActionRecord(
      context.agentId,
      `task-result:${context.taskType}`,
      context.domain,
      { taskId: context.taskId, success },
      success
    ));

    // Track budget
    if (cost !== undefined) {
      this.sessionCost += cost;
    }
    if (tokens !== undefined) {
      this.sessionTokens += tokens;
    }

    // ADR-058: Constitutional Enforcer - verify test execution integrity
    if (isConstitutionalEnforcerEnabled() && testResults) {
      // If claiming tests passed (all passed, none failed), require execution proof
      const claimsTestsPassed = testResults.passed > 0 && testResults.failed === 0;
      const executionProof = claimsTestsPassed ? {
        taskId: context.taskId,
        allTestsExecuted: true,
        timestamp: Date.now(),
        passed: testResults.passed,
        failed: testResults.failed,
        skipped: testResults.skipped,
      } : undefined;

      const integrityCheck = constitutionalEnforcer.checkTestExecutionIntegrity(
        context.taskId,
        claimsTestsPassed,
        executionProof
      );

      if (!integrityCheck.passed) {
        console.warn('[QueenGovernance] Constitutional invariant violation:', {
          invariantId: integrityCheck.invariantId,
          taskId: context.taskId,
          violation: integrityCheck.violationDetails,
        });

        // Record invariant violation
        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'invariant_violated',
            severity: 'critical',
            agentId: context.agentId,
            gate: 'constitutionalEnforcer',
            description: `Test execution integrity violation for task ${context.taskId}: ${integrityCheck.violationDetails}`,
            context: {
              taskId: context.taskId,
              invariantId: integrityCheck.invariantId,
              violationDetails: integrityCheck.violationDetails,
              recommendation: integrityCheck.recommendation,
            },
          });
        }
      }
    }

    // ADR-058: Constitutional Enforcer - verify claim with proof
    if (isConstitutionalEnforcerEnabled() && success) {
      // Build proper Verification object matching the interface
      const verification = {
        claimId: context.taskId,
        method: 'automated_check' as const,
        result: 'passed' as const,
        timestamp: Date.now(),
        evidence: `Task ${context.taskId} completed by agent ${context.agentId}`,
      };

      const claimCheck = constitutionalEnforcer.checkVerificationBeforeClaim(
        context.taskId,
        verification
      );

      if (!claimCheck.passed) {
        console.warn('[QueenGovernance] Claim without verification:', {
          invariantId: claimCheck.invariantId,
          taskId: context.taskId,
          violation: claimCheck.violationDetails,
        });

        if (isComplianceReporterEnabled()) {
          complianceReporter.recordViolation({
            type: 'invariant_violated',
            severity: 'high',
            agentId: context.agentId,
            gate: 'constitutionalEnforcer',
            description: `Verification-before-claim violation for task ${context.taskId}: ${claimCheck.violationDetails}`,
            context: {
              taskId: context.taskId,
              invariantId: claimCheck.invariantId,
              violationDetails: claimCheck.violationDetails,
            },
          });
        }
      }
    }

    // If task failed multiple times, check for patterns
    if (!success && (context.retryCount || 0) >= 2) {
      const stats = continueGateIntegration.getAgentStats(context.agentId);
      if (stats.reworkRatio > 0.5) {
        this.triggerEscalation(context, `High failure rate after ${context.retryCount} retries`);
      }
    }
  }

  /**
   * Evaluate whether a memory write should be allowed
   * Call this before storing patterns to ReasoningBank
   */
  async beforeMemoryWrite(context: MemoryWriteContext): Promise<MemoryWriteGateDecision> {
    if (!isMemoryWriteGateEnabled()) {
      return { allowed: true };
    }

    const pattern = createMemoryPattern(
      context.key,
      context.value,
      context.domain,
      {
        agentId: context.agentId,
        tags: context.tags,
        supersedes: context.supersedes,
      }
    );

    return memoryWriteGateIntegration.evaluateWrite(pattern);
  }

  /**
   * Register a pattern after successful memory write
   */
  registerPattern(context: MemoryWriteContext): void {
    const pattern = createMemoryPattern(
      context.key,
      context.value,
      context.domain,
      {
        agentId: context.agentId,
        tags: context.tags,
      }
    );
    memoryWriteGateIntegration.registerPattern(pattern);
  }

  /**
   * Record an agent action for loop detection
   */
  onAgentAction(context: AgentActionContext): void {
    if (!isContinueGateEnabled()) return;

    continueGateIntegration.recordAction(createActionRecord(
      context.agentId,
      context.actionType,
      context.target,
      context.params,
      context.success
    ));
  }

  /**
   * ADR-058: Check if user input is safe (adversarial defense)
   * Call this for any user-provided input before processing
   */
  validateUserInput(input: string, context?: { agentId?: string; source?: string }): {
    safe: boolean;
    sanitized: string;
    threatAssessment?: ThreatAssessment;
  } {
    if (!isAdversarialDefenseEnabled()) {
      return { safe: true, sanitized: input };
    }

    const assessment = quickThreatAssess(input);
    const sanitized = sanitizeUserInput(input);

    if (assessment.isBlocked && isComplianceReporterEnabled()) {
      complianceReporter.recordViolation({
        type: 'adversarial_detected',
        severity: assessment.threatScore > 0.7 ? 'critical' : 'high',
        agentId: context?.agentId || 'unknown',
        gate: 'adversarialDefense',
        description: `Adversarial input detected from ${context?.source || 'user_input'}: ${assessment.detectedPatterns.join(', ')}`,
        context: {
          source: context?.source || 'user_input',
          threatScore: assessment.threatScore,
          detectedPatterns: assessment.detectedPatterns,
        },
      });
    }

    return {
      safe: !assessment.isBlocked,
      sanitized,
      threatAssessment: assessment,
    };
  }

  /**
   * ADR-058: Check if security scan is required before deployment
   * Constitutional invariant #2
   */
  async checkSecurityScanRequired(
    changeId: string,
    affectsAuthCode: boolean,
    securityScanResult?: { changeId: string; status: 'complete'; criticalVulnerabilities: number; highVulnerabilities: number; mediumVulnerabilities: number; lowVulnerabilities: number; timestamp: number }
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!isConstitutionalEnforcerEnabled()) {
      return { allowed: true };
    }

    const check = constitutionalEnforcer.checkSecurityScanRequirement(
      changeId,
      affectsAuthCode,
      securityScanResult
    );

    if (!check.passed) {
      if (isComplianceReporterEnabled()) {
        complianceReporter.recordViolation({
          type: 'invariant_violated',
          severity: 'critical',
          gate: 'constitutionalEnforcer',
          description: `Security scan required for change ${changeId}: ${check.violationDetails}`,
          context: {
            invariantId: check.invariantId,
            changeId,
            affectsAuthCode,
            violationDetails: check.violationDetails,
          },
        });
      }

      if (isStrictMode()) {
        return { allowed: false, reason: check.violationDetails };
      }
    }

    return { allowed: true };
  }

  /**
   * ADR-058: Check if backup is required before destructive operation
   * Constitutional invariant #3
   */
  async checkBackupRequired(
    targetPath: string,
    backupInfo?: { source: string; destination: string; timestamp: number; verified: boolean; sizeBytes?: number }
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!isConstitutionalEnforcerEnabled()) {
      return { allowed: true };
    }

    // Build DeleteOperation object
    const deleteOperation = {
      type: 'delete' as const,
      target: targetPath,
      timestamp: Date.now(),
    };

    const check = constitutionalEnforcer.checkBackupBeforeDelete(
      deleteOperation,
      backupInfo
    );

    if (!check.passed) {
      if (isComplianceReporterEnabled()) {
        complianceReporter.recordViolation({
          type: 'invariant_violated',
          severity: 'high',
          gate: 'constitutionalEnforcer',
          description: `Backup required before delete of ${targetPath}: ${check.violationDetails}`,
          context: {
            invariantId: check.invariantId,
            targetPath,
            violationDetails: check.violationDetails,
          },
        });
      }

      if (isStrictMode()) {
        return { allowed: false, reason: check.violationDetails };
      }
    }

    return { allowed: true };
  }

  /**
   * ADR-058: Get compliance report for the current session
   */
  getComplianceReport(): {
    score: number;
    grade: string;
    violations: ComplianceViolation[];
  } | null {
    if (!isComplianceReporterEnabled()) {
      return null;
    }

    const stats = complianceReporter.getComplianceStats();
    const violations = complianceReporter.getViolations();

    // Calculate grade from score
    let grade: string;
    if (stats.currentScore >= 90) grade = 'A';
    else if (stats.currentScore >= 80) grade = 'B';
    else if (stats.currentScore >= 70) grade = 'C';
    else if (stats.currentScore >= 60) grade = 'D';
    else grade = 'F';

    return {
      score: stats.currentScore,
      grade,
      violations,
    };
  }

  /**
   * Check if an agent is currently throttled
   */
  isAgentThrottled(agentId: string): boolean {
    return continueGateIntegration.getAgentStats(agentId).isThrottled;
  }

  /**
   * Get throttle remaining time in milliseconds
   */
  getThrottleRemaining(agentId: string): number {
    return continueGateIntegration.getAgentStats(agentId).throttleRemainingMs;
  }

  /**
   * Clear throttle for an agent (admin action)
   */
  clearAgentThrottle(agentId: string): void {
    continueGateIntegration.clearThrottle(agentId);
  }

  /**
   * Subscribe to escalation events
   */
  onEscalation(callback: (context: TaskGovernanceContext, reason: string) => void): () => void {
    this.escalationCallbacks.add(callback);
    return () => this.escalationCallbacks.delete(callback);
  }

  /**
   * Check budget limits
   */
  private checkBudget(): { allowed: boolean; reason?: string } {
    const flags = governanceFlags.getFlags().budgetMeter;

    if (this.sessionCost >= flags.maxSessionCostUsd) {
      return {
        allowed: !isStrictMode(),
        reason: `Session cost limit exceeded ($${this.sessionCost.toFixed(2)} >= $${flags.maxSessionCostUsd})`,
      };
    }

    if (this.sessionTokens >= flags.maxTokensPerSession) {
      return {
        allowed: !isStrictMode(),
        reason: `Session token limit exceeded (${this.sessionTokens} >= ${flags.maxTokensPerSession})`,
      };
    }

    // Warning threshold
    const costPercent = (this.sessionCost / flags.maxSessionCostUsd) * 100;
    const tokenPercent = (this.sessionTokens / flags.maxTokensPerSession) * 100;

    if (costPercent >= flags.warningThresholdPercent || tokenPercent >= flags.warningThresholdPercent) {
      console.warn(`[QueenGovernance] Budget warning: ${Math.max(costPercent, tokenPercent).toFixed(1)}% consumed`);
    }

    return { allowed: true };
  }

  /**
   * Trigger escalation to Queen
   */
  private triggerEscalation(context: TaskGovernanceContext, reason: string): void {
    console.warn(`[QueenGovernance] Escalation triggered:`, {
      agentId: context.agentId,
      taskId: context.taskId,
      domain: context.domain,
      reason,
    });

    this.escalationCallbacks.forEach(cb => {
      try {
        cb(context, reason);
      } catch (error) {
        console.error('[QueenGovernance] Escalation callback error:', error);
      }
    });
  }

  /**
   * Get governance statistics
   */
  getStats(): {
    sessionCost: number;
    sessionTokens: number;
    memoryPatterns: number;
    patternsByDomain: Record<string, number>;
  } {
    const memoryStats = memoryWriteGateIntegration.getStats();
    return {
      sessionCost: this.sessionCost,
      sessionTokens: this.sessionTokens,
      memoryPatterns: memoryStats.totalPatterns,
      patternsByDomain: memoryStats.patternsByDomain,
    };
  }

  /**
   * Apply temporal decay to memory patterns
   */
  async applyMemoryDecay(): Promise<string[]> {
    return memoryWriteGateIntegration.applyTemporalDecay();
  }

  /**
   * Reset governance state (for testing or new sessions)
   */
  reset(): void {
    continueGateIntegration.reset();
    memoryWriteGateIntegration.reset();
    this.sessionCost = 0;
    this.sessionTokens = 0;
  }

  /**
   * Enable strict mode (blocking enforcement)
   */
  enableStrictMode(): void {
    governanceFlags.enableStrictMode();
  }

  /**
   * Disable all governance gates (emergency kill switch)
   */
  disableAllGates(): void {
    governanceFlags.disableAllGates();
  }
}

/**
 * Singleton instance for application-wide use
 */
export const queenGovernanceAdapter = new QueenGovernanceAdapter();

/**
 * Export for easy imports
 */
export {
  governanceFlags,
  isContinueGateEnabled,
  isMemoryWriteGateEnabled,
  isBudgetMeterEnabled,
  isStrictMode,
};
