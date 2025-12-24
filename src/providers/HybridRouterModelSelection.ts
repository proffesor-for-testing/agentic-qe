/**
 * HybridRouter Model Selection Module
 *
 * Intelligent model selection integration using ModelCapabilityRegistry.
 * Provides task type detection, constraint-based model selection, and
 * quality rating updates based on actual performance.
 *
 * @module providers/HybridRouterModelSelection
 * @version 1.0.0
 */

import {
  ModelCapabilityRegistry,
  ModelCapabilities,
  ModelConstraints,
  TaskType
} from '../routing/ModelCapabilityRegistry';
import {
  LLMCompletionOptions,
  LLMMessageParam
} from './ILLMProvider';
import { TaskComplexity } from './HybridRouter';

/**
 * Model selection result with primary and alternatives
 */
export interface ModelSelectionResult {
  /** Primary model recommendation */
  primary: ModelCapabilities;
  /** Alternative models (fallback options) */
  alternatives: ModelCapabilities[];
  /** Reasoning for selection */
  reasoning: string;
  /** Confidence in selection (0-1) */
  confidence: number;
}

/**
 * Task type detection patterns
 */
const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  'test-generation': [
    /generat(e|ing)\s+(unit\s+)?test/i,
    /creat(e|ing)\s+test/i,
    /write\s+test/i,
    /test\s+(suite|case|coverage)/i,
    /jest|mocha|vitest|pytest/i,
    /\bspec\b/i
  ],
  'coverage-analysis': [
    /coverage\s+(report|analysis|gap)/i,
    /uncovered\s+(code|line)/i,
    /test\s+coverage/i,
    /code\s+coverage/i,
    /istanbul|nyc|c8/i
  ],
  'code-review': [
    /code\s+review/i,
    /review\s+(this|the)\s+code/i,
    /pull\s+request/i,
    /\bPR\b/i,
    /linting|eslint|prettier/i,
    /code\s+quality/i,
    /best\s+practice/i
  ],
  'bug-detection': [
    /find\s+(bug|issue|defect)/i,
    /detect\s+(bug|issue)/i,
    /debug|debugging/i,
    /stack\s+trace/i,
    /error\s+(message|handling)/i,
    /\bbug\b/i,
    /\bissue\b/i
  ],
  'documentation': [
    /generat(e|ing)\s+doc/i,
    /write\s+doc/i,
    /\bREADME\b/i,
    /API\s+doc/i,
    /JSDoc|TSDoc|Docstring/i,
    /comment\s+(this|the)\s+code/i
  ],
  'refactoring': [
    /refactor/i,
    /clean\s+up/i,
    /improve\s+(code|structure)/i,
    /extract\s+(method|function|class)/i,
    /rename\s+variable/i,
    /\bDRY\b/i,
    /design\s+pattern/i
  ],
  'performance-testing': [
    /performance\s+test/i,
    /load\s+test/i,
    /stress\s+test/i,
    /benchmark/i,
    /latency|throughput/i,
    /response\s+time/i,
    /\bperf\b/i
  ],
  'security-scanning': [
    /security\s+(scan|test|audit)/i,
    /vulnerabilit(y|ies)/i,
    /penetration\s+test/i,
    /\bXSS\b|\bCSRF\b|\bSQL\s+injection/i,
    /authentication|authorization/i,
    /\bOWASP\b/i
  ]
};

/**
 * Complexity mapping from HybridRouter to ModelCapabilityRegistry format
 */
const COMPLEXITY_MAP: Record<TaskComplexity, 'simple' | 'moderate' | 'complex' | 'very_complex'> = {
  [TaskComplexity.SIMPLE]: 'simple',
  [TaskComplexity.MODERATE]: 'moderate',
  [TaskComplexity.COMPLEX]: 'complex',
  [TaskComplexity.VERY_COMPLEX]: 'very_complex'
};

/**
 * HybridRouter Model Selection
 *
 * Provides intelligent model selection capabilities for HybridRouter
 * using ModelCapabilityRegistry for task-aware routing decisions.
 */
export class HybridRouterModelSelection {
  private registry: ModelCapabilityRegistry;

  constructor(registry?: ModelCapabilityRegistry) {
    this.registry = registry || new ModelCapabilityRegistry();

    // Load default models if no custom registry provided
    if (!registry) {
      this.registry.loadDefaultModels();
    }
  }

