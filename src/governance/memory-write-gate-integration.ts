/**
 * MemoryWriteGate Integration for Agentic QE Fleet
 *
 * Wires @claude-flow/guidance MemoryWriteGate to ReasoningBank.
 * TODO(ruflo-rebrand): Replace @claude-flow/guidance with @ruflo/guidance when published
 * Provides contradiction detection, temporal decay, and domain namespacing.
 *
 * @module governance/memory-write-gate-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isMemoryWriteGateEnabled, isStrictMode } from './feature-flags.js';
import { toErrorMessage } from '../shared/error-utils.js';

/**
 * Lazily loaded MemoryWriteGate from @claude-flow/guidance.
 * Provides authority-scoped writes, rate limiting, TTL, contradiction detection.
 */
type GuidanceMemoryWriteGateType = import('@claude-flow/guidance/memory-gate').MemoryWriteGate;
type GuidanceMemoryAuthority = import('@claude-flow/guidance/memory-gate').MemoryAuthority;
type GuidanceWriteDecision = import('@claude-flow/guidance/memory-gate').WriteDecision;

/**
 * Pattern to be stored in memory
 */
export interface MemoryPattern {
  key: string;
  value: unknown;
  domain: string;
  agentId?: string;
  timestamp?: number;
  useCount?: number;
  supersedes?: string[];
  tags?: string[];
}

/**
 * MemoryWriteGate decision result
 */
export interface MemoryWriteGateDecision {
  allowed: boolean;
  reason?: string;
  conflictingPatterns?: MemoryPattern[];
  suggestedResolution?: 'supersede' | 'merge' | 'reject';
  requiresManualReview?: boolean;
}

/**
 * MemoryWriteGate integration for AQE ReasoningBank
 */
export class MemoryWriteGateIntegration {
  private patternIndex: Map<string, MemoryPattern> = new Map();
  private domainPatterns: Map<string, Set<string>> = new Map();
  private guidanceMemoryGate: GuidanceMemoryWriteGateType | null = null;
  private initialized = false;

