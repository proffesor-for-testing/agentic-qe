/**
 * Phase2ToolsHandler - Management Tools for Phase 2 Features
 *
 * Implements 15 MCP tools for managing Phase 2 capabilities:
 * - Learning Engine (5 tools)
 * - Pattern Management (5 tools)
 * - Improvement Loop (5 tools)
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import { getSharedMemoryManager } from '../../../core/memory/MemoryManagerFactory';
import { LearningEngine } from '../../../learning/LearningEngine';
import { LearningFeedback } from '../../../learning/types';
import { ImprovementLoop } from '../../../learning/ImprovementLoop';
import { PerformanceTracker } from '../../../learning/PerformanceTracker';
import { QEReasoningBank, TestPattern } from '../../../reasoning/QEReasoningBank';
import { PatternExtractor } from '../../../reasoning/PatternExtractor';

/**
 * Phase2ToolsHandler - Main handler for Phase 2 management tools
 */
export class Phase2ToolsHandler extends BaseHandler {
  private learningEngines: Map<string, LearningEngine>;
  private improvementLoops: Map<string, ImprovementLoop>;
  private performanceTrackers: Map<string, PerformanceTracker>;
  private reasoningBank: QEReasoningBank;
  private patternExtractor: PatternExtractor;
  private memoryStore: SwarmMemoryManager;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    memoryStore?: SwarmMemoryManager
  ) {
    super();
    this.learningEngines = new Map();
    this.improvementLoops = new Map();
    this.performanceTrackers = new Map();
    this.reasoningBank = new QEReasoningBank();
    this.patternExtractor = new PatternExtractor();
    // Use singleton pattern to ensure all components share the same database connection
    // This prevents data fragmentation where data written by one component isn't visible to others
    this.memoryStore = memoryStore || getSharedMemoryManager('.agentic-qe/memory.db');
  }

  /**
   * Main handle method - routes to specific tool handlers
   */
  async handle(args: unknown): Promise<HandlerResponse> {
    throw new Error('Use specific tool methods instead of generic handle()');
  }

  // =========================================================================
  // LEARNING ENGINE TOOLS (5 tools)
  // =========================================================================

  /**
   * Tool 1: learning_status
   * Get learning engine status and performance metrics
   */
  async handleLearningStatus(args: {
    agentId?: string;
    detailed?: boolean;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { agentId, detailed = false } = args;

      if (agentId) {
        // Get specific agent learning status
        const engine = this.learningEngines.get(agentId);

        // Return empty status for agents that don't exist yet (not initialized)
        if (!engine) {
          const status = {
            agentId,
            enabled: false,
            totalExperiences: 0,
            explorationRate: 0.1,
            patterns: [],
            failurePatterns: []
          };
          return this.createSuccessResponse(status, requestId);
        }

        const patterns = (await engine.getPatterns()) || [];
        const failurePatterns = engine.getFailurePatterns() || [];

        const status = {
          agentId,
          enabled: engine.isEnabled(),
          totalExperiences: engine.getTotalExperiences(),
          explorationRate: engine.getExplorationRate(),
          patterns: detailed ? patterns : patterns.slice(0, 5),
          failurePatterns: detailed ? failurePatterns : failurePatterns.slice(0, 3)
        };

        return this.createSuccessResponse(status, requestId);
      } else {
        // Get all agents learning status
        const allStatuses = [];
        for (const [id, engine] of this.learningEngines.entries()) {
          allStatuses.push({
            agentId: id,
            enabled: engine.isEnabled(),
            totalExperiences: engine.getTotalExperiences(),
            explorationRate: engine.getExplorationRate(),
            patternsCount: (await engine.getPatterns()).length,
            failurePatternsCount: engine.getFailurePatterns().length
          });
        }

        return this.createSuccessResponse({
          totalAgents: this.learningEngines.size,
          agents: allStatuses
        }, requestId);
      }
    } catch (error) {
      this.log('error', 'Failed to get learning status', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 2: learning_train
   * Trigger manual learning from task execution
   */
  async handleLearningTrain(args: {
    agentId: string;
    task: Record<string, unknown>;
    result: Record<string, unknown>;
    feedback?: LearningFeedback;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['agentId', 'task', 'result']);
      const { agentId, task, result, feedback } = args;

      // Get or create learning engine
      let engine = this.learningEngines.get(agentId);
      if (!engine) {
        engine = new LearningEngine(agentId, this.memoryStore);
        await engine.initialize();
        this.learningEngines.set(agentId, engine);
      }

      // Learn from execution
      const outcome = await engine.learnFromExecution(task, result, feedback);

      this.log('info', `Learning completed for agent ${agentId}`, {
        improved: outcome.improved,
        improvementRate: outcome.improvementRate
      });

      return this.createSuccessResponse({
        agentId,
        learning: outcome,
        totalExperiences: engine.getTotalExperiences()
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to train learning engine', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 3: learning_history
   * Get learning history and experience replay data
   */
  async handleLearningHistory(args: {
    agentId: string;
    limit?: number;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['agentId']);
      const { agentId, limit = 20 } = args;

      // Retrieve from memory store
      const experiencesKey = `phase2/learning/${agentId}/state`;
      const state = await this.memoryStore.retrieve(experiencesKey, { partition: 'learning' });

      // Return empty history if no state found (agent not trained yet)
      if (!state) {
        return this.createSuccessResponse({
          agentId,
          totalExperiences: 0,
          experiences: [],
          patterns: [],
          performance: {}
        }, requestId);
      }

      const experiences = (state as any).experiences || [];
      const limitedExperiences = experiences.slice(-limit);

      return this.createSuccessResponse({
        agentId,
        totalExperiences: experiences.length,
        experiences: limitedExperiences,
        patterns: (state as any).patterns || [],
        performance: (state as any).performance || {}
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to get learning history', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 4: learning_reset
   * Reset learning state for an agent
   */
  async handleLearningReset(args: {
    agentId: string;
    confirm: boolean;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['agentId', 'confirm']);
      const { agentId, confirm } = args;

      if (!confirm) {
        return this.createErrorResponse(
          'Confirmation required to reset learning state',
          requestId
        );
      }

      // Remove learning engine
      this.learningEngines.delete(agentId);

      // Clear memory state
      const stateKey = `phase2/learning/${agentId}/state`;
      const baselineKey = `phase2/learning/${agentId}/baseline`;
      const configKey = `phase2/learning/${agentId}/config`;

      // Note: SwarmMemoryManager doesn't have delete, so we'll store empty state
      await this.memoryStore.store(stateKey, null, { partition: 'learning' });
      await this.memoryStore.store(baselineKey, null, { partition: 'learning' });
      await this.memoryStore.store(configKey, null, { partition: 'learning' });

      this.log('info', `Learning state reset for agent ${agentId}`);

      return this.createSuccessResponse({
        agentId,
        reset: true,
        timestamp: new Date().toISOString()
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to reset learning state', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 5: learning_export
   * Export learning data for backup or analysis
   */
  async handleLearningExport(args: {
    agentId?: string;
    format?: 'json' | 'csv';
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { agentId, format = 'json' } = args;

      if (agentId) {
        // Export specific agent data
        const stateKey = `phase2/learning/${agentId}/state`;
        const state = await this.memoryStore.retrieve(stateKey, { partition: 'learning' });

        // Return empty data if no state found (agent not trained yet)
        const exportData = state || {
          agentId,
          totalExperiences: 0,
          experiences: [],
          patterns: [],
          performance: {}
        };

        if (format === 'json') {
          return this.createSuccessResponse({
            format: 'json',
            data: exportData
          }, requestId);
        } else {
          // Convert to CSV
          const csv = this.convertToCSV(exportData as any);
          return this.createSuccessResponse({
            format: 'csv',
            data: csv
          }, requestId);
        }
      } else {
        // Export all agents data
        const allData: Record<string, unknown> = {};
        for (const id of this.learningEngines.keys()) {
          const stateKey = `phase2/learning/${id}/state`;
          const state = await this.memoryStore.retrieve(stateKey, { partition: 'learning' });
          if (state) {
            allData[id] = state;
          }
        }

        return this.createSuccessResponse({
          format,
          data: format === 'json' ? allData : this.convertToCSV(allData)
        }, requestId);
      }
    } catch (error) {
      this.log('error', 'Failed to export learning data', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  // =========================================================================
  // PATTERN MANAGEMENT TOOLS (5 tools)
  // =========================================================================

  /**
   * Tool 6: pattern_store
   * Store a new test pattern in the reasoning bank
   */
  async handlePatternStore(args: {
    pattern: TestPattern;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['pattern']);
      const { pattern } = args;

      // Validate pattern structure
      if (!pattern.id || !pattern.name || !pattern.template) {
        return this.createErrorResponse(
          'Invalid pattern: id, name, and template are required',
          requestId
        );
      }

      // Store pattern
      await this.reasoningBank.storePattern(pattern);

      this.log('info', `Pattern stored: ${pattern.id} (${pattern.name})`);

      return this.createSuccessResponse({
        stored: true,
        patternId: pattern.id,
        name: pattern.name,
        category: pattern.category,
        framework: pattern.framework
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to store pattern', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 7: pattern_find
   * Find matching patterns from reasoning bank
   */
  async handlePatternFind(args: {
    query: {
      framework?: string;
      language?: string;
      keywords?: string[];
      codeType?: string;
    };
    minConfidence?: number;
    limit?: number;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['query']);
      const { query, minConfidence = 0.85, limit = 10 } = args;

      // Find matching patterns
      const matches = await this.reasoningBank.findMatchingPatterns(
        {
          codeType: query.codeType || 'test',
          framework: query.framework,
          language: query.language,
          keywords: query.keywords
        },
        limit
      );

      // Filter by confidence
      const filteredMatches = matches.filter(m => m.confidence >= minConfidence);

      this.log('info', `Found ${filteredMatches.length} matching patterns`);

      return this.createSuccessResponse({
        query,
        totalMatches: filteredMatches.length,
        minConfidence,
        patterns: filteredMatches.map(m => ({
          pattern: m.pattern,
          confidence: m.confidence,
          reasoning: m.reasoning,
          applicability: m.applicability
        }))
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to find patterns', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 8: pattern_extract
   * Extract patterns from existing test suite
   */
  async handlePatternExtract(args: {
    testFiles: string[];
    projectId: string;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['testFiles', 'projectId']);
      const { testFiles, projectId } = args;

      this.log('info', `Extracting patterns from ${testFiles.length} files`);

      // Extract patterns
      const result = await this.patternExtractor.extractFromFiles(testFiles);

      // Store extracted patterns in reasoning bank
      // Convert from pattern.types.TestPattern to reasoning.QEReasoningBank.TestPattern
      for (const extractedPattern of result.patterns) {
        try {
          // Map the extracted pattern to the reasoning bank pattern format
          const reasoningPattern: TestPattern = {
            id: extractedPattern.id,
            name: extractedPattern.name,
            description: extractedPattern.template.description,
            category: extractedPattern.category as any,
            framework: extractedPattern.framework as any,
            language: 'typescript', // Default, can be inferred from metadata
            template: JSON.stringify(extractedPattern.template),
            examples: extractedPattern.examples,
            confidence: extractedPattern.confidence,
            usageCount: extractedPattern.frequency || 0,
            successRate: 0.5, // Default success rate for new patterns
            metadata: {
              createdAt: extractedPattern.createdAt,
              updatedAt: extractedPattern.createdAt,
              version: '1.0.0',
              tags: extractedPattern.metadata?.tags || []
            }
          };
          await this.reasoningBank.storePattern(reasoningPattern);
        } catch (error) {
          this.log('warn', `Failed to store pattern ${extractedPattern.id}`, error);
        }
      }

      this.log('info', `Extracted ${result.patterns.length} patterns from ${testFiles.length} files`);

      return this.createSuccessResponse({
        projectId,
        extraction: {
          filesProcessed: result.statistics.filesProcessed,
          patternsExtracted: result.patterns.length,
          processingTime: result.statistics.processingTime,
          patterns: result.patterns.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            confidence: p.confidence,
            sourceFile: p.sourceFile
          }))
        },
        errors: result.errors
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to extract patterns', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 9: pattern_share
   * Share patterns across projects
   */
  async handlePatternShare(args: {
    patternId: string;
    projectIds: string[];
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['patternId', 'projectIds']);
      const { patternId, projectIds } = args;

      // Get pattern
      const pattern = await this.reasoningBank.getPattern(patternId);
      if (!pattern) {
        return this.createErrorResponse(
          `Pattern not found: ${patternId}`,
          requestId
        );
      }

      // Store pattern references in memory for each project
      const sharedWith = [];
      for (const projectId of projectIds) {
        const key = `phase2/patterns/shared/${projectId}/${patternId}`;
        await this.memoryStore.store(key, { ...pattern } as Record<string, unknown>, { partition: 'patterns' });
        sharedWith.push(projectId);
      }

      this.log('info', `Pattern ${patternId} shared with ${projectIds.length} projects`);

      return this.createSuccessResponse({
        patternId,
        pattern: pattern.name,
        sharedWith,
        timestamp: new Date().toISOString()
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to share pattern', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 10: pattern_stats
   * Get pattern bank statistics
   */
  async handlePatternStats(args: {
    framework?: string;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { framework } = args;

      // Get overall statistics
      const stats = await this.reasoningBank.getStatistics();

      // Filter by framework if specified
      let resultStats: typeof stats & { filtered?: boolean; framework?: string } = stats;
      if (framework) {
        const frameworkCount = stats.byFramework[framework] || 0;
        resultStats = {
          ...stats,
          totalPatterns: frameworkCount,
          filtered: true,
          framework
        };
      }

      return this.createSuccessResponse(resultStats, requestId);

    } catch (error) {
      this.log('error', 'Failed to get pattern stats', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  // =========================================================================
  // IMPROVEMENT LOOP TOOLS (5 tools)
  // =========================================================================

  /**
   * Tool 11: improvement_status
   * Get improvement loop status
   */
  async handleImprovementStatus(args: {
    agentId?: string;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { agentId } = args;

      if (agentId) {
        const loop = this.improvementLoops.get(agentId);

        // Return empty status for agents without improvement loop (not started yet)
        if (!loop) {
          return this.createSuccessResponse({
            agentId,
            active: false,
            activeTests: [],
            strategies: []
          }, requestId);
        }

        return this.createSuccessResponse({
          agentId,
          active: loop.isActive(),
          activeTests: loop.getActiveTests(),
          strategies: loop.getStrategies()
        }, requestId);
      } else{
        // Get all improvement loops status
        const statuses = [];
        for (const [id, loop] of this.improvementLoops.entries()) {
          statuses.push({
            agentId: id,
            active: loop.isActive(),
            activeTestsCount: loop.getActiveTests().length,
            strategiesCount: loop.getStrategies().length
          });
        }

        return this.createSuccessResponse({
          totalLoops: this.improvementLoops.size,
          loops: statuses
        }, requestId);
      }
    } catch (error) {
      this.log('error', 'Failed to get improvement status', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 12: improvement_cycle
   * Trigger improvement cycle
   */
  async handleImprovementCycle(args: {
    agentId: string;
    force?: boolean;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['agentId']);
      const { agentId, force = false } = args;

      // Get or create improvement loop
      let loop = this.improvementLoops.get(agentId);
      if (!loop) {
        // Create dependencies
        const learningEngine = this.learningEngines.get(agentId) ||
          new LearningEngine(agentId, this.memoryStore);
        const performanceTracker = this.performanceTrackers.get(agentId) ||
          new PerformanceTracker(agentId, this.memoryStore);

        loop = new ImprovementLoop(agentId, this.memoryStore, learningEngine, performanceTracker);
        await loop.initialize();
        this.improvementLoops.set(agentId, loop);

        // Also store the dependencies
        if (!this.learningEngines.has(agentId)) {
          await learningEngine.initialize();
          this.learningEngines.set(agentId, learningEngine);
        }
        if (!this.performanceTrackers.has(agentId)) {
          await performanceTracker.initialize();
          this.performanceTrackers.set(agentId, performanceTracker);
        }
      }

      // Run improvement cycle
      await loop.runImprovementCycle();

      this.log('info', `Improvement cycle completed for agent ${agentId}`);

      return this.createSuccessResponse({
        agentId,
        cycleCompleted: true,
        timestamp: new Date().toISOString(),
        forced: force
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to run improvement cycle', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 13: improvement_ab_test
   * Run A/B test between strategies
   */
  async handleImprovementABTest(args: {
    strategyA: string;
    strategyB: string;
    iterations?: number;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['strategyA', 'strategyB']);
      const { strategyA, strategyB, iterations = 100 } = args;

      // Create A/B test in a default improvement loop
      const testAgentId = 'ab-test-runner';
      let loop = this.improvementLoops.get(testAgentId);
      if (!loop) {
        const learningEngine = new LearningEngine(testAgentId, this.memoryStore);
        const performanceTracker = new PerformanceTracker(testAgentId, this.memoryStore);
        await learningEngine.initialize();
        await performanceTracker.initialize();

        loop = new ImprovementLoop(testAgentId, this.memoryStore, learningEngine, performanceTracker);
        await loop.initialize();
        this.improvementLoops.set(testAgentId, loop);
      }

      // Create A/B test
      const testId = await loop.createABTest(
        `${strategyA} vs ${strategyB}`,
        [
          { name: strategyA, config: {} },
          { name: strategyB, config: {} }
        ],
        iterations
      );

      this.log('info', `A/B test created: ${testId}`);

      return this.createSuccessResponse({
        testId,
        strategyA,
        strategyB,
        iterations,
        status: 'running',
        message: 'A/B test created. Use improvement_status to monitor progress.'
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to create A/B test', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 14: improvement_failures
   * Get failure patterns and recommendations
   */
  async handleImprovementFailures(args: {
    limit?: number;
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { limit = 10 } = args;

      // Aggregate failure patterns from all learning engines
      const allFailures = [];
      for (const [agentId, engine] of this.learningEngines.entries()) {
        const failures = engine.getFailurePatterns();
        for (const failure of failures) {
          allFailures.push({
            agentId,
            ...failure
          });
        }
      }

      // Sort by frequency
      allFailures.sort((a, b) => b.frequency - a.frequency);

      // Take top N
      const topFailures = allFailures.slice(0, limit);

      // Generate recommendations
      const recommendations = topFailures.map(failure => ({
        pattern: failure.pattern,
        frequency: failure.frequency,
        confidence: failure.confidence,
        agentId: failure.agentId,
        mitigation: failure.mitigation || 'Add comprehensive error handling and fallback mechanisms',
        priority: failure.frequency > 10 ? 'high' : failure.frequency > 5 ? 'medium' : 'low'
      }));

      return this.createSuccessResponse({
        totalFailures: allFailures.length,
        topFailures: recommendations
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to get failure patterns', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Tool 15: performance_track
   * Track performance metrics and improvement
   */
  async handlePerformanceTrack(args: {
    agentId: string;
    metrics: {
      tasksCompleted: number;
      successRate: number;
      averageExecutionTime: number;
      errorRate: number;
      userSatisfaction: number;
      resourceEfficiency: number;
    };
  }): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      this.validateRequired(args, ['agentId', 'metrics']);
      const { agentId, metrics } = args;

      // Get or create performance tracker
      let tracker = this.performanceTrackers.get(agentId);
      if (!tracker) {
        tracker = new PerformanceTracker(agentId, this.memoryStore);
        await tracker.initialize();
        this.performanceTrackers.set(agentId, tracker);
      }

      // Record snapshot with proper structure
      await tracker.recordSnapshot({
        metrics,
        trends: []
      });

      // Calculate improvement
      const improvement = await tracker.calculateImprovement();

      this.log('info', `Performance tracked for agent ${agentId}`, {
        improvementRate: improvement.improvementRate
      });

      return this.createSuccessResponse({
        agentId,
        snapshot: metrics,
        improvement,
        baseline: tracker.getBaseline(),
        snapshotCount: tracker.getSnapshotCount()
      }, requestId);

    } catch (error) {
      this.log('error', 'Failed to track performance', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: unknown): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';

      // Get headers from first object
      const firstRow = data[0] as Record<string, unknown>;
      const headers = Object.keys(firstRow);
      const csv = [headers.join(',')];

      // Add rows
      for (const row of data) {
        const rowObj = row as Record<string, unknown>;
        const values = headers.map(h => JSON.stringify(rowObj[h] || ''));
        csv.push(values.join(','));
      }

      return csv.join('\n');
    } else if (data !== null && typeof data === 'object') {
      // Convert object to CSV
      const csv = ['key,value'];
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        csv.push(`${key},${JSON.stringify(value)}`);
      }
      return csv.join('\n');
    }

    return String(data);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Stop all improvement loops
    for (const loop of this.improvementLoops.values()) {
      await loop.stop();
    }

    this.learningEngines.clear();
    this.improvementLoops.clear();
    this.performanceTrackers.clear();
  }
}