  /**
   * Detect task type from completion options
   *
   * Analyzes message content to identify the type of task being requested.
   *
   * @param options - LLM completion options
   * @returns Detected task type, or 'code-review' as default
   */
  detectTaskType(options: LLMCompletionOptions): TaskType {
    const content = this.extractContent(options.messages);

    // Track pattern matches for each task type
    const matches: Record<TaskType, number> = {
      'test-generation': 0,
      'coverage-analysis': 0,
      'code-review': 0,
      'bug-detection': 0,
      'documentation': 0,
      'refactoring': 0,
      'performance-testing': 0,
      'security-scanning': 0
    };

    // Test each pattern against content
    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          matches[taskType as TaskType]++;
        }
      }
    }

    // Find task type with most matches
    let maxMatches = 0;
    let detectedType: TaskType = 'code-review'; // Default

    for (const [taskType, count] of Object.entries(matches)) {
      if (count > maxMatches) {
        maxMatches = count;
        detectedType = taskType as TaskType;
      }
    }

    return detectedType;
  }

  /**
   * Select best model for a task
   *
   * @param taskType - Type of task to perform
   * @param complexity - Task complexity level
   * @param constraints - Optional model constraints
   * @returns Model selection with provider, model, and reasoning
   */
  selectBestModel(
    taskType: TaskType,
    complexity: TaskComplexity,
    constraints?: ModelConstraints
  ): { provider: string; model: string; reason: string } {
    const registryComplexity = COMPLEXITY_MAP[complexity];

    const modelId = this.registry.getBestModelForTask(
      taskType,
      registryComplexity,
      constraints
    );

    if (!modelId) {
      // No suitable model found, return default
      return {
        provider: 'claude',
        model: 'claude-sonnet-4',
        reason: `No suitable model found for ${taskType} with given constraints, using default`
      };
    }

    const model = this.registry.getModel(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    // Build reasoning
    const reasons: string[] = [];
    reasons.push(`Best match for ${taskType}`);
    reasons.push(`Complexity: ${complexity}`);

    if (model.qualityRatings?.[taskType]) {
      reasons.push(`Quality rating: ${(model.qualityRatings[taskType]! * 100).toFixed(0)}%`);
    }

    if (constraints?.requiresLocal) {
      reasons.push('Local deployment required');
    }

    if (constraints?.maxCostPer1M) {
      reasons.push(`Cost constraint: $${constraints.maxCostPer1M}/1M`);
    }

    return {
      provider: model.provider,
      model: modelId,
      reason: reasons.join(', ')
    };
  }

  /**
   * Get model recommendation with alternatives
   *
   * @param options - LLM completion options
   * @param constraints - Optional model constraints
   * @returns Primary model and alternatives with reasoning
   */
  getModelRecommendation(
    options: LLMCompletionOptions,
    constraints?: ModelConstraints
  ): ModelSelectionResult {
    // Detect task type from options
    const taskType = this.detectTaskType(options);

    // Analyze complexity (simplified version)
    const complexity = this.estimateComplexity(options);
    const registryComplexity = COMPLEXITY_MAP[complexity];

    // Get primary model
    const primaryId = this.registry.getBestModelForTask(
      taskType,
      registryComplexity,
      constraints
    );

    if (!primaryId) {
      throw new Error(`No suitable models found for task: ${taskType}`);
    }

    const primary = this.registry.getModel(primaryId);
    if (!primary) {
      throw new Error(`Model ${primaryId} not found`);
    }

    // Get alternatives (all models supporting this task, sorted by score)
    const allModels = this.registry.getAllModels()
      .filter(m => m.supportedTasks.includes(taskType) && m.modelId !== primaryId);

    // Apply constraints to alternatives
    let alternatives = allModels;
    if (constraints) {
      alternatives = this.applyConstraintsToModels(alternatives, constraints);
    }

    // Sort by quality rating for this task
    alternatives.sort((a, b) => {
      const ratingA = a.qualityRatings?.[taskType] ?? 0.5;
      const ratingB = b.qualityRatings?.[taskType] ?? 0.5;
      return ratingB - ratingA;
    });

    // Take top 3 alternatives
    alternatives = alternatives.slice(0, 3);

    // Build reasoning
    const reasoning = this.buildSelectionReasoning(
      primary,
      taskType,
      complexity,
      constraints
    );

    // Calculate confidence
    const confidence = this.calculateSelectionConfidence(
      primary,
      taskType,
      alternatives.length
    );

    return {
      primary,
      alternatives,
      reasoning,
      confidence
    };
  }

  /**
   * Update model quality rating after use
   *
   * Adapts quality ratings based on actual performance feedback.
   *
   * @param modelId - Model identifier
   * @param taskType - Type of task performed
   * @param success - Whether the task was successful
   * @param latency - Actual latency in milliseconds
   */
  updateModelQuality(
    modelId: string,
    taskType: TaskType,
    success: boolean,
    latency: number
  ): void {
    // Convert success and latency to rating (0-1)
    let rating = success ? 0.8 : 0.2;

    // Adjust for latency (bonus for fast responses, penalty for slow)
    const expectedLatency = 3000; // 3 seconds baseline
    if (latency < expectedLatency) {
      // Faster than expected: bonus up to +0.2
      const bonus = Math.min(0.2, (expectedLatency - latency) / expectedLatency * 0.2);
      rating = Math.min(1.0, rating + bonus);
    } else if (latency > expectedLatency * 2) {
      // Much slower than expected: penalty up to -0.2
      const penalty = Math.min(0.2, (latency - expectedLatency * 2) / expectedLatency * 0.2);
      rating = Math.max(0.0, rating - penalty);
    }

    this.registry.updateQualityRating(modelId, taskType, rating);
  }

  /**
   * Get registry for direct access
   */
  getRegistry(): ModelCapabilityRegistry {
    return this.registry;
  }

  /**
   * Extract content from messages
   */
  private extractContent(messages: LLMMessageParam[]): string {
    return messages
      .map(m => {
        if (typeof m.content === 'string') {
          return m.content;
        }
        return m.content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join(' ');
      })
      .join(' ');
  }

  /**
   * Estimate complexity from options
   */
  private estimateComplexity(options: LLMCompletionOptions): TaskComplexity {
    const content = this.extractContent(options.messages);
    const contentLength = content.length;
    const maxTokens = options.maxTokens || 0;
    const messageCount = options.messages.length;

    let score = 0;

    // Content length scoring
    if (contentLength > 5000) score += 2;
    else if (contentLength > 2000) score += 1;

    // Max tokens scoring
    if (maxTokens > 4000) score += 2;
    else if (maxTokens > 1000) score += 1;

    // Message count
    if (messageCount > 5) score += 1;

    // Check for code patterns
    if (/```|function|class|import/i.test(content)) {
      score += 1;
    }

    // Check for complex keywords
    if (/architect|design|optimize|refactor|analyze/i.test(content)) {
      score += 1;
    }

    // Map score to complexity
    if (score >= 6) return TaskComplexity.VERY_COMPLEX;
    if (score >= 4) return TaskComplexity.COMPLEX;
    if (score >= 2) return TaskComplexity.MODERATE;
    return TaskComplexity.SIMPLE;
  }

  /**
   * Apply constraints to filter models
   */
  private applyConstraintsToModels(
    models: ModelCapabilities[],
    constraints: ModelConstraints
  ): ModelCapabilities[] {
    let filtered = models;

    if (constraints.maxCostPer1M !== undefined) {
      filtered = filtered.filter(m => {
        if (!m.pricing) return true;
        const avgCost = (m.pricing.inputPer1M + m.pricing.outputPer1M) / 2;
        return avgCost <= constraints.maxCostPer1M!;
      });
    }

    if (constraints.requiresLocal) {
      filtered = filtered.filter(m =>
        m.provider === 'ollama' || m.availableOn.includes('local')
      );
    }

    if (constraints.minContextWindow) {
      filtered = filtered.filter(m =>
        m.contextWindow >= constraints.minContextWindow!
      );
    }

    if (constraints.requiredCapabilities) {
      filtered = filtered.filter(m =>
        constraints.requiredCapabilities!.every(cap =>
          m.strengths.includes(cap)
        )
      );
    }

    return filtered;
  }

  /**
   * Build selection reasoning text
   */
  private buildSelectionReasoning(
    model: ModelCapabilities,
    taskType: TaskType,
    complexity: TaskComplexity,
    constraints?: ModelConstraints
  ): string {
    const reasons: string[] = [];

    reasons.push(`Selected ${model.modelId} for ${taskType}`);
    reasons.push(`Task complexity: ${complexity}`);

    if (model.qualityRatings?.[taskType]) {
      const rating = (model.qualityRatings[taskType]! * 100).toFixed(0);
      reasons.push(`Quality rating: ${rating}%`);
    }

    if (model.benchmarks) {
      const benchmarks: string[] = [];
      if (model.benchmarks.humanEval) {
        benchmarks.push(`HumanEval ${model.benchmarks.humanEval}%`);
      }
      if (model.benchmarks.sweBench) {
        benchmarks.push(`SWE-bench ${model.benchmarks.sweBench}%`);
      }
      if (benchmarks.length > 0) {
        reasons.push(`Benchmarks: ${benchmarks.join(', ')}`);
      }
    }

    if (constraints?.requiresLocal) {
      reasons.push('Local deployment required');
    }

    if (constraints?.maxCostPer1M) {
      reasons.push(`Cost limit: $${constraints.maxCostPer1M}/1M tokens`);
    }

    reasons.push(`Context window: ${model.contextWindow.toLocaleString()} tokens`);

    return reasons.join('. ');
  }

  /**
   * Calculate confidence in selection
   */
  private calculateSelectionConfidence(
    model: ModelCapabilities,
    taskType: TaskType,
    alternativeCount: number
  ): number {
    let confidence = 0.5; // Base confidence

    // Quality rating increases confidence
    if (model.qualityRatings?.[taskType]) {
      confidence = model.qualityRatings[taskType]! * 0.6 + 0.2;
    }

    // Benchmarks increase confidence
    if (model.benchmarks) {
      const avgBenchmark = (
        (model.benchmarks.humanEval || 50) +
        (model.benchmarks.sweBench || 50) +
        (model.benchmarks.aiderPolyglot || 50)
      ) / 300;
      confidence = confidence * 0.7 + avgBenchmark * 0.3;
    }

    // Fewer alternatives = higher confidence in selection
    if (alternativeCount === 0) {
      confidence = Math.min(1.0, confidence + 0.2);
    } else if (alternativeCount > 3) {
      confidence = Math.max(0.0, confidence - 0.1);
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }
}

/**
 * Create a model selection instance with default registry
 */
export function createModelSelection(): HybridRouterModelSelection {
  return new HybridRouterModelSelection();
}
