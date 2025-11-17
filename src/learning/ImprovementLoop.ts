/**
 * ImprovementLoop - Phase 2 (Milestone 2.2)
 *
 * Implements continuous improvement loop with pattern recognition,
 * strategy optimization, and A/B testing framework.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { LearningEngine } from './LearningEngine';
import { PerformanceTracker } from './PerformanceTracker';
import { ABTest, FailurePattern, StrategyRecommendation } from './types';

/**
 * Improvement strategy
 */
interface ImprovementStrategy {
  id: string;
  name: string;
  description: string;
  config: any;
  successRate?: number;
  avgImprovement?: number;
  usageCount: number;
  createdAt: Date;
}

/**
 * ImprovementLoop - Continuous learning and optimization
 */
export class ImprovementLoop {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly learningEngine: LearningEngine;
  private readonly performanceTracker: PerformanceTracker;
  private readonly agentId: string;
  private strategies: Map<string, ImprovementStrategy>;
  private activeTests: Map<string, ABTest>;
  private loopInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    learningEngine: LearningEngine,
    performanceTracker: PerformanceTracker
  ) {
    this.logger = Logger.getInstance();
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.learningEngine = learningEngine;
    this.performanceTracker = performanceTracker;
    this.strategies = new Map();
    this.activeTests = new Map();
  }

  /**
   * Initialize the improvement loop
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing ImprovementLoop for agent ${this.agentId}`);

    // Load existing strategies
    await this.loadStrategies();

    // Register default strategies
    await this.registerDefaultStrategies();

    this.logger.info('ImprovementLoop initialized successfully');
  }

  /**
   * Start the continuous improvement loop
   */
  async start(intervalMs: number = 3600000): Promise<void> { // default: 1 hour
    if (this.isRunning) {
      this.logger.warn('ImprovementLoop already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting ImprovementLoop with ${intervalMs}ms interval`);

    // Run immediately
    await this.runImprovementCycle();

    // Schedule periodic runs
    this.loopInterval = setInterval(async () => {
      await this.runImprovementCycle();
    }, intervalMs);
  }

  /**
   * Stop the improvement loop
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = undefined;
    }

    this.logger.info('ImprovementLoop stopped');
  }

  /**
   * Run a single improvement cycle
   */
  async runImprovementCycle(): Promise<{
    improvement: any;
    failurePatternsAnalyzed: number;
    opportunitiesFound: number;
    activeTests: number;
    strategiesApplied: number;
  }> {
    this.logger.info('Running improvement cycle...');

    try {
      // 1. Analyze current performance
      const improvement = await this.performanceTracker.calculateImprovement();
      this.logger.debug(`Current improvement: ${improvement.improvementRate.toFixed(2)}%`);

      // 2. Identify failure patterns
      const failurePatterns = this.learningEngine.getFailurePatterns();
      const failurePatternsAnalyzed = await this.analyzeFailurePatterns(failurePatterns);
      this.logger.debug(`Analyzed ${failurePatternsAnalyzed} failure patterns`);

      // 3. Discover optimization opportunities
      const opportunities = await this.discoverOptimizations();
      this.logger.debug(`Found ${opportunities.length} optimization opportunities`);

      // 4. Run active A/B tests
      await this.updateActiveTests();

      // 5. Apply best strategies (with opt-in check)
      const strategiesApplied = await this.applyBestStrategies();
      this.logger.debug(`Applied ${strategiesApplied} strategies`);

      // 6. Store cycle results
      const cycleResults = {
        timestamp: new Date(),
        improvement,
        failurePatterns: failurePatterns.length,
        failurePatternsAnalyzed,
        opportunities: opportunities.length,
        activeTests: this.activeTests.size,
        strategiesApplied
      };
      await this.storeCycleResults(cycleResults);

      this.logger.info('Improvement cycle completed successfully');

      return {
        improvement,
        failurePatternsAnalyzed,
        opportunitiesFound: opportunities.length,
        activeTests: this.activeTests.size,
        strategiesApplied
      };
    } catch (error) {
      this.logger.error('Error in improvement cycle:', error);
      throw error;
    }
  }

  /**
   * Create A/B test for strategy comparison
   */
  async createABTest(
    name: string,
    strategies: { name: string; config: any }[],
    sampleSize: number = 100
  ): Promise<string> {
    const test: ABTest = {
      id: uuidv4(),
      name,
      strategies,
      sampleSize,
      results: strategies.map(s => ({
        strategy: s.name,
        successRate: 0,
        averageTime: 0,
        sampleCount: 0
      })),
      status: 'running',
      startedAt: new Date()
    };

    this.activeTests.set(test.id, test);

    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/abtests/${test.id}`,
      test,
      { partition: 'learning' }
    );

    this.logger.info(`Created A/B test: ${name} (${test.id})`);

    return test.id;
  }

  /**
   * Record A/B test result
   */
  async recordTestResult(
    testId: string,
    strategyName: string,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    const result = test.results.find(r => r.strategy === strategyName);
    if (!result) {
      throw new Error(`Strategy not found in test: ${strategyName}`);
    }

    // Update result statistics
    result.sampleCount++;
    result.successRate = ((result.successRate * (result.sampleCount - 1)) + (success ? 1 : 0)) / result.sampleCount;
    result.averageTime = ((result.averageTime * (result.sampleCount - 1)) + executionTime) / result.sampleCount;

    // Check if test is complete
    const totalSamples = test.results.reduce((sum, r) => sum + r.sampleCount, 0);
    if (totalSamples >= test.sampleSize) {
      await this.completeABTest(testId);
    } else {
      // Update test in memory
      await this.memoryStore.store(
        `phase2/learning/${this.agentId}/abtests/${testId}`,
        test,
        { partition: 'learning' }
      );
    }
  }

  /**
   * Complete A/B test and determine winner
   */
  private async completeABTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      return;
    }

    // Find best performing strategy
    let bestResult = test.results[0];
    for (const result of test.results) {
      const bestScore = bestResult.successRate * 0.7 + (1 - bestResult.averageTime / 60000) * 0.3;
      const currentScore = result.successRate * 0.7 + (1 - result.averageTime / 60000) * 0.3;

      if (currentScore > bestScore) {
        bestResult = result;
      }
    }

    test.winner = bestResult.strategy;
    test.status = 'completed';
    test.completedAt = new Date();

    // Store completed test
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/abtests/${testId}`,
      test,
      { partition: 'learning' }
    );

    // Remove from active tests
    this.activeTests.delete(testId);

    this.logger.info(`A/B test completed: ${test.name}, winner: ${test.winner}`);

    // Apply winning strategy
    await this.applyStrategy(test.winner);
  }

  /**
   * Analyze failure patterns and suggest mitigations
   */
  private async analyzeFailurePatterns(patterns: FailurePattern[]): Promise<number> {
    const highFrequencyPatterns = patterns.filter(p => p.frequency > 5 && p.confidence > 0.7);
    let analyzedCount = 0;

    for (const pattern of highFrequencyPatterns) {
      // Suggest mitigation if not already present
      if (!pattern.mitigation) {
        const mitigation = await this.suggestMitigation(pattern);
        pattern.mitigation = mitigation;
        analyzedCount++;

        this.logger.info(`Suggested mitigation for pattern ${pattern.pattern}: ${mitigation}`);

        // Store updated pattern
        await this.memoryStore.store(
          `phase2/learning/${this.agentId}/failure-patterns/${pattern.id}`,
          pattern,
          { partition: 'learning' }
        );

        // Emit event for monitoring
        await this.memoryStore.storeEvent({
          type: 'failure_pattern:analyzed',
          payload: { pattern: pattern.pattern, mitigation, confidence: pattern.confidence },
          source: this.agentId,
          timestamp: Date.now()
        });
      }
    }

    return analyzedCount;
  }

  /**
   * Suggest mitigation for failure pattern
   */
  private async suggestMitigation(pattern: FailurePattern): Promise<string> {
    // Simple rule-based mitigation suggestions
    const patternType = pattern.pattern.split(':')[0];

    const mitigations: Record<string, string> = {
      'timeout': 'Increase timeout threshold or implement progress checkpointing',
      'memory': 'Implement memory pooling and garbage collection optimization',
      'validation': 'Add input validation and sanitization before processing',
      'network': 'Implement retry logic with exponential backoff',
      'parsing': 'Add robust error handling for malformed input',
      'permission': 'Implement proper permission checking before operations',
      'default': 'Add comprehensive error handling and fallback mechanisms'
    };

    return mitigations[patternType] || mitigations['default'];
  }

  /**
   * Discover optimization opportunities
   */
  private async discoverOptimizations(): Promise<StrategyRecommendation[]> {
    const opportunities: StrategyRecommendation[] = [];

    // Get learned patterns
    const patterns = await this.learningEngine.getPatterns();

    // Find underutilized high-confidence patterns
    for (const pattern of patterns) {
      if (pattern.confidence > 0.8 && pattern.usageCount < 10) {
        opportunities.push({
          strategy: pattern.pattern,
          confidence: pattern.confidence,
          expectedImprovement: pattern.successRate * 20, // estimate 20% of success rate
          reasoning: `High-confidence pattern (${pattern.confidence.toFixed(2)}) with low usage`,
          alternatives: []
        });
      }
    }

    return opportunities;
  }

  /**
   * Update active A/B tests
   */
  private async updateActiveTests(): Promise<void> {
    for (const [testId, test] of this.activeTests.entries()) {
      const totalSamples = test.results.reduce((sum, r) => sum + r.sampleCount, 0);

      if (totalSamples >= test.sampleSize) {
        await this.completeABTest(testId);
      }
    }
  }

  /**
   * Apply best strategies based on learning (opt-in with high confidence threshold)
   */
  private async applyBestStrategies(): Promise<number> {
    // Check if auto-apply is enabled (opt-in feature)
    const autoApplyEnabled = await this.isAutoApplyEnabled();
    if (!autoApplyEnabled) {
      this.logger.debug('Auto-apply disabled, skipping strategy application');
      return 0;
    }

    // Only apply strategies with very high confidence (>0.9) and success rate (>0.8)
    const patterns = (await this.learningEngine.getPatterns())
      .filter(p => p.confidence > 0.9 && p.successRate > 0.8)
      .slice(0, 3);

    let appliedCount = 0;
    for (const pattern of patterns) {
      const strategyName = pattern.pattern.split(':')[1] || 'default';
      try {
        await this.applyStrategy(strategyName);
        appliedCount++;

        this.logger.info(`Auto-applied strategy: ${strategyName} (confidence: ${pattern.confidence.toFixed(2)}, success: ${pattern.successRate.toFixed(2)})`);
      } catch (error) {
        this.logger.error(`Failed to apply strategy ${strategyName}:`, error);
      }
    }

    return appliedCount;
  }

  /**
   * Check if auto-apply is enabled (opt-in configuration)
   */
  private async isAutoApplyEnabled(): Promise<boolean> {
    try {
      const config = await this.memoryStore.retrieve(
        `phase2/learning/${this.agentId}/auto-apply-config`,
        { partition: 'learning' }
      );
      return config?.enabled === true;
    } catch {
      // Default to disabled for safety
      return false;
    }
  }

  /**
   * Enable or disable auto-apply for best strategies
   */
  async setAutoApply(enabled: boolean): Promise<void> {
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/auto-apply-config`,
      { enabled, updatedAt: new Date() },
      { partition: 'learning' }
    );
    this.logger.info(`Auto-apply ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Apply a strategy
   */
  private async applyStrategy(strategyName: string): Promise<void> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      this.logger.warn(`Strategy not found: ${strategyName}`);
      return;
    }

    strategy.usageCount++;

    // Store strategy application
    await this.memoryStore.storeEvent({
      type: 'strategy:applied',
      payload: { strategy: strategyName, config: strategy.config },
      source: this.agentId,
      timestamp: Date.now()
    });

    this.logger.info(`Applied strategy: ${strategyName}`);
  }

  /**
   * Register default improvement strategies
   */
  private async registerDefaultStrategies(): Promise<void> {
    const defaultStrategies: ImprovementStrategy[] = [
      {
        id: uuidv4(),
        name: 'parallel-execution',
        description: 'Execute tasks in parallel when possible',
        config: { parallelization: 0.8 },
        usageCount: 0,
        createdAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'adaptive-retry',
        description: 'Use adaptive retry policy with exponential backoff',
        config: { retryPolicy: 'exponential', maxRetries: 3 },
        usageCount: 0,
        createdAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'resource-optimization',
        description: 'Optimize resource allocation based on task complexity',
        config: { adaptive: true },
        usageCount: 0,
        createdAt: new Date()
      }
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.name, strategy);
      await this.memoryStore.store(
        `phase2/learning/${this.agentId}/strategies/${strategy.name}`,
        strategy,
        { partition: 'learning' }
      );
    }

    this.logger.info(`Registered ${defaultStrategies.length} default strategies`);
  }

  /**
   * Load strategies from memory
   */
  private async loadStrategies(): Promise<void> {
    try {
      const entries = await this.memoryStore.query(
        `phase2/learning/${this.agentId}/strategies/%`,
        { partition: 'learning' }
      );

      for (const entry of entries) {
        const strategy = entry.value as ImprovementStrategy;
        this.strategies.set(strategy.name, strategy);
      }

      this.logger.info(`Loaded ${this.strategies.size} strategies`);
    } catch (error) {
      this.logger.warn('No previous strategies found');
    }
  }

  /**
   * Store cycle results
   */
  private async storeCycleResults(results: any): Promise<void> {
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/cycles/${results.timestamp.getTime()}`,
      results,
      { partition: 'learning', ttl: 2592000 } // 30 days
    );
  }

  /**
   * Get active A/B tests
   */
  getActiveTests(): ABTest[] {
    return Array.from(this.activeTests.values());
  }

  /**
   * Get all strategies
   */
  getStrategies(): ImprovementStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Check if loop is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
