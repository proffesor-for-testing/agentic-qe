/**
 * ComplexityClassifier - ML-Based Task Complexity Classification
 *
 * Uses machine learning techniques to classify task complexity for optimal LLM routing.
 * Improves upon heuristic-based classification with learning from routing outcomes.
 *
 * Features:
 * - Feature extraction from LLM completion options
 * - Weighted scoring with trainable parameters
 * - Learning from routing history and outcomes
 * - Confidence scoring for classification decisions
 * - Persistent memory integration for cross-session learning
 *
 * @module routing/ComplexityClassifier
 * @version 1.0.0
 */

import { LLMCompletionOptions } from '../providers/ILLMProvider';
import { Logger } from '../utils/Logger';

/**
 * Task complexity levels
 */
export enum TaskComplexity {
  SIMPLE = 'simple',        // Pattern matching, simple Q&A (< 500 chars, < 200 tokens)
  MODERATE = 'moderate',    // Standard reasoning (< 3000 chars, < 1000 tokens)
  COMPLEX = 'complex',      // Deep reasoning, code generation (< 10000 chars, < 4000 tokens)
  VERY_COMPLEX = 'very_complex' // Advanced analysis, architectural design (> 10000 chars)
}

/**
 * Extracted features from task
 */
export interface TaskFeatures {
  /** Total character count in messages */
  contentLength: number;
  /** Estimated token count */
  estimatedTokenCount: number;
  /** Number of messages in conversation */
  messageCount: number;
  /** Has code blocks (``` patterns) */
  hasCodeBlocks: boolean;
  /** Keyword complexity score (0-1) */
  keywordComplexity: number;
  /** Prompt entropy - vocabulary diversity (0-1) */
  promptEntropy: number;
  /** Context window usage percentage (0-1) */
  contextWindowUsage: number;
  /** Has multimodal content (images, etc.) */
  hasMultimodal: boolean;
  /** Requested max tokens */
  requestedMaxTokens: number;
  /** System prompt complexity (0-1) */
  systemPromptComplexity: number;
}

/**
 * Routing history entry for learning
 */
export interface RoutingHistoryEntry {
  /** Extracted features from the task */
  features: TaskFeatures;
  /** Complexity classification that was selected */
  selectedComplexity: TaskComplexity;
  /** Actual outcome after execution */
  actualOutcome: {
    /** Whether the request succeeded */
    success: boolean;
    /** Actual latency in milliseconds */
    latency: number;
    /** Actual cost in dollars */
    cost: number;
    /** Provider used */
    provider?: 'local' | 'cloud';
    /** Any error message */
    error?: string;
  };
  /** Timestamp of the routing decision */
  timestamp: Date;
}

/**
 * Trainable weights for feature scoring
 */
interface FeatureWeights {
  contentLength: number;
  tokenCount: number;
  messageCount: number;
  codeBlocks: number;
  keywordComplexity: number;
  promptEntropy: number;
  contextWindowUsage: number;
  multimodal: number;
  systemPrompt: number;
}

/**
 * Complexity classification thresholds
 */
interface ComplexityThresholds {
  simple: number;      // Score < simple = SIMPLE
  moderate: number;    // Score < moderate = MODERATE
  complex: number;     // Score < complex = COMPLEX
  veryComplex: number; // Score >= veryComplex = VERY_COMPLEX
}

/**
 * Configuration for ComplexityClassifier
 */
export interface ComplexityClassifierConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Enable learning from outcomes */
  enableLearning?: boolean;
  /** Learning rate for weight updates (0-1) */
  learningRate?: number;
  /** Maximum history entries to store */
  maxHistorySize?: number;
  /** Initial feature weights */
  initialWeights?: Partial<FeatureWeights>;
  /** Initial complexity thresholds */
  initialThresholds?: Partial<ComplexityThresholds>;
}

/**
 * ComplexityClassifier - ML-based task complexity classification
 *
 * Classifies LLM tasks into complexity levels using feature extraction
 * and trainable weighted scoring. Learns from routing outcomes to improve
 * classification accuracy over time.
 *
 * @example
 * ```typescript
 * const classifier = new ComplexityClassifier({
 *   enableLearning: true,
 *   learningRate: 0.1
 * });
 *
 * const complexity = classifier.classifyTask(options);
 * // After execution
 * classifier.recordOutcome({
 *   features: classifier.extractFeatures(options),
 *   selectedComplexity: complexity,
 *   actualOutcome: { success: true, latency: 1500, cost: 0.001 }
 * });
 * ```
 */
