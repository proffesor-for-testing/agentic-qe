/**
 * Model Capability Registry
 *
 * Central registry for tracking LLM model capabilities, performance benchmarks,
 * and intelligent model selection based on task requirements and constraints.
 *
 * @module routing/ModelCapabilityRegistry
 */

export type TaskType =
  | 'test-generation'
  | 'coverage-analysis'
  | 'code-review'
  | 'bug-detection'
  | 'documentation'
  | 'refactoring'
  | 'performance-testing'
  | 'security-scanning';

export interface ModelCapabilities {
  modelId: string;
  provider: 'ollama' | 'openrouter' | 'groq' | 'together' | 'claude' | 'ruvllm';

  // Core specifications
  parameters: string;  // e.g., "30B", "72B"
  contextWindow: number;
  pricing?: {
    inputPer1M: number;   // Cost per 1M input tokens
    outputPer1M: number;  // Cost per 1M output tokens
  };

  // Capabilities
  supportedTasks: TaskType[];
  strengths: string[];
  weaknesses?: string[];

  // Performance benchmarks
  benchmarks?: {
    humanEval?: number;      // Code generation accuracy (0-100)
    sweBench?: number;       // Software engineering tasks (0-100)
    aiderPolyglot?: number;  // Multi-language code editing (0-100)
  };

  // Deployment requirements
  availableOn: string[];    // Platforms where model is available
  requiresGPU: boolean;
  vramRequired?: number;    // GB of VRAM needed for local deployment

  // Quality ratings (0-1 scale)
  qualityRatings?: Partial<Record<TaskType, number>>;
}

export interface ModelConstraints {
  maxCostPer1M?: number;          // Maximum cost per 1M tokens
  requiresLocal?: boolean;        // Must be locally deployable
  preferFree?: boolean;           // Prefer free tier models
  minContextWindow?: number;      // Minimum required context window
  requiredCapabilities?: string[]; // Required capability strings
}

/**
 * Registry for managing model capabilities and intelligent selection
 */
export class ModelCapabilityRegistry {
  private models: Map<string, ModelCapabilities>;

  constructor() {
    this.models = new Map();
  }

  /**
   * Load default model configurations from bundled data
   */
  loadDefaultModels(): void {
    // Models will be loaded from JSON file
    // This method is called during initialization
    const defaultModels = this.getDefaultModelData();
    defaultModels.forEach(model => this.registerModel(model));
  }

  /**
   * Register a new model or update existing model capabilities
   */
  registerModel(model: ModelCapabilities): void {
    this.models.set(model.modelId, model);
  }

  /**
   * Get model capabilities by ID
   */
  getModel(modelId: string): ModelCapabilities | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get all registered models
   */
  getAllModels(): ModelCapabilities[] {
    return Array.from(this.models.values());
  }

