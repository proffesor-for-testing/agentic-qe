/**
 * TrajectoryAdapter - Bridges @claude-flow/browser trajectories to QEReasoningBank
 *
 * This adapter converts browser automation trajectories (sequences of actions and results)
 * from @claude-flow/browser into QE-compatible patterns that can be stored, learned from,
 * and reused across tests.
 *
 * Key Features:
 * - Converts browser trajectories to QE patterns for learning
 * - Extracts reusable action sequences from successful workflows
 * - Supports similarity matching for trajectory recommendations
 * - Integrates with QEReasoningBank for pattern storage and retrieval
 * - Enables cross-test knowledge transfer for browser automation
 *
 * Pattern Types:
 * - 'browser-trajectory': Full browser interaction sequences
 * - 'visual-workflow': Visual testing workflows (screenshots, assertions)
 *
 * Integration Points:
 * - Input: BrowserTrajectory from @claude-flow/browser
 * - Output: QEPattern for QEReasoningBank
 * - Storage: Uses QE pattern store for persistence
 * - Learning: Feeds into learning-optimization domain
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result, ok, err } from '../shared/types/index.js';
import type { DomainName } from '../shared/types/index.js';
import type { QEPattern, QEPatternType, QEDomain, TestFramework, QEPatternTemplate } from '../learning/qe-patterns.js';
import type { CreateQEPatternOptions } from '../learning/qe-reasoning-bank.js';
import type { Trajectory, TrajectoryStep as AgenticFlowStep } from '../integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { toError } from '../shared/error-utils.js';

// ============================================================================
// Browser Trajectory Types (@claude-flow/browser)
// ============================================================================

/**
 * A single step in a browser trajectory
 */
export interface BrowserTrajectoryStep {
  /** Action performed (e.g., "navigate", "click", "fill", "screenshot") */
  action: string;
  /** Result of the action (e.g., "success", error message) */
  result: string;
  /** Timestamp when the action was performed */
  timestamp: number;
  /** Duration of the action in milliseconds */
  durationMs?: number;
  /** Element target (selector, ref, etc.) */
  target?: string;
  /** Action parameters (URL, text, etc.) */
  parameters?: Record<string, unknown>;
}

/**
 * Context information for a browser trajectory
 */