  /**
   * Initialize the MemoryWriteGate integration
   *
   * Attempts to load @claude-flow/guidance MemoryWriteGate for authority-scoped
   * writes and rate limiting. Falls back to local contradiction detection
   * optimized for AQE's ReasoningBank pattern storage.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try loading guidance MemoryWriteGate
    try {
      const modulePath = '@claude-flow/guidance/memory-gate';
      const mod = await import(/* @vite-ignore */ modulePath) as {
        createMemoryWriteGate?: (config?: Record<string, unknown>) => GuidanceMemoryWriteGateType;
      };
      if (mod && typeof mod.createMemoryWriteGate === 'function') {
        this.guidanceMemoryGate = mod.createMemoryWriteGate({
          enableContradictionTracking: true,
        });
        console.log('[MemoryWriteGateIntegration] Guidance MemoryWriteGate loaded');
      }
    } catch {
      // Guidance package unavailable — use local implementation
      this.guidanceMemoryGate = null;
    }

    this.initialized = true;
  }

  /**
   * Evaluate whether a pattern can be written to memory
   */
  async evaluateWrite(pattern: MemoryPattern): Promise<MemoryWriteGateDecision> {
    if (!isMemoryWriteGateEnabled()) {
      return { allowed: true };
    }

    await this.initialize();

    const flags = governanceFlags.getFlags().memoryWriteGate;

    // Ensure timestamp
    pattern.timestamp = pattern.timestamp || Date.now();
    pattern.useCount = pattern.useCount || 0;

    // Local contradiction detection runs first (authoritative for AQE)
    const localDecision = this.localEvaluation(pattern, flags);

    // Only consult guidance when local detected no issues
    if (this.guidanceMemoryGate && localDecision.allowed && !localDecision.reason) {
      try {
        const authority: GuidanceMemoryAuthority = {
          agentId: pattern.agentId || 'unknown',
          role: 'worker',
          namespaces: [pattern.domain],
          maxWritesPerMinute: 60,
          canDelete: false,
          canOverwrite: true,
          trustLevel: 0.7,
        };
        const decision: GuidanceWriteDecision = this.guidanceMemoryGate.evaluateWrite(
          authority,
          pattern.key,
          pattern.domain,
          pattern.value,
        );
        if (!decision.allowed) {
          return this.mapGuidanceDecision(decision);
        }
      } catch {
        // Guidance evaluation failed — local decision stands
      }
    }

    return localDecision;
  }

  /**
   * Local contradiction detection implementation
   */
  private localEvaluation(
    pattern: MemoryPattern,
    flags: typeof governanceFlags extends { getFlags(): { memoryWriteGate: infer T } } ? T : never
  ): MemoryWriteGateDecision {
    // Check domain namespacing
    if (flags.domainNamespacing && pattern.agentId) {
      const allowedDomains = this.getAllowedDomainsForAgent(pattern.agentId);
      if (!allowedDomains.includes(pattern.domain) && !allowedDomains.includes('*')) {
        this.logViolation(pattern, 'domain_violation', `Agent ${pattern.agentId} cannot write to domain ${pattern.domain}`);
        return {
          allowed: !isStrictMode(),
          reason: `Agent ${pattern.agentId} not authorized to write to domain ${pattern.domain}`,
          requiresManualReview: true,
        };
      }
    }

    // Check for contradictions
    if (flags.contradictionDetection) {
      const conflicts = this.findConflictingPatterns(pattern);

      if (conflicts.length > 0) {
        // Check if this pattern explicitly supersedes the conflicts
        const explicitlySupersedesAll = conflicts.every(
          c => pattern.supersedes?.includes(c.key)
        );

        if (explicitlySupersedesAll) {
          return {
            allowed: true,
            conflictingPatterns: conflicts,
            suggestedResolution: 'supersede',
          };
        }

        this.logViolation(pattern, 'contradiction', `Conflicts with ${conflicts.length} existing pattern(s)`);

        return {
          allowed: !isStrictMode(),
          reason: `Pattern conflicts with ${conflicts.length} existing pattern(s)`,
          conflictingPatterns: conflicts,
          suggestedResolution: this.suggestResolution(pattern, conflicts),
          requiresManualReview: conflicts.some(c => (c.useCount || 0) > 5),
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Find patterns that conflict with the new pattern
   */
  private findConflictingPatterns(pattern: MemoryPattern): MemoryPattern[] {
    const domainPatternKeys = this.domainPatterns.get(pattern.domain);
    if (!domainPatternKeys) return [];

    const conflicts: MemoryPattern[] = [];

    for (const key of domainPatternKeys) {
      const existing = this.patternIndex.get(key);
      if (!existing || existing.key === pattern.key) continue;

      // Check for semantic contradiction
      if (this.areContradictory(pattern, existing)) {
        conflicts.push(existing);
      }
    }

    return conflicts;
  }

  /**
   * Check if two patterns are contradictory
   * This is a simplified check - real implementation would use semantic analysis
   */
  private areContradictory(a: MemoryPattern, b: MemoryPattern): boolean {
    // Same key = update, not contradiction
    if (a.key === b.key) return false;

    // Check for negation patterns
    const aStr = JSON.stringify(a.value).toLowerCase();
    const bStr = JSON.stringify(b.value).toLowerCase();

    // Simple heuristics for contradiction
    const contradictionPatterns = [
      { positive: 'should', negative: 'should not' },
      { positive: 'always', negative: 'never' },
      { positive: 'enabled', negative: 'disabled' },
      { positive: 'true', negative: 'false' },
      { positive: 'allow', negative: 'deny' },
      { positive: 'include', negative: 'exclude' },
    ];

    for (const cp of contradictionPatterns) {
      if (
        (aStr.includes(cp.positive) && bStr.includes(cp.negative)) ||
        (aStr.includes(cp.negative) && bStr.includes(cp.positive))
      ) {
        // Check if they're about the same subject (share significant terms)
        const aTerms = new Set(aStr.match(/\b\w{4,}\b/g) || []);
        const bTerms = new Set(bStr.match(/\b\w{4,}\b/g) || []);
        const overlap = [...aTerms].filter(t => bTerms.has(t)).length;

        if (overlap >= 2) {
          return true;
        }
      }
    }

    // Check for same subject with different values
    if (a.tags && b.tags) {
      const sharedTags = a.tags.filter(t => b.tags?.includes(t));
      if (sharedTags.length > 0 && a.value !== b.value) {
        // Patterns about the same subject with different values may conflict
        return true;
      }
    }

    return false;
  }

  /**
   * Suggest a resolution for conflicting patterns
   */
  private suggestResolution(
    newPattern: MemoryPattern,
    conflicts: MemoryPattern[]
  ): 'supersede' | 'merge' | 'reject' {
    // If new pattern is from a higher-authority source, supersede
    const newTimestamp = newPattern.timestamp || 0;
    const oldestConflict = Math.min(...conflicts.map(c => c.timestamp || 0));

    if (newTimestamp - oldestConflict > 7 * 24 * 60 * 60 * 1000) {
      // Conflict is older than 7 days
      return 'supersede';
    }

    // If conflicts have high use count, require explicit resolution
    if (conflicts.some(c => (c.useCount || 0) > 10)) {
      return 'reject';
    }

    // Default to merge (both patterns coexist with warning)
    return 'merge';
  }

  /**
   * Get allowed domains for an agent (based on QE domain mapping)
   */
  private getAllowedDomainsForAgent(agentId: string): string[] {
    // Map QE agents to their domains
    const agentDomainMap: Record<string, string[]> = {
      'qe-test-architect': ['test-generation', 'learning-optimization'],
      'qe-coverage-specialist': ['coverage-analysis', 'learning-optimization'],
      'qe-security-scanner': ['security-compliance'],
      'qe-chaos-engineer': ['chaos-resilience'],
      'qe-defect-predictor': ['defect-intelligence', 'learning-optimization'],
      'qe-learning-coordinator': ['*'], // Can write to any domain
      'qe-quality-gate': ['quality-assessment'],
      'qe-parallel-executor': ['test-execution'],
      'qe-contract-validator': ['contract-testing'],
      'qe-accessibility-auditor': ['visual-accessibility'],
      'qe-requirements-validator': ['requirements-validation'],
      'qe-code-intelligence': ['code-intelligence'],
    };

    return agentDomainMap[agentId] || [agentId.split('-').pop() || 'unknown'];
  }

  /**
   * Get existing patterns for a domain
   */
  private getExistingPatterns(domain: string): MemoryPattern[] {
    const keys = this.domainPatterns.get(domain);
    if (!keys) return [];

    return [...keys]
      .map(key => this.patternIndex.get(key))
      .filter((p): p is MemoryPattern => p !== undefined);
  }

  /**
   * Map guidance WriteDecision to our MemoryWriteGateDecision format.
   *
   * WriteDecision has: { allowed, reason, contradictions, authorityCheck, rateCheck, overwriteCheck }
   * We map to: { allowed, reason, conflictingPatterns, suggestedResolution, requiresManualReview }
   */
  private mapGuidanceDecision(decision: GuidanceWriteDecision): MemoryWriteGateDecision {
    return {
      allowed: decision.allowed,
      reason: decision.reason,
      requiresManualReview: !decision.authorityCheck.passed || decision.contradictions.length > 0,
      suggestedResolution: decision.contradictions.length > 0 ? 'reject' : undefined,
    };
  }

  /**
   * Log governance violation
   */
  private logViolation(pattern: MemoryPattern, type: string, details: string): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.warn(`[MemoryWriteGate] Violation detected:`, {
      patternKey: pattern.key,
      domain: pattern.domain,
      violationType: type,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Register a pattern after successful write
   * Call this after ReasoningBank confirms the write
   */
  registerPattern(pattern: MemoryPattern): void {
    this.patternIndex.set(pattern.key, pattern);

    if (!this.domainPatterns.has(pattern.domain)) {
      this.domainPatterns.set(pattern.domain, new Set());
    }
    this.domainPatterns.get(pattern.domain)!.add(pattern.key);
  }

  /**
   * Unregister a pattern (on deletion)
   */
  unregisterPattern(key: string): void {
    const pattern = this.patternIndex.get(key);
    if (pattern) {
      this.domainPatterns.get(pattern.domain)?.delete(key);
      this.patternIndex.delete(key);
    }
  }

  /**
   * Increment use count for a pattern
   */
  incrementUseCount(key: string): void {
    const pattern = this.patternIndex.get(key);
    if (pattern) {
      pattern.useCount = (pattern.useCount || 0) + 1;
    }
  }

  /**
   * Apply temporal decay - archive old patterns with low use
   */
  async applyTemporalDecay(): Promise<string[]> {
    const flags = governanceFlags.getFlags().memoryWriteGate;
    const decayThresholdMs = flags.temporalDecayDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const archived: string[] = [];

    for (const [key, pattern] of this.patternIndex) {
      const age = now - (pattern.timestamp || 0);
      const useCount = pattern.useCount || 0;

      if (age > decayThresholdMs && useCount < flags.minUsesForRetention) {
        archived.push(key);
        this.unregisterPattern(key);
      }
    }

    if (archived.length > 0) {
      console.info(`[MemoryWriteGate] Archived ${archived.length} patterns due to temporal decay`);
    }

    return archived;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    patternsByDomain: Record<string, number>;
  } {
    const patternsByDomain: Record<string, number> = {};

    for (const [domain, keys] of this.domainPatterns) {
      patternsByDomain[domain] = keys.size;
    }

    return {
      totalPatterns: this.patternIndex.size,
      patternsByDomain,
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.patternIndex.clear();
    this.domainPatterns.clear();
  }

  /**
   * Load existing patterns from ReasoningBank
   * Call this on startup to sync state
   */
  loadPatternsFromBank(patterns: MemoryPattern[]): void {
    for (const pattern of patterns) {
      this.registerPattern(pattern);
    }
  }
}

/**
 * Singleton instance
 */
export const memoryWriteGateIntegration = new MemoryWriteGateIntegration();

/**
 * Helper to create a memory pattern
 */
export function createMemoryPattern(
  key: string,
  value: unknown,
  domain: string,
  options: Partial<Omit<MemoryPattern, 'key' | 'value' | 'domain'>> = {}
): MemoryPattern {
  return {
    key,
    value,
    domain,
    timestamp: Date.now(),
    useCount: 0,
    ...options,
  };
}
