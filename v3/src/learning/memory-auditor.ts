/**
 * Agentic QE v3 - Memory Coherence Auditor
 * ADR-052 Phase 3 Action A3.2
 *
 * Periodically audits QE pattern memory for contradictions and coherence issues.
 * Uses the Prime Radiant Coherence Service to detect inconsistent patterns.
 *
 * **Architecture:**
 * ```
 * ┌────────────────────────────────────────────────────────────┐
 * │                 MEMORY COHERENCE AUDITOR                   │
 * ├────────────────────────────────────────────────────────────┤
 * │                                                            │
 * │  ┌──────────────┐        ┌──────────────┐                │
 * │  │ QE Patterns  │───────▶│ Coherence    │                │
 * │  │ (Memory)     │        │ Service      │                │
 * │  └──────────────┘        └──────┬───────┘                │
 * │                                  │                         │
 * │                         ┌────────▼────────┐               │
 * │                         │ Energy Analysis │               │
 * │                         │ • Contradictions│               │
 * │                         │ • Hotspots      │               │
 * │                         └────────┬────────┘               │
 * │                                  │                         │
 * │                         ┌────────▼────────┐               │
 * │                         │ Recommendations │               │
 * │                         │ • Merge         │               │
 * │                         │ • Remove        │               │
 * │                         │ • Review        │               │
 * │                         └─────────────────┘               │
 * │                                                            │
 * └────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```typescript
 * import { createMemoryAuditor } from './learning';
 * import { createCoherenceService } from './integrations/coherence';
 *
 * // Create auditor
 * const auditor = createMemoryAuditor(coherenceService, eventBus);
 *
 * // Audit patterns
 * const result = await auditor.auditPatterns(patterns);
 *
 * if (result.contradictionCount > 0) {
 *   console.log('Found contradictions:', result.hotspots);
 *   console.log('Recommendations:', result.recommendations);
 * }
 *
 * // Background audit
 * await auditor.runBackgroundAudit(async () => {
 *   return await patternStore.getAll();
 * });
 * ```
 *
 * @module learning/memory-auditor
 */

import type { CoherenceService, CoherenceResult, CoherenceNode } from '../integrations/coherence/index.js';
import type { QEPattern, QEDomain } from './qe-patterns.js';
import type { EventBus } from '../kernel/interfaces.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a memory audit
 */
export interface MemoryAuditResult {
  /** Total number of patterns in the database */
  totalPatterns: number;
  /** Number of patterns scanned in this audit */
  scannedPatterns: number;
  /** Number of contradictions found */
  contradictionCount: number;
  /** Overall coherence energy (lower = more coherent) */
  globalEnergy: number;
  /** High-energy domains requiring attention */
  hotspots: PatternHotspot[];
  /** Actionable recommendations */
  recommendations: AuditRecommendation[];
  /** Audit duration in milliseconds */
  duration: number;
  /** When the audit was performed */
  timestamp: Date;
}

/**
 * A domain with high coherence energy
 */
export interface PatternHotspot {
  /** The problematic domain */
  domain: QEDomain;
  /** Pattern IDs contributing to high energy */
  patternIds: string[];
  /** Coherence energy for this domain */
  energy: number;
  /** Human-readable description */
  description: string;
}

/**
 * Recommendation for resolving coherence issues
 */
export interface AuditRecommendation {
  /** Type of action to take */
  type: 'merge' | 'remove' | 'review' | 'split';
  /** Patterns involved */
  patternIds: string[];
  /** Reason for recommendation */
  reason: string;
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
}

/**
 * Configuration for the auditor
 */
export interface MemoryAuditorConfig {
  /** Number of patterns to process per batch */
  batchSize: number;
  /** Energy threshold for flagging issues */
  energyThreshold: number;
  /** Energy threshold for hotspot detection */
  hotspotThreshold: number;
  /** Maximum recommendations to generate */
  maxRecommendations: number;
}

/**
 * Default auditor configuration
 */
export const DEFAULT_AUDITOR_CONFIG: MemoryAuditorConfig = {
  batchSize: 50,
  energyThreshold: 0.4,
  hotspotThreshold: 0.6,
  maxRecommendations: 10,
};

