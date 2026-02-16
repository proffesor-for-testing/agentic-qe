/**
 * AQE Experience Capture Module
 * Phase 4: Self-Learning Features
 *
 * Captures task execution experiences for pattern learning.
 * Works standalone and integrates with Claude Flow trajectories when available.
 *
 * Features:
 * - Task execution recording
 * - Outcome capture with quality metrics
 * - Pattern extraction from successful tasks
 * - Pattern promotion after threshold uses
 * - Cross-domain experience sharing
 */

import { v4 as uuidv4 } from 'uuid';
import type { MemoryBackend, EventBus } from '../kernel/interfaces.js';
import type { Result } from '../shared/types/index.js';
import type { DomainName } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('experience-capture');

import type {
  QEPattern,
  CreateQEPatternOptions,
  QEDomain,
  QEPatternType,
} from './qe-patterns.js';
import type { PatternStore, PatternSearchResult } from './pattern-store.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task execution experience
 */
export interface TaskExperience {
  /** Unique experience ID */
  id: string;

  /** Task description */
  task: string;

  /** Agent that executed the task */
  agent?: string;

  /** QE Domain (if applicable) */
  domain?: QEDomain;

  /** Model used (haiku/sonnet/opus) */
  model?: 'haiku' | 'sonnet' | 'opus';

  /** Task started timestamp */
  startedAt: number;

  /** Task completed timestamp */
  completedAt: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Execution steps */
  steps: ExperienceStep[];

  /** Success indicator */
  success: boolean;

  /** Quality score (0-1) */
  quality: number;

  /** Feedback provided */
  feedback?: string;

  /** Extracted patterns (if any) */
  patterns?: string[];

  /** Claude Flow trajectory ID (if available) */
  trajectoryId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Experience step
 */
export interface ExperienceStep {
  /** Action taken */
  action: string;

  /** Result of the action */
  result?: string;

  /** Quality score for this step (0-1) */
  quality?: number;

  /** Timestamp */
  timestamp: number;

  /** Tokens used (if tracked) */
  tokensUsed?: number;
}

/**
 * Experience capture configuration
 */
export interface ExperienceCaptureConfig {
  /** Storage namespace */
  namespace: string;

  /** Minimum quality for pattern extraction (0-1) */
  minQualityForPatternExtraction: number;

  /** Similarity threshold for pattern matching */
  similarityThreshold: number;

  /** Promotion threshold (successful uses) */
  promotionThreshold: number;

  /** Maximum experiences to keep per domain */
  maxExperiencesPerDomain: number;

  /** Enable cross-domain sharing */
  enableCrossDomainSharing: boolean;

  /** Auto-cleanup old experiences */
  autoCleanup: boolean;

  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;
}

/**
 * Default experience capture configuration
 */
export const DEFAULT_EXPERIENCE_CONFIG: ExperienceCaptureConfig = {
  namespace: 'qe-experiences',
  minQualityForPatternExtraction: 0.7,
  similarityThreshold: 0.85,
  promotionThreshold: 3,
  maxExperiencesPerDomain: 1000,
  enableCrossDomainSharing: true,
  autoCleanup: true,
  cleanupIntervalMs: 86400000, // 24 hours
};

/**
 * Experience capture statistics
 */
export interface ExperienceCaptureStats {
  /** Total experiences captured */
  totalExperiences: number;

  /** Experiences by domain */
  byDomain: Record<QEDomain, number>;

  /** Success rate */
  successRate: number;

  /** Average quality */
  avgQuality: number;

  /** Patterns extracted */
  patternsExtracted: number;

  /** Patterns promoted */
  patternsPromoted: number;
}

/**
 * Pattern extraction result
 */
export interface PatternExtractionResult {
  /** Whether a new pattern was created */
  newPattern: boolean;

  /** Pattern ID (new or existing) */
  patternId?: string;

  /** Whether an existing pattern was reinforced */
  reinforced: boolean;