export interface BrowserContext {
  /** Initial URL of the workflow */
  initialUrl?: string;
  /** Target CSS selectors or refs used */
  targetSelectors?: string[];
  /** Type of workflow (e2e, visual, a11y) */
  workflowType?: 'e2e-testing' | 'visual-regression' | 'accessibility' | 'auth-testing' | 'form-testing';
  /** Browser tool used */
  browserTool?: 'agent-browser' | 'vibium';
  /** Test framework context */
  framework?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A complete browser trajectory with steps and outcome
 */
export interface BrowserTrajectory {
  /** Unique trajectory identifier */
  trajectoryId: string;
  /** Sequence of steps */
  steps: BrowserTrajectoryStep[];
  /** Final outcome */
  outcome: 'success' | 'failure';
  /** Browser context */
  context: BrowserContext;
  /** Total duration in milliseconds */
  totalDurationMs?: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp when trajectory was recorded */
  recordedAt?: Date;
}

/**
 * Learning outcome from a trajectory
 */
export interface LearningOutcome {
  /** Whether the trajectory should be learned from */
  shouldLearn: boolean;
  /** Confidence in the learning (0-1) */
  confidence: number;
  /** Extracted insights */
  insights: string[];
  /** Recommended actions */
  recommendations: string[];
  /** Reward signal for reinforcement learning */
  reward: number;
}

/**
 * Extracted action sequence for reuse
 */
export interface ActionSequence {
  /** Unique identifier */
  id: string;
  /** Sequence name */
  name: string;
  /** Description of what this sequence does */
  description: string;
  /** Steps in the sequence */
  steps: BrowserTrajectoryStep[];
  /** Success rate of this sequence */
  successRate: number;
  /** Number of times this sequence was seen */
  occurrences: number;
  /** Context where this sequence is applicable */
  applicableContext: BrowserContext;
}

/**
 * Action sequence pattern extracted from multiple trajectories
 */
export interface ActionSequencePattern {
  /** Unique identifier */
  id: string;
  /** Actions in sequence */
  actions: string[];
  /** How often this sequence appears */
  frequency: number;
  /** Success rate of this sequence */
  successRate: number;
  /** Trajectory IDs where this sequence was found */
  trajectoryIds: string[];
}

/**
 * Learning outcome from trajectory analysis for RL
 */
export interface TrajectoryLearningOutcome {
  /** Unique outcome identifier */
  id: string;
  /** Source trajectory ID */
  trajectoryId: string;
  /** Lesson learned */
  lesson: string;
  /** Outcome type */
  type: 'success' | 'failure';
  /** Confidence score */
  confidence: number;
  /** Applicable domains */
  domains: (QEDomain | DomainName)[];
  /** When this was recorded */
  timestamp: Date;
}

// ============================================================================
// TrajectoryAdapter Implementation
// ============================================================================

/**
 * Adapter for converting browser trajectories to QE patterns
 */
export class TrajectoryAdapter {
  /**
   * Convert browser trajectory to QE pattern
   *
   * @param trajectory Browser trajectory to convert
   * @returns QE pattern creation options
   */
  toQEPattern(trajectory: BrowserTrajectory): CreateQEPatternOptions {
    const patternType = this.inferPatternType(trajectory);
    const template = this.buildPatternTemplate(trajectory);

    return {
      patternType,
      name: this.generatePatternName(trajectory),
      description: this.generatePatternDescription(trajectory),
      template: {
        type: 'workflow',
        content: JSON.stringify(template, null, 2),
        variables: this.extractVariables(trajectory),
      },
      context: {
        framework: (trajectory.context.framework ?? 'unknown') as TestFramework,
        testType: this.mapWorkflowTypeToTestType(trajectory.context.workflowType),
        tags: this.extractTags(trajectory),
        ...trajectory.context.metadata,
      },
      embedding: undefined, // Will be generated by ReasoningBank if needed
    };
  }

  /**
   * Build complete QEPattern with all metadata (for storage)
   */
  private buildCompleteQEPattern(trajectory: BrowserTrajectory): Record<string, unknown> {
    const options = this.toQEPattern(trajectory);
    const confidence = this.calculateConfidence(trajectory);
    const domain = this.inferDomain(trajectory);

    return {
      ...options,
      id: trajectory.trajectoryId,
      patternType: options.patternType,
      qeDomain: this.mapDomainToQEDomain(domain),
      domain,
      confidence,
      successRate: trajectory.outcome === 'success' ? 1.0 : 0.0,
      usageCount: 1,
      createdAt: trajectory.recordedAt ?? new Date(),
      lastUsed: trajectory.recordedAt ?? new Date(),
      tags: this.extractTags(trajectory),
      metadata: {
        trajectoryId: trajectory.trajectoryId,
        totalDurationMs: trajectory.totalDurationMs,
        stepCount: trajectory.steps.length,
        recordedAt: trajectory.recordedAt?.toISOString(),
        outcome: trajectory.outcome,
        browserTool: trajectory.context.browserTool,
        workflowType: trajectory.context.workflowType,
      },
    };
  }

  /**
   * Convert browser trajectory outcome to learning outcome
   *
   * @param trajectory Browser trajectory
   * @returns Learning outcome with insights
   */
  toLearningOutcome(trajectory: BrowserTrajectory): LearningOutcome {
    const isSuccessful = trajectory.outcome === 'success';
    const hasComplexSteps = trajectory.steps.length > 5;

    // Determine if we should learn from this trajectory
    const shouldLearn = isSuccessful && hasComplexSteps;

    // Calculate confidence
    const confidence = this.calculateLearningConfidence(trajectory);

    // Extract insights
    const insights = this.extractInsights(trajectory);

    // Generate recommendations
    const recommendations = this.generateRecommendations(trajectory);

    // Calculate reward for reinforcement learning
    const reward = this.calculateReward(trajectory);

    return {
      shouldLearn,
      confidence,
      insights,
      recommendations,
      reward,
    };
  }