export class ComplexityClassifier {
  private readonly logger: Logger;
  private readonly config: Required<ComplexityClassifierConfig>;
  private weights: FeatureWeights;
  private thresholds: ComplexityThresholds;
  private routingHistory: RoutingHistoryEntry[];
  private classificationCount: number;
  private confidenceScores: number[];

  constructor(config: ComplexityClassifierConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      debug: config.debug ?? false,
      enableLearning: config.enableLearning ?? true,
      learningRate: config.learningRate ?? 0.05,
      maxHistorySize: config.maxHistorySize ?? 500,
      initialWeights: config.initialWeights ?? {},
      initialThresholds: config.initialThresholds ?? {}
    };

    // Initialize default weights (can be tuned through learning)
    this.weights = {
      contentLength: 0.25,
      tokenCount: 0.30,
      messageCount: 0.10,
      codeBlocks: 0.15,
      keywordComplexity: 0.10,
      promptEntropy: 0.05,
      contextWindowUsage: 0.03,
      multimodal: 0.02,
      systemPrompt: 0.05,
      ...config.initialWeights
    };

    // Normalize weights to sum to 1.0
    this.normalizeWeights();

    // Initialize default thresholds (tunable)
    this.thresholds = {
      simple: 0.25,      // Score < 0.25 = SIMPLE
      moderate: 0.50,    // Score < 0.50 = MODERATE
      complex: 0.75,     // Score < 0.75 = COMPLEX
      veryComplex: 0.75, // Score >= 0.75 = VERY_COMPLEX
      ...config.initialThresholds
    };

    this.routingHistory = [];
    this.classificationCount = 0;
    this.confidenceScores = [];