  /** Whether pattern was promoted */
  promoted: boolean;
}

// ============================================================================
// Experience Capture Service
// ============================================================================

/**
 * Experience Capture Service
 *
 * Captures and processes task execution experiences for pattern learning.
 */
export class ExperienceCaptureService {
  private readonly config: ExperienceCaptureConfig;
  private initialized = false;
  private cleanupTimer?: NodeJS.Timeout;

  // In-memory cache for active experiences
  private activeExperiences: Map<string, TaskExperience> = new Map();

  // Statistics
  private stats = {
    totalCaptured: 0,
    successfulCaptures: 0,
    patternsExtracted: 0,
    patternsPromoted: 0,
    byDomain: new Map<QEDomain, number>(),
  };

  constructor(
    private readonly memory: MemoryBackend,
    private readonly patternStore?: PatternStore,
    private readonly eventBus?: EventBus,
    config: Partial<ExperienceCaptureConfig> = {}
  ) {
    this.config = { ...DEFAULT_EXPERIENCE_CONFIG, ...config };
  }

  /**
   * Initialize the experience capture service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load existing stats
    await this.loadStats();

    // Start cleanup timer if enabled
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(
        () => this.cleanup(),
        this.config.cleanupIntervalMs
      );
    }

    this.initialized = true;
    console.log('[ExperienceCapture] Initialized');
  }

  /**
   * Start capturing a task experience
   */
  startCapture(
    task: string,
    options?: {
      agent?: string;
      domain?: QEDomain;
      model?: 'haiku' | 'sonnet' | 'opus';
      trajectoryId?: string;
      metadata?: Record<string, unknown>;
    }
  ): string {
    const id = `exp-${Date.now()}-${uuidv4().slice(0, 8)}`;

    const experience: TaskExperience = {
      id,
      task,
      agent: options?.agent,
      domain: options?.domain,
      model: options?.model,
      startedAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      steps: [],
      success: false,
      quality: 0,
      trajectoryId: options?.trajectoryId,
      metadata: options?.metadata,
    };

    this.activeExperiences.set(id, experience);

    return id;
  }

  /**
   * Record a step in the experience
   */
  recordStep(
    experienceId: string,
    step: Omit<ExperienceStep, 'timestamp'>
  ): void {
    const experience = this.activeExperiences.get(experienceId);
    if (!experience) {
      console.warn(`[ExperienceCapture] Experience not found: ${experienceId}`);
      return;
    }

    experience.steps.push({
      ...step,
      timestamp: Date.now(),
    });
  }

  /**
   * Complete and capture the experience
   */
  async completeCapture(
    experienceId: string,
    outcome: {
      success: boolean;
      quality?: number;
      feedback?: string;
    }
  ): Promise<Result<TaskExperience>> {
    const experience = this.activeExperiences.get(experienceId);
    if (!experience) {
      return err(new Error(`Experience not found: ${experienceId}`));
    }

    // Complete the experience
    const now = Date.now();
    experience.completedAt = now;
    experience.durationMs = now - experience.startedAt;
    experience.success = outcome.success;
    experience.feedback = outcome.feedback;

    // Calculate quality from steps if not provided
    if (outcome.quality !== undefined) {
      experience.quality = outcome.quality;
    } else {
      experience.quality = this.calculateQuality(experience);
    }

    // Remove from active
    this.activeExperiences.delete(experienceId);

    // Store experience
    await this.storeExperience(experience);

    // Update stats
    this.updateStats(experience);

    // Extract patterns if quality is high enough
    if (
      experience.success &&
      experience.quality >= this.config.minQualityForPatternExtraction
    ) {
      const extractionResult = await this.extractPattern(experience);
      if (extractionResult.newPattern || extractionResult.reinforced) {
        experience.patterns = [extractionResult.patternId!];
      }
    }

    // Emit event
    this.emitExperienceCaptured(experience);

    return ok(experience);
  }

  /**
   * Get an active experience
   */
  getActiveExperience(experienceId: string): TaskExperience | undefined {
    return this.activeExperiences.get(experienceId);
  }

  /**
   * Get experience by ID
   */
  async getExperience(experienceId: string): Promise<TaskExperience | null> {
    const key = `${this.config.namespace}:experience:${experienceId}`;
    const result = await this.memory.get<TaskExperience>(key);
    return result ?? null;
  }