  /**
   * Extract reusable action sequences from multiple trajectories
   *
   * @param trajectories Array of browser trajectories
   * @returns Array of extracted action sequences
   */
  extractActionSequences(trajectories: BrowserTrajectory[]): ActionSequence[] {
    const sequences: ActionSequence[] = [];

    // Group successful trajectories by workflow type
    const successfulByType = trajectories
      .filter(t => t.outcome === 'success')
      .reduce((acc, t) => {
        const type = t.context.workflowType ?? 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(t);
        return acc;
      }, {} as Record<string, BrowserTrajectory[]>);

    // Extract common sequences within each workflow type
    for (const [workflowType, trajs] of Object.entries(successfulByType)) {
      const commonSequences = this.findCommonSequences(trajs);
      sequences.push(...commonSequences);
    }

    return sequences;
  }

  /**
   * Store trajectory for future similarity matching
   *
   * @param trajectory Browser trajectory to store
   * @returns Result with trajectory ID
   */
  async storeTrajectory(trajectory: BrowserTrajectory): Promise<Result<string, Error>> {
    try {
      const memory = getUnifiedMemory();
      const pattern = this.buildCompleteQEPattern(trajectory);

      // Store in unified memory namespace using kvSet
      const key = `browser-trajectory:${trajectory.trajectoryId}`;
      const valueToStore = {
        pattern,
        metadata: {
          outcome: trajectory.outcome,
          workflowType: trajectory.context.workflowType ?? 'unknown',
          browserTool: trajectory.context.browserTool ?? 'unknown',
        },
      };
      await memory.kvSet(key, valueToStore, 'browser-trajectories');

      return { success: true, value: trajectory.trajectoryId };
    } catch (error) {
      return {
        success: false,
        error: toError(error),
      };
    }
  }