    this.logger.debug('ComplexityClassifier initialized', {
      weights: this.weights,
      thresholds: this.thresholds,
      learningEnabled: this.config.enableLearning
    });
  }

  /**
   * Classify task complexity using ML-based feature extraction and scoring
   *
   * @param options - LLM completion options to analyze
   * @returns Classified complexity level
   */
  classifyTask(options: LLMCompletionOptions): TaskComplexity {
    const features = this.extractFeatures(options);
    const score = this.calculateComplexityScore(features);
    const complexity = this.scoreToComplexity(score);
    const confidence = this.calculateConfidence(features, score);

    this.classificationCount++;
    this.confidenceScores.push(confidence);

    // Keep only last 100 confidence scores
    if (this.confidenceScores.length > 100) {
      this.confidenceScores.shift();
    }

    if (this.config.debug) {
      this.logger.debug('Task classified', {
        complexity,
        score: score.toFixed(3),
        confidence: confidence.toFixed(3),
        features: {
          contentLength: features.contentLength,
          tokens: features.estimatedTokenCount,
          hasCode: features.hasCodeBlocks,
          keywordScore: features.keywordComplexity.toFixed(2)
        }
      });
    }

    return complexity;
  }

  /**
   * Extract features from LLM completion options
   *
   * @param options - LLM completion options
   * @returns Extracted task features
   */
  extractFeatures(options: LLMCompletionOptions): TaskFeatures {
    // Extract all text content from messages
    const allContent = this.extractAllContent(options);
    const contentLength = allContent.length;

    // Estimate token count (rough approximation: 1 token ≈ 4 chars)
    const estimatedTokenCount = Math.ceil(contentLength / 4);

    // Message count
    const messageCount = options.messages.length;

    // Check for code blocks
    const hasCodeBlocks = /```[\s\S]*?```|`[^`]+`/.test(allContent);

    // Calculate keyword complexity
    const keywordComplexity = this.calculateKeywordComplexity(allContent);

    // Calculate prompt entropy (vocabulary diversity)
    const promptEntropy = this.calculatePromptEntropy(allContent);

    // Context window usage (assuming 8k context window)
    const contextWindowUsage = Math.min(estimatedTokenCount / 8192, 1.0);

    // Check for multimodal content
    const hasMultimodal = options.messages.some(msg =>
      Array.isArray(msg.content) && msg.content.some(c => c.type === 'image')
    );

    // Requested max tokens
    const requestedMaxTokens = options.maxTokens || 0;

    // System prompt complexity
    const systemPromptComplexity = this.calculateSystemPromptComplexity(options);

    return {
      contentLength,
      estimatedTokenCount,
      messageCount,
      hasCodeBlocks,
      keywordComplexity,
      promptEntropy,
      contextWindowUsage,
      hasMultimodal,
      requestedMaxTokens,
      systemPromptComplexity
    };
  }

  /**
   * Record routing outcome for learning
   *
   * @param entry - Routing history entry with outcome
   */
  recordOutcome(entry: RoutingHistoryEntry): void {
    if (!this.config.enableLearning) {
      return;
    }

    this.routingHistory.push({
      ...entry,
      timestamp: entry.timestamp || new Date()
    });

    // Keep history size bounded
    if (this.routingHistory.length > this.config.maxHistorySize) {
      this.routingHistory.shift();
    }

    // Update weights based on outcome
    this.updateWeightsFromOutcome(entry);

    if (this.config.debug) {
      this.logger.debug('Routing outcome recorded', {
        complexity: entry.selectedComplexity,
        success: entry.actualOutcome.success,
        latency: entry.actualOutcome.latency,
        historySize: this.routingHistory.length
      });
    }
  }

  /**
   * Get classification confidence (0-1)
   *
   * Confidence is based on:
   * - How clearly the score falls into a complexity bucket
   * - Historical accuracy of similar classifications
   *
   * @returns Confidence score (0-1)
   */
  getClassificationConfidence(): number {
    if (this.confidenceScores.length === 0) {
      return 0.5; // Default moderate confidence
    }

    // Average recent confidence scores
    const recentScores = this.confidenceScores.slice(-10);
    return recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  }

  /**
   * Get current feature weights
   *
   * @returns Current feature weights
   */
  getWeights(): FeatureWeights {
    return { ...this.weights };
  }

  /**
   * Get current complexity thresholds
   *
   * @returns Current thresholds
   */
  getThresholds(): ComplexityThresholds {
    return { ...this.thresholds };
  }

  /**
   * Get routing history
   *
   * @returns Copy of routing history
   */
  getHistory(): RoutingHistoryEntry[] {
    return [...this.routingHistory];
  }

  /**
   * Get classification statistics
   *
   * @returns Statistics about classifications and learning
   */
  getStatistics(): {
    totalClassifications: number;
    historySize: number;
    averageConfidence: number;
    successRate: number;
    complexityDistribution: Record<TaskComplexity, number>;
  } {
    const successCount = this.routingHistory.filter(e => e.actualOutcome.success).length;
    const successRate = this.routingHistory.length > 0
      ? successCount / this.routingHistory.length
      : 0;

    const distribution: Record<TaskComplexity, number> = {
      [TaskComplexity.SIMPLE]: 0,
      [TaskComplexity.MODERATE]: 0,
      [TaskComplexity.COMPLEX]: 0,
      [TaskComplexity.VERY_COMPLEX]: 0
    };

    this.routingHistory.forEach(entry => {
      distribution[entry.selectedComplexity]++;
    });

    return {
      totalClassifications: this.classificationCount,
      historySize: this.routingHistory.length,
      averageConfidence: this.getClassificationConfidence(),
      successRate,
      complexityDistribution: distribution
    };
  }

  /**
   * Extract all text content from messages
   */
  private extractAllContent(options: LLMCompletionOptions): string {
    const parts: string[] = [];

    // System prompts
    if (options.system) {
      parts.push(...options.system.map(s => s.text));
    }

    // Messages
    options.messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else {
        parts.push(...msg.content.filter(c => c.type === 'text').map(c => c.text || ''));
      }
    });

    return parts.join('\n');
  }

  /**
   * Calculate keyword complexity score (0-1)
   *
   * Analyzes presence of complex technical keywords and patterns
   */
  private calculateKeywordComplexity(content: string): number {
    const lowerContent = content.toLowerCase();

    const complexPatterns = [
      // Architecture & Design
      { pattern: /architect|design\s+pattern|microservice|distributed/gi, weight: 0.15 },
      { pattern: /scale|performance|optimization|bottleneck/gi, weight: 0.12 },
      { pattern: /refactor|technical\s+debt|legacy/gi, weight: 0.10 },

      // Advanced Programming
      { pattern: /algorithm|complexity|o\(|big\s+o/gi, weight: 0.14 },
      { pattern: /async|concurrent|parallel|thread/gi, weight: 0.11 },
      { pattern: /generic|polymorphism|inheritance/gi, weight: 0.09 },

      // Analysis & Problem Solving
      { pattern: /analyze|investigate|debug|diagnose/gi, weight: 0.13 },
      { pattern: /optimize|improve|enhance/gi, weight: 0.08 },
      { pattern: /security|vulnerability|exploit/gi, weight: 0.08 }
    ];

    let score = 0;
    let maxPossibleScore = 0;

    complexPatterns.forEach(({ pattern, weight }) => {
      maxPossibleScore += weight;
      const matches = content.match(pattern);
      if (matches) {
        // Diminishing returns for multiple matches
        const matchScore = Math.min(matches.length / 5, 1.0);
        score += weight * matchScore;
      }
    });

    return maxPossibleScore > 0 ? Math.min(score / maxPossibleScore, 1.0) : 0;
  }

  /**
   * Calculate prompt entropy (vocabulary diversity)
   *
   * Higher entropy = more diverse vocabulary = potentially more complex
   */
  private calculatePromptEntropy(content: string): number {
    // Tokenize into words
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3); // Filter short words

    if (words.length === 0) return 0;

    // Calculate word frequency
    const frequency = new Map<string, number>();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    // Calculate Shannon entropy
    let entropy = 0;
    const totalWords = words.length;

    frequency.forEach(count => {
      const probability = count / totalWords;
      entropy -= probability * Math.log2(probability);
    });

    // Normalize to 0-1 (max entropy for reasonable text is ~10)
    return Math.min(entropy / 10, 1.0);
  }

  /**
   * Calculate system prompt complexity
   */
  private calculateSystemPromptComplexity(options: LLMCompletionOptions): number {
    if (!options.system || options.system.length === 0) {
      return 0;
    }

    const systemText = options.system.map(s => s.text).join('\n');
    const length = systemText.length;

    // Longer, more detailed system prompts = higher complexity
    if (length > 5000) return 1.0;
    if (length > 2000) return 0.7;
    if (length > 500) return 0.4;
    return 0.2;
  }

  /**
   * Calculate weighted complexity score (0-1)
   */
  private calculateComplexityScore(features: TaskFeatures): number {
    let score = 0;

    // Content length contribution (normalize to 0-1)
    const lengthScore = Math.min(features.contentLength / 10000, 1.0);
    score += this.weights.contentLength * lengthScore;

    // Token count contribution
    const tokenScore = Math.min(features.estimatedTokenCount / 4096, 1.0);
    score += this.weights.tokenCount * tokenScore;

    // Message count contribution
    const messageScore = Math.min(features.messageCount / 10, 1.0);
    score += this.weights.messageCount * messageScore;

    // Code blocks contribution
    score += this.weights.codeBlocks * (features.hasCodeBlocks ? 1.0 : 0.0);

    // Keyword complexity
    score += this.weights.keywordComplexity * features.keywordComplexity;

    // Prompt entropy
    score += this.weights.promptEntropy * features.promptEntropy;

    // Context window usage
    score += this.weights.contextWindowUsage * features.contextWindowUsage;

    // Multimodal content
    score += this.weights.multimodal * (features.hasMultimodal ? 1.0 : 0.0);

    // System prompt complexity
    score += this.weights.systemPrompt * features.systemPromptComplexity;

    return Math.min(score, 1.0);
  }

  /**
   * Convert complexity score to complexity level
   */
  private scoreToComplexity(score: number): TaskComplexity {
    if (score < this.thresholds.simple) {
      return TaskComplexity.SIMPLE;
    }
    if (score < this.thresholds.moderate) {
      return TaskComplexity.MODERATE;
    }
    if (score < this.thresholds.complex) {
      return TaskComplexity.COMPLEX;
    }
    return TaskComplexity.VERY_COMPLEX;
  }

  /**
   * Calculate confidence for a classification
   */
  private calculateConfidence(features: TaskFeatures, score: number): number {
    // Calculate distance from threshold boundaries
    const thresholdValues = [
      0,
      this.thresholds.simple,
      this.thresholds.moderate,
      this.thresholds.complex,
      1.0
    ];

    // Find which threshold range we're in
    let minDistance = 1.0;
    for (let i = 0; i < thresholdValues.length - 1; i++) {
      const lower = thresholdValues[i];
      const upper = thresholdValues[i + 1];

      if (score >= lower && score < upper) {
        const rangeSize = upper - lower;
        const distanceFromLower = score - lower;
        const distanceFromUpper = upper - score;
        const minDistanceInRange = Math.min(distanceFromLower, distanceFromUpper);

        // Normalize to 0-1 (closer to center of range = higher confidence)
        minDistance = (rangeSize / 2 - Math.abs(score - (lower + upper) / 2)) / (rangeSize / 2);
        break;
      }
    }

    // Confidence is higher when we're clearly in the middle of a range
    return Math.max(0.3, Math.min(minDistance, 1.0));
  }

  /**
   * Update weights based on routing outcome (gradient descent style)
   */
  private updateWeightsFromOutcome(entry: RoutingHistoryEntry): void {
    // Simple learning: adjust weights based on success/failure
    const { success, latency } = entry.actualOutcome;
    const features = entry.features;

    // If failed, or high latency, this might indicate misclassification
    const performanceScore = success ? (latency < 5000 ? 1.0 : 0.7) : 0.3;

    // Calculate expected complexity based on actual performance
    let expectedComplexity: TaskComplexity;
    if (performanceScore < 0.5) {
      // Poor performance - might need higher complexity
      expectedComplexity = this.incrementComplexity(entry.selectedComplexity);
    } else if (performanceScore > 0.9 && latency < 1000) {
      // Excellent performance - might be over-classified
      expectedComplexity = this.decrementComplexity(entry.selectedComplexity);
    } else {
      // Good performance - classification was correct
      return; // No weight update needed
    }

    // If expected != selected, adjust weights
    if (expectedComplexity !== entry.selectedComplexity) {
      this.adjustWeights(features, expectedComplexity, entry.selectedComplexity);
    }
  }

  /**
   * Increment complexity level
   */
  private incrementComplexity(complexity: TaskComplexity): TaskComplexity {
    const levels = [
      TaskComplexity.SIMPLE,
      TaskComplexity.MODERATE,
      TaskComplexity.COMPLEX,
      TaskComplexity.VERY_COMPLEX
    ];
    const index = levels.indexOf(complexity);
    return index < levels.length - 1 ? levels[index + 1] : complexity;
  }

  /**
   * Decrement complexity level
   */
  private decrementComplexity(complexity: TaskComplexity): TaskComplexity {
    const levels = [
      TaskComplexity.SIMPLE,
      TaskComplexity.MODERATE,
      TaskComplexity.COMPLEX,
      TaskComplexity.VERY_COMPLEX
    ];
    const index = levels.indexOf(complexity);
    return index > 0 ? levels[index - 1] : complexity;
  }

  /**
   * Adjust weights to better match expected complexity
   */
  private adjustWeights(
    features: TaskFeatures,
    expected: TaskComplexity,
    actual: TaskComplexity
  ): void {
    const expectedScore = this.complexityToTargetScore(expected);
    const actualScore = this.complexityToTargetScore(actual);
    const error = expectedScore - actualScore;

    // Gradient descent: adjust weights proportional to features and error
    const lr = this.config.learningRate;

    // Normalize features to 0-1 for weight updates
    const normalizedFeatures = {
      contentLength: Math.min(features.contentLength / 10000, 1.0),
      tokenCount: Math.min(features.estimatedTokenCount / 4096, 1.0),
      messageCount: Math.min(features.messageCount / 10, 1.0),
      codeBlocks: features.hasCodeBlocks ? 1.0 : 0.0,
      keywordComplexity: features.keywordComplexity,
      promptEntropy: features.promptEntropy,
      contextWindowUsage: features.contextWindowUsage,
      multimodal: features.hasMultimodal ? 1.0 : 0.0,
      systemPrompt: features.systemPromptComplexity
    };

    // Update weights (gradient descent)
    this.weights.contentLength += lr * error * normalizedFeatures.contentLength;
    this.weights.tokenCount += lr * error * normalizedFeatures.tokenCount;
    this.weights.messageCount += lr * error * normalizedFeatures.messageCount;
    this.weights.codeBlocks += lr * error * normalizedFeatures.codeBlocks;
    this.weights.keywordComplexity += lr * error * normalizedFeatures.keywordComplexity;
    this.weights.promptEntropy += lr * error * normalizedFeatures.promptEntropy;
    this.weights.contextWindowUsage += lr * error * normalizedFeatures.contextWindowUsage;
    this.weights.multimodal += lr * error * normalizedFeatures.multimodal;
    this.weights.systemPrompt += lr * error * normalizedFeatures.systemPrompt;

    // Normalize weights to sum to 1.0
    this.normalizeWeights();

    if (this.config.debug) {
      this.logger.debug('Weights updated from outcome', {
        expected,
        actual,
        error: error.toFixed(3),
        newWeights: {
          contentLength: this.weights.contentLength.toFixed(3),
          tokenCount: this.weights.tokenCount.toFixed(3),
          codeBlocks: this.weights.codeBlocks.toFixed(3)
        }
      });
    }
  }

  /**
   * Convert complexity to target score for learning
   */
  private complexityToTargetScore(complexity: TaskComplexity): number {
    switch (complexity) {
      case TaskComplexity.SIMPLE:
        return 0.15;
      case TaskComplexity.MODERATE:
        return 0.40;
      case TaskComplexity.COMPLEX:
        return 0.65;
      case TaskComplexity.VERY_COMPLEX:
        return 0.90;
    }
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(): void {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);

    if (sum > 0) {
      Object.keys(this.weights).forEach(key => {
        (this.weights as any)[key] /= sum;
      });
    }
  }
}