// ============================================================================
// Memory Coherence Auditor
// ============================================================================

/**
 * Memory Coherence Auditor
 *
 * Periodically scans QE patterns for coherence issues:
 * - Contradictory patterns (detected via Prime Radiant)
 * - Duplicate/overlapping patterns
 * - Outdated patterns with low usage
 * - Overly broad patterns
 *
 * Generates actionable recommendations:
 * - Merge similar patterns
 * - Remove outdated patterns
 * - Review high-energy patterns
 * - Split overly broad patterns
 */
export class MemoryCoherenceAuditor {
  private isAuditing = false;

  constructor(
    private readonly coherenceService: CoherenceService,
    private readonly eventBus?: EventBus,
    private readonly config: MemoryAuditorConfig = DEFAULT_AUDITOR_CONFIG
  ) {}

  /**
   * Audit a collection of patterns for coherence
   *
   * @param patterns - Patterns to audit
   * @returns Audit result with contradictions and recommendations
   */
  async auditPatterns(patterns: QEPattern[]): Promise<MemoryAuditResult> {
    const startTime = Date.now();

    // Emit start event
    await this.emitEvent('memory:audit_started', {
      totalPatterns: patterns.length,
      timestamp: new Date(),
    });

    try {
      // Group patterns by domain for focused analysis
      const domainGroups = this.groupByDomain(patterns);
      const hotspots: PatternHotspot[] = [];
      let totalContradictions = 0;
      let totalEnergy = 0;

      // Check each domain for coherence
      for (const [domain, domainPatterns] of Object.entries(domainGroups)) {
        if (domainPatterns.length < 2) continue; // Skip single-pattern domains

        // Convert patterns to coherence nodes
        const nodes = this.patternsToNodes(domainPatterns);

        // Check coherence using Prime Radiant
        const result = await this.coherenceService.checkCoherence(nodes);

        totalEnergy += result.energy;
        totalContradictions += result.contradictions.length;

        // Identify hotspots (high-energy domains)
        if (result.energy > this.config.hotspotThreshold) {
          hotspots.push({
            domain: domain as QEDomain,
            patternIds: domainPatterns.map(p => p.id),
            energy: result.energy,
            description: this.describeHotspot(result, domain as QEDomain),
          });
        }
      }

      // Calculate global energy
      const domainCount = Object.keys(domainGroups).length;
      const globalEnergy = domainCount > 0 ? totalEnergy / domainCount : 0;

      // Identify hotspots across all patterns
      const allHotspots = await this.identifyHotspots(patterns);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        allHotspots,
        patterns
      );

      const duration = Date.now() - startTime;

      const auditResult: MemoryAuditResult = {
        totalPatterns: patterns.length,
        scannedPatterns: patterns.length,
        contradictionCount: totalContradictions,
        globalEnergy,
        hotspots: allHotspots,
        recommendations,
        duration,
        timestamp: new Date(),
      };

      // Emit completion event
      await this.emitEvent('memory:audit_completed', {
        result: auditResult,
        timestamp: new Date(),
      });

      return auditResult;
    } catch (error) {
      // Emit error event
      try {
        await this.emitEvent('memory:audit_failed', {
          error: toErrorMessage(error),
          timestamp: new Date(),
        });
      } catch (eventError) {
        // Ignore event emission errors
        console.warn('Failed to emit audit_failed event:', eventError);
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Identify coherence hotspots across patterns
   *
   * @param patterns - All patterns to analyze
   * @returns Detected hotspots
   */
  async identifyHotspots(patterns: QEPattern[]): Promise<PatternHotspot[]> {
    const hotspots: PatternHotspot[] = [];

    // Group patterns by domain
    const domainGroups = this.groupByDomain(patterns);

    // Check each domain
    for (const [domain, domainPatterns] of Object.entries(domainGroups)) {
      if (domainPatterns.length < 2) continue;

      // Convert to coherence nodes
      const nodes = this.patternsToNodes(domainPatterns);

      // Check coherence
      const result = await this.coherenceService.checkCoherence(nodes);

      // Flag high-energy domains
      if (result.energy > this.config.hotspotThreshold) {
        hotspots.push({
          domain: domain as QEDomain,
          patternIds: domainPatterns.map(p => p.id),
          energy: result.energy,
          description: this.describeHotspot(result, domain as QEDomain),
        });
      }
    }

    return hotspots;
  }

  /**
   * Generate actionable recommendations from hotspots
   *
   * @param hotspots - Detected hotspots
   * @param patterns - All patterns
   * @returns Prioritized recommendations
   */
  async generateRecommendations(
    hotspots: PatternHotspot[],
    patterns: QEPattern[]
  ): Promise<AuditRecommendation[]> {
    const recommendations: AuditRecommendation[] = [];
    const patternMap = new Map(patterns.map(p => [p.id, p]));

    // Process each hotspot
    for (const hotspot of hotspots) {
      const hotspotPatterns = hotspot.patternIds
        .map(id => patternMap.get(id))
        .filter((p): p is QEPattern => p !== undefined);

      // Detect duplicate-like patterns (similar name/description)
      const duplicates = this.findDuplicates(hotspotPatterns);
      if (duplicates.length > 0) {
        recommendations.push({
          type: 'merge',
          patternIds: duplicates,
          reason: `Detected ${duplicates.length} similar patterns in ${hotspot.domain} domain`,
          priority: 'high',
        });
      }

      // Detect outdated patterns (low usage, low success)
      const outdated = this.findOutdated(hotspotPatterns);
      if (outdated.length > 0) {
        recommendations.push({
          type: 'remove',
          patternIds: outdated,
          reason: `Found ${outdated.length} outdated patterns with low usage/success`,
          priority: 'medium',
        });
      }

      // High-energy patterns need review
      if (hotspot.energy > 0.7) {
        recommendations.push({
          type: 'review',
          patternIds: hotspot.patternIds,
          reason: `Critical coherence energy (${hotspot.energy.toFixed(2)}) in ${hotspot.domain}`,
          priority: 'high',
        });
      }

      // Detect overly broad patterns (low specificity)
      const broad = this.findBroadPatterns(hotspotPatterns);
      if (broad.length > 0) {
        recommendations.push({
          type: 'split',
          patternIds: broad,
          reason: `Found ${broad.length} overly generic patterns that should be specialized`,
          priority: 'low',
        });
      }
    }

    // Sort by priority and limit
    return recommendations
      .sort((a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority))
      .slice(0, this.config.maxRecommendations);
  }

  /**
   * Run a background audit that doesn't block
   *
   * @param patternSource - Function to fetch patterns
   */
  async runBackgroundAudit(
    patternSource: () => Promise<QEPattern[]>
  ): Promise<void> {
    if (this.isAuditing) {
      console.warn('Audit already in progress, skipping');
      return;
    }

    this.isAuditing = true;

    try {
      // Emit progress event
      await this.emitEvent('memory:audit_progress', {
        status: 'fetching_patterns',
        timestamp: new Date(),
      });

      // Fetch patterns
      const patterns = await patternSource();

      // Emit progress event
      await this.emitEvent('memory:audit_progress', {
        status: 'analyzing_coherence',
        totalPatterns: patterns.length,
        timestamp: new Date(),
      });

      // Run audit
      const result = await this.auditPatterns(patterns);

      // Emit progress event
      await this.emitEvent('memory:audit_progress', {
        status: 'completed',
        result,
        timestamp: new Date(),
      });
    } catch (error) {
      await this.emitEvent('memory:audit_progress', {
        status: 'failed',
        error: toErrorMessage(error),
        timestamp: new Date(),
      });
    } finally {
      this.isAuditing = false;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Group patterns by domain
   */
  private groupByDomain(patterns: QEPattern[]): Record<QEDomain, QEPattern[]> {
    const groups: Partial<Record<QEDomain, QEPattern[]>> = {};

    for (const pattern of patterns) {
      const domain = pattern.qeDomain;
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain]!.push(pattern);
    }

    return groups as Record<QEDomain, QEPattern[]>;
  }

  /**
   * Convert patterns to coherence nodes
   */
  private patternsToNodes(patterns: QEPattern[]): CoherenceNode[] {
    return patterns.map(pattern => ({
      id: pattern.id,
      embedding: pattern.embedding || this.createFallbackEmbedding(pattern),
      weight: pattern.qualityScore,
      metadata: {
        name: pattern.name,
        description: pattern.description,
        domain: pattern.qeDomain,
        confidence: pattern.confidence,
        usageCount: pattern.usageCount,
        successRate: pattern.successRate,
      },
    }));
  }

  /**
   * Create a fallback embedding for patterns without one
   */
  private createFallbackEmbedding(pattern: QEPattern): number[] {
    // Simple hash-based embedding as fallback
    const text = `${pattern.name} ${pattern.description}`;
    const embedding: number[] = [];

    for (let i = 0; i < 64; i++) {
      const charCode = text.charCodeAt(i % text.length);
      embedding.push((charCode / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    return embedding;
  }

  /**
   * Describe a hotspot in human-readable form
   */
  private describeHotspot(result: CoherenceResult, domain: QEDomain): string {
    const energy = result.energy.toFixed(2);
    const contradictions = result.contradictions.length;

    if (contradictions > 0) {
      return `${domain} has ${contradictions} contradiction(s) with energy ${energy}`;
    }

    return `${domain} has high coherence energy (${energy}) indicating potential inconsistencies`;
  }

  /**
   * Find duplicate-like patterns
   */
  private findDuplicates(patterns: QEPattern[]): string[] {
    const duplicates: string[] = [];
    const groups = new Map<string, string[]>();

    // Group patterns by normalized content
    for (const pattern of patterns) {
      const key = this.normalizeText(`${pattern.name} ${pattern.description}`);

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pattern.id);
    }

    // Find groups with multiple patterns (duplicates)
    for (const [_, ids] of groups) {
      if (ids.length > 1) {
        // Keep the first, mark the rest as duplicates
        duplicates.push(...ids.slice(1));
      }
    }

    return duplicates;
  }

  /**
   * Find outdated patterns
   */
  private findOutdated(patterns: QEPattern[]): string[] {
    return patterns
      .filter(p => p.usageCount < 5 && p.successRate < 0.5)
      .map(p => p.id);
  }

  /**
   * Find overly broad patterns
   */
  private findBroadPatterns(patterns: QEPattern[]): string[] {
    return patterns
      .filter(p => {
        const hasGenericName = /generic|general|common|basic/i.test(p.name);
        // Defensive: handle patterns without context or tags
        const tags = p.context?.tags;
        const hasLowSpecificity = !tags || tags.length < 2;
        return hasGenericName || hasLowSpecificity;
      })
      .map(p => p.id);
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convert priority to numeric value for sorting
   */
  private priorityValue(priority: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Emit event if event bus is available
   */
  private async emitEvent(eventType: string, payload: unknown): Promise<void> {
    if (!this.eventBus) return;

    try {
      await this.eventBus.publish({
        id: `memory-audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: eventType,
        source: 'learning-optimization',
        timestamp: new Date(),
        payload,
      });
    } catch (error) {
      console.warn(`Failed to emit event ${eventType}:`, error);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Memory Coherence Auditor
 *
 * @param coherenceService - Coherence service for verification
 * @param eventBus - Optional event bus for notifications
 * @param config - Optional configuration overrides
 * @returns Configured auditor instance
 *
 * @example
 * ```typescript
 * const auditor = createMemoryAuditor(coherenceService, eventBus, {
 *   batchSize: 100,
 *   energyThreshold: 0.5,
 * });
 *
 * const result = await auditor.auditPatterns(patterns);
 * ```
 */
export function createMemoryAuditor(
  coherenceService: CoherenceService,
  eventBus?: EventBus,
  config?: Partial<MemoryAuditorConfig>
): MemoryCoherenceAuditor {
  return new MemoryCoherenceAuditor(
    coherenceService,
    eventBus,
    { ...DEFAULT_AUDITOR_CONFIG, ...config }
  );
}