  /**
   * Search experiences
   */
  async searchExperiences(
    options: {
      domain?: QEDomain;
      agent?: string;
      success?: boolean;
      minQuality?: number;
      limit?: number;
    } = {}
  ): Promise<TaskExperience[]> {
    const limit = options.limit || 100;
    const experiences: TaskExperience[] = [];

    // Search by domain if specified
    let keys: string[];
    if (options.domain) {
      keys = await this.memory.search(
        `${this.config.namespace}:index:domain:${options.domain}:*`,
        limit * 2
      );
    } else {
      keys = await this.memory.search(
        `${this.config.namespace}:experience:*`,
        limit * 2
      );
    }

    for (const key of keys) {
      if (experiences.length >= limit) break;

      // Get experience ID from index key or use full key
      const experienceId = key.includes(':index:')
        ? await this.memory.get<string>(key)
        : null;

      const experience = experienceId
        ? await this.getExperience(experienceId)
        : await this.memory.get<TaskExperience>(key);

      if (!experience) continue;

      // Apply filters
      if (options.agent && experience.agent !== options.agent) continue;
      if (options.success !== undefined && experience.success !== options.success) continue;
      if (options.minQuality !== undefined && experience.quality < options.minQuality) continue;

      experiences.push(experience);
    }

    return experiences;
  }

  /**
   * Get experience capture statistics
   */
  async getStats(): Promise<ExperienceCaptureStats> {
    const byDomain: Record<QEDomain, number> = {} as Record<QEDomain, number>;
    for (const [domain, count] of this.stats.byDomain) {
      byDomain[domain] = count;
    }

    return {
      totalExperiences: this.stats.totalCaptured,
      byDomain,
      successRate:
        this.stats.totalCaptured > 0
          ? this.stats.successfulCaptures / this.stats.totalCaptured
          : 0,
      avgQuality: await this.calculateAvgQuality(),
      patternsExtracted: this.stats.patternsExtracted,
      patternsPromoted: this.stats.patternsPromoted,
    };
  }

  /**
   * Extract pattern from experience
   */
  async extractPattern(experience: TaskExperience): Promise<PatternExtractionResult> {
    if (!this.patternStore) {
      return { newPattern: false, reinforced: false, promoted: false };
    }

    // Search for similar existing patterns
    const searchResult = await this.patternStore.search(experience.task, {
      limit: 1,
      domain: experience.domain,
      useVectorSearch: true,
    });

    if (searchResult.success && searchResult.value.length > 0) {
      const existing = searchResult.value[0];

      // If similarity is high enough, reinforce existing pattern
      if (existing.similarity >= this.config.similarityThreshold) {
        const usageResult = await this.patternStore.recordUsage(
          existing.pattern.id,
          experience.success
        );

        // Check if pattern should be promoted (short-term → long-term)
        const pattern = await this.patternStore.get(existing.pattern.id);
        let promoted = false;

        if (
          pattern &&
          pattern.tier === 'short-term' &&
          pattern.usageCount >= this.config.promotionThreshold
        ) {
          // Actually promote the pattern
          const promoteResult = await this.patternStore.promote(existing.pattern.id);
          if (promoteResult.success) {
            promoted = true;
            this.stats.patternsPromoted++;
            console.log(
              `[ExperienceCapture] Pattern promoted: ${existing.pattern.id} (${pattern.usageCount} uses)`
            );
          }
        }

        return {
          newPattern: false,
          patternId: existing.pattern.id,
          reinforced: usageResult.success,
          promoted,
        };
      }
    }

    // Create new pattern from experience
    const patternOptions = this.experienceToPatternOptions(experience);
    const createResult = await this.patternStore.create(patternOptions);

    if (createResult.success) {
      this.stats.patternsExtracted++;

      // Record the initial usage (the experience that created this pattern)
      await this.patternStore.recordUsage(createResult.value.id, experience.success);

      return {
        newPattern: true,
        patternId: createResult.value.id,
        reinforced: false,
        promoted: false,
      };
    }

    return { newPattern: false, reinforced: false, promoted: false };
  }