  /**
   * Find similar successful trajectories
   *
   * @param currentContext Browser context to match
   * @returns Array of similar trajectories
   */
  async findSimilarSuccessful(currentContext: BrowserContext): Promise<BrowserTrajectory[]> {
    try {
      const memory = getUnifiedMemory();

      // Search for all browser trajectory keys
      const keys = await memory.kvSearch('browser-trajectory:*', 'browser-trajectories', 100);

      // Convert patterns back to trajectories, filtering by success outcome
      const trajectories: BrowserTrajectory[] = [];
      for (const key of keys) {
        try {
          const item = await memory.kvGet<{
            pattern: Record<string, unknown>;
            metadata: { outcome: string; workflowType: string };
          }>(key, 'browser-trajectories');

          // Filter by outcome and workflowType
          if (
            item &&
            item.metadata.outcome === 'success' &&
            (!currentContext.workflowType || item.metadata.workflowType === currentContext.workflowType)
          ) {
            const trajectory = this.patternRecordToTrajectory(item.pattern);
            if (trajectory && trajectory.outcome === 'success') {
              trajectories.push(trajectory);
            }
          }
        } catch (error) {
          console.error('Error parsing trajectory pattern:', error);
        }
      }

      return trajectories.slice(0, 10); // Limit to 10 results
    } catch (error) {
      console.error('Error finding similar trajectories:', error);
      return [];
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private inferPatternType(trajectory: BrowserTrajectory): QEPatternType {
    const workflowType = trajectory.context.workflowType;

    if (workflowType === 'visual-regression') {
      return 'visual-baseline';
    } else if (workflowType === 'accessibility') {
      return 'a11y-check';
    } else {
      return 'test-template'; // Generic test template for other workflows
    }
  }

  private inferDomain(trajectory: BrowserTrajectory): DomainName {
    const workflowType = trajectory.context.workflowType;

    if (workflowType === 'visual-regression' || workflowType === 'accessibility') {
      return 'visual-accessibility';
    } else {
      return 'test-execution';
    }
  }

  private mapDomainToQEDomain(domain: DomainName): QEDomain {
    // Map DomainName to QEDomain string
    return domain as unknown as QEDomain;
  }

  private mapWorkflowTypeToTestType(
    workflowType?: 'e2e-testing' | 'visual-regression' | 'accessibility' | 'auth-testing' | 'form-testing'
  ): 'unit' | 'integration' | 'e2e' | 'contract' | 'smoke' {
    if (!workflowType) return 'e2e';

    switch (workflowType) {
      case 'e2e-testing':
        return 'e2e';
      case 'visual-regression':
      case 'accessibility':
        return 'e2e'; // Visual and a11y tests are typically e2e
      case 'auth-testing':
      case 'form-testing':
        return 'integration';
      default:
        return 'e2e';
    }
  }

  private buildPatternTemplate(trajectory: BrowserTrajectory): Record<string, unknown> {
    return {
      workflowType: trajectory.context.workflowType,
      initialUrl: trajectory.context.initialUrl,
      steps: trajectory.steps.map(step => ({
        action: step.action,
        target: step.target,
        parameters: step.parameters,
      })),
      expectedOutcome: trajectory.outcome,
      averageDurationMs: trajectory.totalDurationMs,
    };
  }

  private calculateConfidence(trajectory: BrowserTrajectory): number {
    let confidence = 0.5; // Base confidence

    // Successful outcomes increase confidence
    if (trajectory.outcome === 'success') {
      confidence += 0.3;
    }

    // More steps indicate more complex, reliable workflows
    const stepBonus = Math.min(trajectory.steps.length / 20, 0.2);
    confidence += stepBonus;

    // Reasonable duration increases confidence
    const duration = trajectory.totalDurationMs ?? 0;
    if (duration > 0 && duration < 30000) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private calculateLearningConfidence(trajectory: BrowserTrajectory): number {
    const baseConfidence = this.calculateConfidence(trajectory);

    // Adjust based on learning criteria
    let adjustedConfidence = baseConfidence;

    // Failed trajectories have lower learning confidence
    if (trajectory.outcome === 'failure') {
      adjustedConfidence *= 0.3;
    }

    // Very short trajectories (< 3 steps) have lower confidence
    if (trajectory.steps.length < 3) {
      adjustedConfidence *= 0.5;
    }

    return Math.min(adjustedConfidence, 1.0);
  }

  private extractInsights(trajectory: BrowserTrajectory): string[] {
    const insights: string[] = [];

    if (trajectory.outcome === 'success') {
      insights.push(`Successful ${trajectory.context.workflowType ?? 'workflow'} with ${trajectory.steps.length} steps`);

      if (trajectory.totalDurationMs && trajectory.totalDurationMs < 5000) {
        insights.push('Fast execution (< 5s)');
      }

      // Identify common patterns
      const actionTypes = new Set(trajectory.steps.map(s => s.action));
      insights.push(`Uses ${actionTypes.size} distinct action types: ${Array.from(actionTypes).join(', ')}`);
    } else {
      insights.push(`Failed at step ${trajectory.steps.length}`);
      if (trajectory.error) {
        insights.push(`Error: ${trajectory.error}`);
      }
    }

    return insights;
  }

  private generateRecommendations(trajectory: BrowserTrajectory): string[] {
    const recommendations: string[] = [];

    if (trajectory.outcome === 'success') {
      recommendations.push('Consider reusing this workflow as a template');
      if (trajectory.steps.length > 10) {
        recommendations.push('Consider breaking into smaller sequences');
      }
    } else {
      recommendations.push('Review failed step for potential flakiness');
      recommendations.push('Add explicit waits or retry logic');
    }

    return recommendations;
  }

  private calculateReward(trajectory: BrowserTrajectory): number {
    let reward = 0;

    // Base reward for completion
    if (trajectory.outcome === 'success') {
      reward += 10;
    } else {
      reward -= 5;
    }

    // Reward for efficiency
    const duration = trajectory.totalDurationMs ?? 0;
    if (duration > 0 && duration < 10000) {
      reward += 5; // Fast execution
    } else if (duration > 60000) {
      reward -= 3; // Too slow
    }

    // Reward for complexity (more steps = more valuable)
    reward += Math.min(trajectory.steps.length * 0.5, 5);

    return reward;
  }

  private extractTags(trajectory: BrowserTrajectory): string[] {
    const tags: string[] = [];

    if (trajectory.context.workflowType) {
      tags.push(trajectory.context.workflowType);
    }

    if (trajectory.context.browserTool) {
      tags.push(trajectory.context.browserTool);
    }

    tags.push(trajectory.outcome);

    // Add action types as tags
    const actionTypes = new Set(trajectory.steps.map(s => s.action));
    tags.push(...Array.from(actionTypes));

    return tags;
  }

  private extractVariables(trajectory: BrowserTrajectory): Array<{
    readonly name: string;
    readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'code';
    readonly required: boolean;
    readonly defaultValue?: unknown;
    readonly description?: string;
  }> {
    const variables: Array<{
      readonly name: string;
      readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'code';
      readonly required: boolean;
      readonly defaultValue?: unknown;
      readonly description?: string;
    }> = [];

    if (trajectory.context.initialUrl) {
      variables.push({
        name: 'baseUrl',
        type: 'string',
        required: true,
        defaultValue: trajectory.context.initialUrl,
        description: 'Starting URL for the workflow',
      });
    }

    // Extract parameters from steps
    const paramNames = new Set<string>();
    trajectory.steps.forEach(step => {
      if (step.parameters) {
        Object.keys(step.parameters).forEach(key => paramNames.add(key));
      }
    });

    paramNames.forEach(name => {
      variables.push({
        name,
        type: 'string',
        required: false,
        description: `Parameter extracted from step: ${name}`,
      });
    });

    return variables;
  }

  private generatePatternName(trajectory: BrowserTrajectory): string {
    const workflowType = trajectory.context.workflowType ?? 'workflow';
    const outcome = trajectory.outcome;
    const stepCount = trajectory.steps.length;
    return `${workflowType}-${outcome}-${stepCount}steps`;
  }

  private generatePatternDescription(trajectory: BrowserTrajectory): string {
    const workflowType = trajectory.context.workflowType ?? 'workflow';
    const actionSummary = this.summarizeActions(trajectory.steps);
    return `Browser ${workflowType} with ${trajectory.steps.length} steps: ${actionSummary}`;
  }

  private summarizeActions(steps: BrowserTrajectoryStep[]): string {
    const actionCounts = steps.reduce((acc, step) => {
      acc[step.action] = (acc[step.action] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summary = Object.entries(actionCounts)
      .map(([action, count]) => `${action}(${count})`)
      .join(', ');

    return summary;
  }

  private findCommonSequences(trajectories: BrowserTrajectory[]): ActionSequence[] {
    const sequences: ActionSequence[] = [];

    // Simple heuristic: find sequences of 3+ steps that appear in multiple trajectories
    const sequenceMap = new Map<string, { steps: BrowserTrajectoryStep[]; count: number; contexts: BrowserContext[] }>();

    for (const trajectory of trajectories) {
      for (let i = 0; i < trajectory.steps.length - 2; i++) {
        const subSequence = trajectory.steps.slice(i, i + 3);
        const key = subSequence.map(s => s.action).join('->');

        if (!sequenceMap.has(key)) {
          sequenceMap.set(key, { steps: subSequence, count: 0, contexts: [] });
        }

        const entry = sequenceMap.get(key)!;
        entry.count++;
        entry.contexts.push(trajectory.context);
      }
    }

    // Convert to ActionSequence if seen in multiple trajectories
    const entries = [...sequenceMap.entries()];
    for (const [key, value] of entries) {
      if (value.count >= 2) {
        sequences.push({
          id: uuidv4(),
          name: `Common sequence: ${key}`,
          description: `Appears in ${value.count} trajectories`,
          steps: value.steps,
          successRate: 1.0, // All from successful trajectories
          occurrences: value.count,
          applicableContext: value.contexts[0], // Use first context as representative
        });
      }
    }

    return sequences;
  }

  private patternRecordToTrajectory(pattern: Record<string, unknown>): BrowserTrajectory | null {
    try {
      const metadata = pattern.metadata as Record<string, unknown> | undefined;

      if (!metadata?.trajectoryId) {
        return null;
      }

      // Try to parse template back to trajectory
      const template = pattern.template as { content: string } | undefined;
      if (!template) return null;

      const templateData = safeJsonParse(template.content);

      return {
        trajectoryId: String(metadata.trajectoryId),
        steps: templateData.steps ?? [],
        outcome: (metadata.outcome as 'success' | 'failure') ?? 'success',
        context: {
          workflowType: metadata.workflowType as BrowserContext['workflowType'],
          initialUrl: templateData.initialUrl,
          browserTool: metadata.browserTool as BrowserContext['browserTool'],
        },
        totalDurationMs: metadata.totalDurationMs as number | undefined,
        recordedAt: metadata.recordedAt ? new Date(String(metadata.recordedAt)) : undefined,
      };
    } catch (error) {
      console.error('Error converting pattern to trajectory:', error);
      return null;
    }
  }

  // ============================================================================
  // Legacy adapter for agentic-flow trajectories
  // ============================================================================

  /**
   * Convert agentic-flow trajectory to QE pattern
   * @param trajectory The agentic-flow trajectory to convert
   * @returns QE pattern
   */
  static agenticFlowToQEPattern(trajectory: Trajectory): QEPattern {
    const taskName = trajectory.task.replace(/\s+/g, '-').toLowerCase();

    // Build workflow template from trajectory steps
    const stepsContent = trajectory.steps
      .map((step, i) => `Step ${i + 1}: ${step.action} -> ${step.result.outcome}`)
      .join('\n');

    const template: QEPatternTemplate = {
      type: 'workflow',
      content: `# Browser Trajectory: ${trajectory.task}\n\n## Steps\n${stepsContent}\n\n## Variables\n- task: {{task}}\n- url: {{url}}`,
      variables: [
        { name: 'task', type: 'string', required: true, description: 'Task description' },
        { name: 'url', type: 'string', required: false, description: 'Target URL' },
      ],
      example: `Task: ${trajectory.task}`,
    };

    const efficiencyScore = trajectory.metrics.efficiencyScore;

    const now = new Date();
    const pattern: QEPattern = {
      id: trajectory.id,
      patternType: 'test-template',
      qeDomain: trajectory.domain || 'test-execution',
      domain: trajectory.domain || 'test-execution',
      name: `browser-trajectory-${taskName}`,
      description: `Browser automation pattern for: ${trajectory.task}`,
      confidence: efficiencyScore,
      usageCount: 1,
      successRate: efficiencyScore,
      qualityScore: efficiencyScore,
      context: {
        testType: 'e2e',
        relatedDomains: trajectory.domain ? [trajectory.domain] : ['test-execution' as QEDomain],
        tags: [
          'browser',
          'trajectory',
          trajectory.domain || 'test-execution',
          `outcome:${trajectory.outcome}`,
        ],
      },
      template,
      // Required storage metadata
      tier: 'short-term',
      createdAt: trajectory.startedAt,
      lastUsedAt: trajectory.endedAt || now,
      successfulUses: trajectory.outcome === 'success' ? 1 : 0,
      // Token tracking fields
      reusable: trajectory.outcome === 'success',
      reuseCount: 0,
      averageTokenSavings: 0,
    };

    return pattern;
  }

  /**
   * Convert a trajectory to a learning outcome
   * @param trajectory The trajectory to analyze
   * @returns Learning outcome
   */
  static toLearningOutcome(trajectory: Trajectory): TrajectoryLearningOutcome {
    const isSuccess = trajectory.outcome === 'success';
    const actionSequence = trajectory.steps.map((s) => s.action).join(' -> ');
    const failedStep = trajectory.steps.find((s) => s.result.outcome === 'failure')?.action || 'unknown';
    
    const lesson = isSuccess
      ? `Successful browser automation for: ${trajectory.task}. Pattern: ${actionSequence}`
      : `Failed browser automation for: ${trajectory.task}. Error at step: ${failedStep}`;

    return {
      id: uuidv4(),
      trajectoryId: trajectory.id,
      lesson,
      type: isSuccess ? 'success' : 'failure',
      confidence: trajectory.metrics.efficiencyScore,
      domains: [trajectory.domain || 'test-execution'],
      timestamp: trajectory.endedAt || new Date(),
    };
  }

  /**
   * Extract common action sequences from multiple trajectories
   * @param trajectories Array of trajectories to analyze
   * @param minFrequency Minimum frequency to consider a pattern
   * @returns Array of action sequence patterns
   */
  static extractActionSequences(
    trajectories: Trajectory[],
    minFrequency: number = 2
  ): ActionSequencePattern[] {
    const sequences = new Map<string, { trajectoryIds: Set<string>; successes: number; total: number }>();

    // Extract all sequences from trajectories
    for (const trajectory of trajectories) {
      const actions = trajectory.steps.map((s) => s.action);
      const isSuccess = trajectory.outcome === 'success';

      // Generate sequences of length 2-5
      for (let length = 2; length <= Math.min(5, actions.length); length++) {
        for (let i = 0; i <= actions.length - length; i++) {
          const sequence = actions.slice(i, i + length);
          const key = sequence.join('->');

          if (!sequences.has(key)) {
            sequences.set(key, {
              trajectoryIds: new Set([trajectory.id]),
              successes: isSuccess ? 1 : 0,
              total: 1,
            });
          } else {
            const existing = sequences.get(key)!;
            existing.trajectoryIds.add(trajectory.id);
            existing.total += 1;
            if (isSuccess) {
              existing.successes += 1;
            }
          }
        }
      }
    }

    // Convert to ActionSequencePattern array
    const patterns: ActionSequencePattern[] = [];
    for (const [key, data] of sequences.entries()) {
      if (data.trajectoryIds.size >= minFrequency) {
        patterns.push({
          id: uuidv4(),
          actions: key.split('->'),
          frequency: data.trajectoryIds.size,
          successRate: data.total > 0 ? data.successes / data.total : 0,
          trajectoryIds: Array.from(data.trajectoryIds),
        });
      }
    }

    // Sort by frequency (descending)
    patterns.sort((a, b) => b.frequency - a.frequency);

    return patterns;
  }

  /**
   * Store a trajectory as a pattern in unified memory
   * @param trajectory The trajectory to store
   * @returns Success status
   */
  static async storeTrajectory(trajectory: Trajectory): Promise<boolean> {
    try {
      const memory = getUnifiedMemory();
      const pattern = this.agenticFlowToQEPattern(trajectory);

      // Use kvSet to store the pattern
      const key = `trajectory:${trajectory.id}`;
      const valueToStore = {
        pattern: JSON.stringify(pattern),
        metadata: {
          domain: trajectory.domain || 'test-execution',
          outcome: trajectory.outcome,
          efficiencyScore: trajectory.metrics.efficiencyScore.toString(),
          agent: trajectory.agent,
          task: trajectory.task,
        },
      };
      await memory.kvSet(key, valueToStore, 'browser-trajectories');

      return true;
    } catch (error) {
      console.error('Failed to store trajectory:', error);
      return false;
    }
  }

  /**
   * Find similar successful trajectories for a given task
   * @param task Task description
   * @param limit Maximum number of results
   * @returns Array of similar trajectories (as QE patterns)
   */
  static async findSimilarSuccessful(
    task: string,
    limit: number = 5
  ): Promise<QEPattern[]> {
    try {
      const memory = getUnifiedMemory();

      // Search for trajectory keys using kvSearch
      const keys = await memory.kvSearch('trajectory:*', 'browser-trajectories', 100);

      // Retrieve and filter patterns
      const patterns: QEPattern[] = [];
      for (const key of keys) {
        if (patterns.length >= limit) break;

        try {
          const item = await memory.kvGet<{
            pattern: string;
            metadata: { outcome: string; task: string; efficiencyScore: string };
          }>(key, 'browser-trajectories');

          // Filter by success outcome and task similarity (simple substring match)
          if (
            item &&
            item.metadata.outcome === 'success' &&
            (item.metadata.task?.toLowerCase().includes(task.toLowerCase()) ||
             task.toLowerCase().includes(item.metadata.task?.toLowerCase() || ''))
          ) {
            const pattern = safeJsonParse<QEPattern>(item.pattern);
            if (pattern.successRate >= 0.7) {
              patterns.push(pattern);
            }
          }
        } catch {
          // Skip invalid entries
        }
      }

      return patterns;
    } catch (error) {
      console.error('Failed to find similar trajectories:', error);
      return [];
    }
  }
}

/**
 * Factory function to create a TrajectoryAdapter instance
 * (Currently stateless, but allows for future stateful adapters)
 */
export function createTrajectoryAdapter(): typeof TrajectoryAdapter {
  return TrajectoryAdapter;
}