  /**
   * Get the best model for a specific task based on complexity and constraints
   *
   * @param task - Type of task to perform
   * @param complexity - Task complexity level
   * @param constraints - Optional constraints (cost, local deployment, etc.)
   * @returns Model ID of the best match, or undefined if no suitable model found
   */
  getBestModelForTask(
    task: TaskType,
    complexity: 'simple' | 'moderate' | 'complex' | 'very_complex',
    constraints?: ModelConstraints
  ): string | undefined {
    // Filter models that support the task
    let candidates = Array.from(this.models.values())
      .filter(model => model.supportedTasks.includes(task));

    // Apply constraints
    if (constraints) {
      candidates = this.applyConstraints(candidates, constraints);
    }

    // If no candidates remain, return undefined
    if (candidates.length === 0) {
      return undefined;
    }

    // Score and rank candidates
    const scored = candidates.map(model => ({
      model,
      score: this.calculateModelScore(model, task, complexity, constraints)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.model.modelId;
  }

  /**
   * Get all models available from a specific provider
   */
  getModelsForProvider(provider: string): ModelCapabilities[] {
    return Array.from(this.models.values())
      .filter(model => model.provider === provider);
  }

  /**
   * Update quality rating for a model on a specific task
   * Used for adaptive learning based on actual performance
   */
  updateQualityRating(modelId: string, task: TaskType, rating: number): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    if (!model.qualityRatings) {
      model.qualityRatings = {};
    }

    // Update rating with exponential moving average (0.3 weight for new rating)
    const currentRating = model.qualityRatings[task] ?? 0.5;
    model.qualityRatings[task] = currentRating * 0.7 + rating * 0.3;
  }

  /**
   * Apply constraints to filter candidate models
   */
  private applyConstraints(
    candidates: ModelCapabilities[],
    constraints: ModelConstraints
  ): ModelCapabilities[] {
    let filtered = candidates;

    // Cost constraint
    if (constraints.maxCostPer1M !== undefined) {
      filtered = filtered.filter(model => {
        if (!model.pricing) return true; // Free models pass
        const avgCost = (model.pricing.inputPer1M + model.pricing.outputPer1M) / 2;
        return avgCost <= constraints.maxCostPer1M!;
      });
    }

    // Local deployment constraint
    if (constraints.requiresLocal) {
      filtered = filtered.filter(model =>
        model.provider === 'ollama' || model.availableOn.includes('local')
      );
    }

    // Free tier preference
    if (constraints.preferFree) {
      const freeModels = filtered.filter(model => !model.pricing ||
        (model.pricing.inputPer1M === 0 && model.pricing.outputPer1M === 0));
      if (freeModels.length > 0) {
        filtered = freeModels;
      }
    }

    // Context window requirement
    if (constraints.minContextWindow) {
      filtered = filtered.filter(model =>
        model.contextWindow >= constraints.minContextWindow!
      );
    }

    // Required capabilities
    if (constraints.requiredCapabilities && constraints.requiredCapabilities.length > 0) {
      filtered = filtered.filter(model =>
        constraints.requiredCapabilities!.every(cap =>
          model.strengths.includes(cap)
        )
      );
    }

    return filtered;
  }

  /**
   * Calculate a score for a model based on task, complexity, and constraints
   * Higher score = better match
   */
  private calculateModelScore(
    model: ModelCapabilities,
    task: TaskType,
    complexity: 'simple' | 'moderate' | 'complex' | 'very_complex',
    constraints?: ModelConstraints
  ): number {
    let score = 0;

    // Base score from quality rating (0-40 points)
    if (model.qualityRatings?.[task]) {
      score += model.qualityRatings[task]! * 40;
    } else {
      score += 20; // Default mid-range score
    }

    // Benchmark scores (0-30 points)
    if (model.benchmarks) {
      const benchmarkScore = (
        (model.benchmarks.humanEval ?? 50) * 0.4 +
        (model.benchmarks.sweBench ?? 50) * 0.4 +
        (model.benchmarks.aiderPolyglot ?? 50) * 0.2
      ) / 100;
      score += benchmarkScore * 30;
    }

    // Complexity matching (0-20 points)
    const complexityScore = this.getComplexityMatchScore(model, complexity);
    score += complexityScore * 20;

    // Cost efficiency (0-10 points)
    if (constraints?.preferFree || constraints?.maxCostPer1M) {
      if (!model.pricing || model.pricing.inputPer1M === 0) {
        score += 10; // Free models get full points
      } else if (model.pricing) {
        const avgCost = (model.pricing.inputPer1M + model.pricing.outputPer1M) / 2;
        const maxCost = constraints?.maxCostPer1M ?? 10;
        score += Math.max(0, 10 * (1 - avgCost / maxCost));
      }
    }

    return score;
  }

  /**
   * Get complexity match score (0-1) based on model size and task complexity
   */
  private getComplexityMatchScore(
    model: ModelCapabilities,
    complexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
  ): number {
    // Extract parameter count (rough approximation)
    const paramMatch = model.parameters.match(/(\d+)B/);
    const paramCount = paramMatch ? parseInt(paramMatch[1]) : 10;

    // Map complexity to ideal parameter range
    const idealParams: Record<string, [number, number]> = {
      simple: [1, 15],        // 1B-15B ideal for simple tasks
      moderate: [10, 40],     // 10B-40B for moderate
      complex: [30, 80],      // 30B-80B for complex
      very_complex: [60, 150] // 60B+ for very complex
    };

    const [min, max] = idealParams[complexity];

    // Calculate match score based on how well param count fits range
    if (paramCount >= min && paramCount <= max) {
      return 1.0; // Perfect match
    } else if (paramCount < min) {
      // Too small - score decreases as we get further from min
      return Math.max(0, 1 - (min - paramCount) / min);
    } else {
      // Too large - minor penalty for being overpowered
      return Math.max(0.5, 1 - (paramCount - max) / (max * 2));
    }
  }

  /**
   * Get default model data
   * Loads from bundled JSON file
   */
  private getDefaultModelData(): ModelCapabilities[] {
    try {
      // Import JSON data directly (works with resolveJsonModule)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const modelData = require('./data/model-capabilities.json');
      return modelData as ModelCapabilities[];
    } catch (error) {
      console.warn('Failed to load model capabilities data:', error);
      return [];
    }
  }
}