  /**
   * Share experience across domains
   */
  async shareAcrossDomains(experience: TaskExperience): Promise<void> {
    if (!this.config.enableCrossDomainSharing) return;
    if (!experience.domain) return;

    // Get related domains
    const relatedDomains = this.getRelatedDomains(experience.domain);

    for (const targetDomain of relatedDomains) {
      // Store a reference in the target domain
      const key = `${this.config.namespace}:shared:${targetDomain}:${experience.id}`;
      await this.memory.set(
        key,
        {
          sourceExperience: experience.id,
          sourceDomain: experience.domain,
          sharedAt: Date.now(),
        },
        { persist: true }
      );
    }
  }

  /**
   * Cleanup old experiences
   */
  async cleanup(): Promise<{ removed: number }> {
    let removed = 0;

    for (const domain of this.stats.byDomain.keys()) {
      const count = this.stats.byDomain.get(domain) || 0;

      if (count > this.config.maxExperiencesPerDomain) {
        // Get oldest experiences for this domain
        const experiences = await this.searchExperiences({
          domain,
          limit: count,
        });

        // Sort by timestamp (oldest first)
        experiences.sort((a, b) => a.startedAt - b.startedAt);

        // Remove excess (keeping most recent)
        const toRemove = count - this.config.maxExperiencesPerDomain;
        for (let i = 0; i < Math.min(toRemove, experiences.length); i++) {
          const exp = experiences[i];
          await this.deleteExperience(exp.id);
          removed++;
        }
      }
    }

    console.log(`[ExperienceCapture] Cleanup: removed ${removed} experiences`);
    return { removed };
  }

  /**
   * Dispose the service
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Save stats
    await this.saveStats();

    this.activeExperiences.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Store experience in memory
   */
  private async storeExperience(experience: TaskExperience): Promise<void> {
    const key = `${this.config.namespace}:experience:${experience.id}`;
    await this.memory.set(key, experience, { persist: true });

    // Create domain index
    if (experience.domain) {
      const indexKey = `${this.config.namespace}:index:domain:${experience.domain}:${experience.id}`;
      await this.memory.set(indexKey, experience.id, { persist: true });
    }

    // Create agent index
    if (experience.agent) {
      const agentKey = `${this.config.namespace}:index:agent:${experience.agent}:${experience.id}`;
      await this.memory.set(agentKey, experience.id, { persist: true });
    }
  }

  /**
   * Delete experience
   */
  private async deleteExperience(experienceId: string): Promise<void> {
    const experience = await this.getExperience(experienceId);
    if (!experience) return;

    // Delete main record
    const key = `${this.config.namespace}:experience:${experienceId}`;
    await this.memory.delete(key);

    // Delete indices
    if (experience.domain) {
      const indexKey = `${this.config.namespace}:index:domain:${experience.domain}:${experienceId}`;
      await this.memory.delete(indexKey);
    }

    if (experience.agent) {
      const agentKey = `${this.config.namespace}:index:agent:${experience.agent}:${experienceId}`;
      await this.memory.delete(agentKey);
    }

    // Update stats
    if (experience.domain) {
      const current = this.stats.byDomain.get(experience.domain) || 0;
      if (current > 0) {
        this.stats.byDomain.set(experience.domain, current - 1);
      }
    }
    this.stats.totalCaptured = Math.max(0, this.stats.totalCaptured - 1);
    if (experience.success) {
      this.stats.successfulCaptures = Math.max(0, this.stats.successfulCaptures - 1);
    }
  }

  /**
   * Calculate quality from experience steps
   */
  private calculateQuality(experience: TaskExperience): number {
    if (experience.steps.length === 0) {
      return experience.success ? 0.5 : 0.2;
    }

    // Calculate average quality from steps with quality scores
    const qualitySteps = experience.steps.filter((s) => s.quality !== undefined);
    if (qualitySteps.length === 0) {
      return experience.success ? 0.6 : 0.3;
    }

    const avgQuality =
      qualitySteps.reduce((sum, s) => sum + (s.quality || 0), 0) / qualitySteps.length;

    // Adjust for success/failure
    return experience.success ? Math.min(1, avgQuality + 0.1) : Math.max(0, avgQuality - 0.2);
  }

