/**
 * CodeComplexityAnalyzerAgent - Analyzes code complexity with AI-powered recommendations
 *
 * This is a learning example agent that demonstrates:
 * - BaseAgent lifecycle patterns
 * - Memory system integration
 * - Learning engine integration
 * - Event-driven architecture
 * - Agent coordination patterns
 *
 * Purpose: Educational demonstration of the Agentic QE Fleet architecture
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import {
  QEAgentType,
  AgentCapability,
  QETask,
  PostTaskData,
  TaskAssignment
} from '../types';
import { EventEmitter } from 'events';

// ============================================================================
// Simple Logger Interface
// ============================================================================

interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

class ConsoleLogger implements Logger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
}

// ============================================================================
// Configuration
// ============================================================================

export interface CodeComplexityConfig extends BaseAgentConfig {
  thresholds?: {
    cyclomaticComplexity?: number;
    cognitiveComplexity?: number;
    linesOfCode?: number;
  };
  enableRecommendations?: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ComplexityAnalysisRequest {
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  options?: {
    includeRecommendations?: boolean;
    severity?: 'low' | 'medium' | 'high' | 'all';
  };
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  functionCount: number;
  averageComplexityPerFunction: number;
}

export interface ComplexityIssue {
  file: string;
  location: string;
  type: 'cyclomatic' | 'cognitive' | 'size';
  severity: 'low' | 'medium' | 'high' | 'critical';
  current: number;
  threshold: number;
  recommendation?: string;
}

export interface ComplexityAnalysisResult {
  overall: ComplexityMetrics;
  fileMetrics: Map<string, ComplexityMetrics>;
  issues: ComplexityIssue[];
  score: number; // 0-100, higher is better
  recommendations: string[];
  analysisTime: number;
}

// ============================================================================
// Main Agent Class
// ============================================================================

export class CodeComplexityAnalyzerAgent extends BaseAgent {
  protected readonly logger: Logger = new ConsoleLogger();
  private thresholds: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    linesOfCode: number;
  };
  private enableRecommendations: boolean;

  constructor(config: CodeComplexityConfig) {
    // Define agent capabilities
    const capabilities: AgentCapability[] = [
      {
        name: 'complexity-analysis',
        version: '1.0.0',
        description: 'Analyze code complexity metrics'
      },
      {
        name: 'refactoring-recommendations',
        version: '1.0.0',
        description: 'Provide AI-powered refactoring suggestions'
      },
      {
        name: 'pattern-detection',
        version: '1.0.0',
        description: 'Detect complex code patterns'
      }
    ];

    // Initialize base agent with extended config
    super({
      ...config,
      type: QEAgentType.QUALITY_ANALYZER, // Reusing existing type for demo
      capabilities
    });

    // Set thresholds
    this.thresholds = {
      cyclomaticComplexity: config.thresholds?.cyclomaticComplexity ?? 10,
      cognitiveComplexity: config.thresholds?.cognitiveComplexity ?? 15,
      linesOfCode: config.thresholds?.linesOfCode ?? 300
    };

    this.enableRecommendations = config.enableRecommendations ?? true;
  }

  // ============================================================================
  // Core Analysis Methods
  // ============================================================================

  /**
   * Main analysis entry point
   */
  public async analyzeComplexity(
    request: ComplexityAnalysisRequest
  ): Promise<ComplexityAnalysisResult> {
    const startTime = Date.now();

    try {
      // Store request in memory for coordination
      await this.memoryStore.store(
        `aqe/complexity/${this.agentId.id}/current-request`,
        request,
        3600 // 1 hour TTL
      );

      // Analyze each file
      const fileMetrics = new Map<string, ComplexityMetrics>();
      const issues: ComplexityIssue[] = [];

      for (const file of request.files) {
        const metrics = await this.analyzeFile(file);
        fileMetrics.set(file.path, metrics);

        // Detect issues based on thresholds
        const fileIssues = this.detectIssues(file.path, metrics);
        issues.push(...fileIssues);
      }

      // Calculate overall metrics
      const overall = this.calculateOverallMetrics(fileMetrics);

      // Calculate quality score (0-100)
      const score = this.calculateQualityScore(overall, issues);

      // Generate recommendations if enabled
      const recommendations = this.enableRecommendations
        ? await this.generateRecommendations(issues, overall)
        : [];

      const result: ComplexityAnalysisResult = {
        overall,
        fileMetrics,
        issues,
        score,
        recommendations,
        analysisTime: Date.now() - startTime
      };

      // Store results in memory for other agents
      await this.memoryStore.store(
        `aqe/complexity/${this.agentId.id}/latest-result`,
        result,
        86400 // 24 hours TTL
      );

      // Emit completion event for coordination
      this.eventBus.emit('complexity:analysis:completed', {
        agentId: this.agentId,
        result,
        timestamp: new Date()
      });

      return result;
    } catch (error) {
      // Store error in memory
      await this.memoryStore.store(
        `aqe/complexity/${this.agentId.id}/errors/${Date.now()}`,
        {
          error: error instanceof Error ? error.message : String(error),
          request,
          timestamp: new Date()
        },
        604800 // 7 days TTL
      );

      throw error;
    }
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(file: {
    path: string;
    content: string;
    language: string;
  }): Promise<ComplexityMetrics> {
    // Basic complexity calculation (simplified for demo)
    const lines = file.content.split('\n');
    const linesOfCode = lines.filter(line =>
      line.trim() && !line.trim().startsWith('//')
    ).length;

    // Count functions (simplified - looks for 'function' keyword)
    const functionMatches = file.content.match(/function\s+\w+/g) || [];
    const functionCount = functionMatches.length;

    // Calculate cyclomatic complexity (simplified)
    // Count decision points: if, for, while, case, catch, &&, ||
    const decisionPoints = [
      ...(file.content.match(/\b(if|for|while|case|catch)\b/g) || []),
      ...(file.content.match(/(\&\&|\|\|)/g) || [])
    ].length;
    const cyclomaticComplexity = decisionPoints + 1;

    // Cognitive complexity (simplified - similar to cyclomatic but with nesting penalty)
    const nestingLevel = this.calculateMaxNestingLevel(file.content);
    const cognitiveComplexity = cyclomaticComplexity + nestingLevel * 2;

    const averageComplexityPerFunction =
      functionCount > 0 ? cyclomaticComplexity / functionCount : 0;

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      functionCount,
      averageComplexityPerFunction
    };
  }

  /**
   * Calculate maximum nesting level
   */
  private calculateMaxNestingLevel(content: string): number {
    let maxLevel = 0;
    let currentLevel = 0;

    for (const char of content) {
      if (char === '{') {
        currentLevel++;
        maxLevel = Math.max(maxLevel, currentLevel);
      } else if (char === '}') {
        currentLevel = Math.max(0, currentLevel - 1);
      }
    }

    return maxLevel;
  }

  /**
   * Detect complexity issues
   */
  private detectIssues(
    filePath: string,
    metrics: ComplexityMetrics
  ): ComplexityIssue[] {
    const issues: ComplexityIssue[] = [];

    // Check cyclomatic complexity
    if (metrics.cyclomaticComplexity > this.thresholds.cyclomaticComplexity) {
      issues.push({
        file: filePath,
        location: 'overall',
        type: 'cyclomatic',
        severity: this.getSeverity(
          metrics.cyclomaticComplexity,
          this.thresholds.cyclomaticComplexity
        ),
        current: metrics.cyclomaticComplexity,
        threshold: this.thresholds.cyclomaticComplexity,
        recommendation: 'Consider breaking down complex logic into smaller functions'
      });
    }

    // Check cognitive complexity
    if (metrics.cognitiveComplexity > this.thresholds.cognitiveComplexity) {
      issues.push({
        file: filePath,
        location: 'overall',
        type: 'cognitive',
        severity: this.getSeverity(
          metrics.cognitiveComplexity,
          this.thresholds.cognitiveComplexity
        ),
        current: metrics.cognitiveComplexity,
        threshold: this.thresholds.cognitiveComplexity,
        recommendation: 'Reduce nesting levels and simplify control flow'
      });
    }

    // Check file size
    if (metrics.linesOfCode > this.thresholds.linesOfCode) {
      issues.push({
        file: filePath,
        location: 'overall',
        type: 'size',
        severity: this.getSeverity(
          metrics.linesOfCode,
          this.thresholds.linesOfCode
        ),
        current: metrics.linesOfCode,
        threshold: this.thresholds.linesOfCode,
        recommendation: 'Consider splitting this file into smaller modules'
      });
    }

    return issues;
  }

  /**
   * Determine severity based on how much threshold is exceeded
   */
  private getSeverity(
    current: number,
    threshold: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = current / threshold;
    if (ratio >= 2.0) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1.2) return 'medium';
    return 'low';
  }

  /**
   * Calculate overall metrics from file metrics
   */
  private calculateOverallMetrics(
    fileMetrics: Map<string, ComplexityMetrics>
  ): ComplexityMetrics {
    const values = Array.from(fileMetrics.values());
    const count = values.length || 1;

    return {
      cyclomaticComplexity: values.reduce((sum, m) => sum + m.cyclomaticComplexity, 0) / count,
      cognitiveComplexity: values.reduce((sum, m) => sum + m.cognitiveComplexity, 0) / count,
      linesOfCode: values.reduce((sum, m) => sum + m.linesOfCode, 0),
      functionCount: values.reduce((sum, m) => sum + m.functionCount, 0),
      averageComplexityPerFunction: values.reduce((sum, m) => sum + m.averageComplexityPerFunction, 0) / count
    };
  }

  /**
   * Calculate quality score (0-100)
   */
  private calculateQualityScore(
    metrics: ComplexityMetrics,
    issues: ComplexityIssue[]
  ): number {
    let score = 100;

    // Deduct points for issues
    for (const issue of issues) {
      const deduction = {
        low: 5,
        medium: 10,
        high: 20,
        critical: 30
      }[issue.severity];
      score -= deduction;
    }

    // Additional deduction for overall complexity
    const avgComplexity = metrics.averageComplexityPerFunction;
    if (avgComplexity > 20) score -= 10;
    if (avgComplexity > 30) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate AI-powered recommendations
   */
  private async generateRecommendations(
    issues: ComplexityIssue[],
    metrics: ComplexityMetrics
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Group issues by type
    const issuesByType = new Map<string, ComplexityIssue[]>();
    for (const issue of issues) {
      const list = issuesByType.get(issue.type) || [];
      list.push(issue);
      issuesByType.set(issue.type, list);
    }

    // Generate recommendations based on patterns
    if (issuesByType.has('cyclomatic')) {
      recommendations.push(
        'Apply Extract Method refactoring to reduce cyclomatic complexity',
        'Consider using strategy pattern for complex conditional logic'
      );
    }

    if (issuesByType.has('cognitive')) {
      recommendations.push(
        'Use early returns to reduce nesting levels',
        'Extract nested loops into separate methods',
        'Consider using guard clauses to simplify control flow'
      );
    }

    if (issuesByType.has('size')) {
      recommendations.push(
        'Split large files into focused modules following Single Responsibility Principle',
        'Group related functions into separate classes or modules'
      );
    }

    // General recommendations based on metrics
    if (metrics.averageComplexityPerFunction > 15) {
      recommendations.push(
        'Target: Keep function complexity under 10 for better maintainability'
      );
    }

    return recommendations;
  }

  // ============================================================================
  // BaseAgent Lifecycle Hooks (Demonstration)
  // ============================================================================

  /**
   * Pre-task hook - Called before task execution
   * Demonstrates loading context before work
   */
  protected async onPreTask(data: { assignment: any }): Promise<void> {
    this.logger.info('Pre-task hook: Loading complexity analysis context', {
      taskId: data.assignment.id
    });

    // Load historical analysis data for learning
    const historicalData = await this.memoryStore.retrieve(
      `aqe/complexity/${this.agentId.id}/history`
    );

    if (historicalData) {
      this.logger.debug('Loaded historical complexity data', {
        count: historicalData.length
      });
    }
  }

  /**
   * Post-task hook - Called after successful task execution
   * Demonstrates storing results and coordination
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    this.logger.info('Post-task hook: Storing complexity results', {
      taskId: data.assignment.id
    });

    // Store result in history for learning
    const history = await this.memoryStore.retrieve(
      `aqe/complexity/${this.agentId.id}/history`
    ) || [];

    history.push({
      timestamp: new Date(),
      taskId: data.assignment.id,
      result: data.result
    });

    // Keep last 100 results
    if (history.length > 100) {
      history.shift();
    }

    await this.memoryStore.store(
      `aqe/complexity/${this.agentId.id}/history`,
      history,
      2592000 // 30 days
    );

    // Emit event for other agents (e.g., test generator could use this)
    this.eventBus.emit('complexity:analysis:stored', {
      agentId: this.agentId,
      timestamp: new Date()
    });
  }

  /**
   * Task error hook - Called when task fails
   * Demonstrates error handling and recovery
   */
  protected async onTaskError(data: { assignment: any; error: Error }): Promise<void> {
    this.logger.error('Task error hook: Complexity analysis failed', {
      taskId: data.assignment.id,
      error: data.error.message
    });

    // Store error for analysis
    await this.memoryStore.store(
      `aqe/complexity/${this.agentId.id}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date()
      },
      604800 // 7 days
    );
  }

  // ============================================================================
  // BaseAgent Abstract Methods (Required)
  // ============================================================================

  /**
   * Initialize agent components - Called during initialization
   */
  protected async initializeComponents(): Promise<void> {
    this.logger.info('Initializing complexity analyzer components');
    // Agent-specific initialization can go here
  }

  /**
   * Perform task - Called by BaseAgent.executeTask()
   */
  protected async performTask(task: QETask): Promise<ComplexityAnalysisResult> {
    this.logger.info('Performing complexity analysis task', {
      taskId: task.id,
      type: task.type
    });

    const request = task.payload as ComplexityAnalysisRequest;
    return await this.analyzeComplexity(request);
  }

  /**
   * Load agent knowledge - Called during initialization
   */
  protected async loadKnowledge(): Promise<void> {
    this.logger.info('Loading complexity analysis knowledge');

    // Load learned thresholds from previous analyses
    const learnedThresholds = await this.memoryStore.retrieve(
      `aqe/complexity/${this.agentId.id}/learned-thresholds`
    );

    if (learnedThresholds) {
      this.logger.debug('Loaded learned thresholds', learnedThresholds);
      // Could adjust thresholds based on learned data
    }
  }

  /**
   * Clean up agent resources - Called during termination
   */
  protected async cleanup(): Promise<void> {
    this.logger.info('Cleaning up complexity analyzer resources');
    // Clean up any resources (e.g., temp files, connections)
  }
}