  /**
   * Update statistics
   */
  private updateStats(experience: TaskExperience): void {
    this.stats.totalCaptured++;

    if (experience.success) {
      this.stats.successfulCaptures++;
    }

    if (experience.domain) {
      const current = this.stats.byDomain.get(experience.domain) || 0;
      this.stats.byDomain.set(experience.domain, current + 1);
    }
  }

  /**
   * Calculate average quality across all experiences
   */
  private async calculateAvgQuality(): Promise<number> {
    const experiences = await this.searchExperiences({ limit: 100 });
    if (experiences.length === 0) return 0;

    const totalQuality = experiences.reduce((sum, e) => sum + e.quality, 0);
    return totalQuality / experiences.length;
  }

  /**
   * Convert experience to pattern options
   */
  private experienceToPatternOptions(experience: TaskExperience): CreateQEPatternOptions {
    // Detect pattern type from task
    const patternType = this.detectPatternType(experience.task);

    // Build template content from experience steps
    const stepDescriptions = experience.steps
      .map((s, i) => `${i + 1}. ${s.action}${s.result ? ` → ${s.result}` : ''}`)
      .join('\n');

    const templateContent = `Task: {{task}}

Steps:
${stepDescriptions}

Duration: ${experience.durationMs}ms`;

    return {
      patternType,
      name: this.generatePatternName(experience),
      description: `Pattern extracted from: ${experience.task}`,
      context: {
        tags: this.extractTags(experience),
        testType: this.detectTestType(experience.task),
      },
      template: {
        type: 'workflow',
        content: templateContent,
        variables: [
          {
            name: 'task',
            type: 'string',
            description: 'The task to execute',
            required: true,
          },
        ],
      },
    };
  }

  /**
   * Detect pattern type from task description
   */
  private detectPatternType(task: string): QEPatternType {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('test') || taskLower.includes('spec')) {
      if (taskLower.includes('unit')) return 'test-template';
      if (taskLower.includes('integration')) return 'test-template';
      if (taskLower.includes('e2e')) return 'test-template';
      return 'test-template';
    }

    if (taskLower.includes('mock') || taskLower.includes('stub')) {
      return 'mock-pattern';
    }

    if (taskLower.includes('assert') || taskLower.includes('expect')) {
      return 'assertion-pattern';
    }

    if (taskLower.includes('coverage')) {
      return 'coverage-strategy';
    }

    if (taskLower.includes('api') || taskLower.includes('contract')) {
      return 'api-contract';
    }

    if (taskLower.includes('visual') || taskLower.includes('screenshot')) {
      return 'visual-baseline';
    }

    if (taskLower.includes('accessibility') || taskLower.includes('a11y')) {
      return 'a11y-check';
    }

    if (taskLower.includes('performance') || taskLower.includes('perf')) {
      return 'perf-benchmark';
    }

    if (taskLower.includes('flaky')) {
      return 'flaky-fix';
    }

    if (taskLower.includes('refactor')) {
      return 'refactor-safe';
    }

    if (taskLower.includes('error') || taskLower.includes('exception')) {
      return 'error-handling';
    }

    return 'test-template'; // Default
  }

  /**
   * Generate pattern name from experience
   */
  private generatePatternName(experience: TaskExperience): string {
    // Take first 50 chars of task, sanitize
    const sanitized = experience.task
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .slice(0, 50)
      .trim();

    const domain = experience.domain ? `[${experience.domain}] ` : '';
    return `${domain}${sanitized}`;
  }

  /**
   * Extract tags from experience
   */
  private extractTags(experience: TaskExperience): string[] {
    const tags: string[] = [];

    if (experience.domain) {
      tags.push(experience.domain);
    }

    if (experience.agent) {
      tags.push(experience.agent);
    }

    if (experience.model) {
      tags.push(`model:${experience.model}`);
    }

    // Extract keywords from task
    const taskWords = experience.task.toLowerCase().split(/\s+/);
    const keywords = ['unit', 'integration', 'e2e', 'api', 'mock', 'coverage', 'security'];

    for (const keyword of keywords) {
      if (taskWords.some((w) => w.includes(keyword))) {
        tags.push(keyword);
      }
    }

    return tags;
  }

  /**
   * Detect test type from task
   */
  private detectTestType(task: string): 'unit' | 'integration' | 'e2e' | 'contract' | 'smoke' | undefined {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('unit')) return 'unit';
    if (taskLower.includes('integration')) return 'integration';
    if (taskLower.includes('e2e') || taskLower.includes('end-to-end')) return 'e2e';
    if (taskLower.includes('contract') || taskLower.includes('api')) return 'contract';
    if (taskLower.includes('smoke')) return 'smoke';

    return undefined;
  }

  /**
   * Get related domains for cross-domain sharing
   */
  private getRelatedDomains(domain: QEDomain): QEDomain[] {
    const relationships: Record<QEDomain, QEDomain[]> = {
      'test-generation': ['test-execution', 'coverage-analysis'],
      'test-execution': ['test-generation', 'coverage-analysis', 'quality-assessment'],
      'coverage-analysis': ['test-generation', 'test-execution'],
      'quality-assessment': ['test-execution', 'defect-intelligence'],
      'defect-intelligence': ['quality-assessment', 'code-intelligence'],
      'requirements-validation': ['test-generation', 'quality-assessment'],
      'code-intelligence': ['defect-intelligence', 'security-compliance'],
      'security-compliance': ['code-intelligence', 'quality-assessment'],
      'contract-testing': ['test-generation', 'test-execution'],
      'visual-accessibility': ['quality-assessment', 'test-execution'],
      'chaos-resilience': ['test-execution', 'quality-assessment'],
      'learning-optimization': [],
    };

    return relationships[domain] || [];
  }

  /**
   * Emit experience captured event
   */
  private emitExperienceCaptured(experience: TaskExperience): void {
    if (!this.eventBus) return;

    // Emit the full experience for coordinator integration
    this.eventBus.publish({
      id: `exp-captured-${experience.id}`,
      type: 'learning.ExperienceCaptured',
      source: 'learning-optimization', // Use valid DomainName
      timestamp: new Date(),
      payload: {
        experience, // Full experience for cross-domain learning
      },
    });
  }

  /**
   * Load stats from persistence
   */
  private async loadStats(): Promise<void> {
    try {
      const savedStats = await this.memory.get<{
        totalCaptured: number;
        successfulCaptures: number;
        patternsExtracted: number;
        patternsPromoted: number;
        byDomain: [QEDomain, number][];
      }>(`${this.config.namespace}:stats`);

      if (savedStats) {
        this.stats.totalCaptured = savedStats.totalCaptured;
        this.stats.successfulCaptures = savedStats.successfulCaptures;
        this.stats.patternsExtracted = savedStats.patternsExtracted;
        this.stats.patternsPromoted = savedStats.patternsPromoted;
        this.stats.byDomain = new Map(savedStats.byDomain);
      }
    } catch (e) {
      // Start fresh
      logger.debug('Stats restoration failed, starting fresh', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * Save stats to persistence
   */
  private async saveStats(): Promise<void> {
    try {
      await this.memory.set(
        `${this.config.namespace}:stats`,
        {
          totalCaptured: this.stats.totalCaptured,
          successfulCaptures: this.stats.successfulCaptures,
          patternsExtracted: this.stats.patternsExtracted,
          patternsPromoted: this.stats.patternsPromoted,
          byDomain: Array.from(this.stats.byDomain.entries()),
        },
        { persist: true }
      );
    } catch (error) {
      console.error('[ExperienceCapture] Failed to save stats:', error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create experience capture service
 */
export function createExperienceCaptureService(
  memory: MemoryBackend,
  patternStore?: PatternStore,
  eventBus?: EventBus,
  config?: Partial<ExperienceCaptureConfig>
): ExperienceCaptureService {
  return new ExperienceCaptureService(memory, patternStore, eventBus, config);
}
