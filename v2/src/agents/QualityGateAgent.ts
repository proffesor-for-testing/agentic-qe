/**
 * QualityGateAgent - Intelligent quality gate evaluation with decision trees
 * Implements SPARC Phase 2 Section 7.1 - Intelligent Quality Gate Algorithm
 *
 * Enhanced with full learning support (v2.3.5):
 * - LearningEngine for Q-learning and pattern discovery
 * - ExperienceCapture for Nightly-Learner integration
 * - Pattern caching for confidence boosting
 *
 * Phase 0.5 (v2.5.9) - Migrated to BaseAgent for RuVector integration
 */

import { SecureRandom } from '../utils/SecureRandom.js';
import {
  AgentId,
  AgentStatus,
  QualityMetrics,
  QETestResult,
  QETask
} from '../types';
import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { ExperienceCapture, AgentExecutionEvent, CaptureStats } from '../learning/capture/ExperienceCapture';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { Logger } from '../utils/Logger';

export interface QualityGateRequest {
  testResults: QETestResult[];
  metrics: QualityMetrics;
  context?: {
    deploymentTarget?: 'development' | 'staging' | 'production';
    criticality?: 'low' | 'medium' | 'high' | 'critical';
    changes?: Array<{
      file: string;
      type: 'added' | 'modified' | 'deleted';
      complexity: number;
    }>;
    environment?: string;
  };
  customCriteria?: QualityCriterion[];
}

export interface QualityCriterion {
  name: string;
  threshold: number;
  weight: number;
  type: 'minimum_threshold' | 'maximum_threshold' | 'range' | 'trend';
  critical: boolean;
}

export interface QualityGateDecision {
  decision: 'PASS' | 'FAIL' | 'ESCALATE';
  score: number;
  threshold: number;
  criteriaEvaluations: CriterionEvaluation[];
  riskFactors: RiskFactor[];
  explanation: string;
  recommendations: string[];
  confidence: number;
  metadata: {
    evaluationTime: Date;
    context: QualityGateContext;
    decisionTreeVersion: string;
  };
}

export interface CriterionEvaluation {
  criterion: QualityCriterion;
  value: number;
  passed: boolean;
  score: number;
  impact: string;
}

export interface RiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  impact: string;
  mitigation: string[];
}

/**
 * Represents a code change with file path, type, and complexity score
 */
export interface CodeChange {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  complexity: number;
}

/**
 * Context for quality gate evaluation including deployment info and changes
 */
export interface QualityGateContext {
  deploymentTarget?: 'development' | 'staging' | 'production';
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  changes?: CodeChange[];
  environment?: string;
}

/**
 * Normalized quality metrics for threshold evaluation
 */
export interface NormalizedMetrics {
  test_coverage: number;
  test_success_rate: number;
  security_vulnerabilities: number;
  performance_regression: number;
  code_quality_score: number;
  [key: string]: number; // Allow additional metrics
}

/**
 * Decision engine performance metrics
 */
export interface DecisionPerformanceMetrics {
  decisionsEvaluated: number;
  averageDecisionTime: number;
  lastDecisionConfidence: number;
}

/**
 * Complexity factors for quality state analysis
 */
export interface ComplexityFactors {
  highFailureRate: boolean;
  securityVulnerabilities: boolean;
  performanceIssues: boolean;
}

/**
 * Complexity indicators for determining if special reasoning is needed
 */
export interface ComplexityIndicators {
  high: boolean;
  score: number;
  factors: ComplexityFactors;
}

/**
 * Historical gate decision record for learning
 */
export interface HistoricalGateDecision {
  decision: 'PASS' | 'FAIL' | 'ESCALATE';
  score: number;
  confidence: number;
  context: QualityGateContext;
  timestamp: Date;
}

/**
 * Database pattern record with metadata
 */
export interface DBPatternRecord {
  pattern: string;
  confidence: number;
  metadata?: {
    agent_type?: string;
    success_rate?: number;
    [key: string]: unknown;
  };
}

/**
 * Learning engine status information
 */
export interface LearningEngineStatus {
  enabled: boolean;
  totalExperiences: number;
  explorationRate: number;
  patterns: number;
}

// CaptureStats is imported from ExperienceCapture module

/**
 * Decision tree structure returned by consciousness engine
 */
export interface DecisionTree {
  version: string;
  structure: string;
  adaptationLevel: number;
}

/**
 * Parameters for building a decision tree
 */
export interface DecisionTreeParams {
  context: QualityGateContext;
  historicalDecisions: HistoricalGateDecision[];
  adaptationLevel: number;
}

/**
 * Reasoning result from psycho-symbolic reasoner
 */
export interface ReasoningResult {
  reasoning: string;
  confidence: number;
  recommendations: string[];
}

/**
 * Parameters for psycho-symbolic reasoning
 */
export interface ReasoningParams {
  query: string;
  context: {
    testResults: QETestResult[];
    metrics: NormalizedMetrics;
    deploymentContext: QualityGateContext;
    complexityFactors: ComplexityIndicators;
  };
  depth: number;
}

// ============================================================================
// Configuration - Extends BaseAgentConfig for RuVector integration
// ============================================================================

export interface QualityGateConfig extends BaseAgentConfig {
  customCriteria?: QualityCriterion[];
  defaultThreshold?: number;  // Default: 0.8
}

export class QualityGateAgent extends BaseAgent {
  private decisionEngine: DecisionEngine;
  private consciousnessEngine: ConsciousnessEngine;
  private psychoSymbolicReasoner: PsychoSymbolicReasoner;
  private riskAnalyzer: RiskAnalyzer;
  private qualityGateLogger: Logger;

  // ExperienceCapture for Nightly-Learner integration
  private experienceCapture?: ExperienceCapture;

  // Cached patterns for confidence boosting
  private cachedPatterns: Array<{ pattern: string; confidence: number; successRate: number }> = [];
  private historicalDecisionAccuracy: number = 0.5;

  // Default quality criteria based on industry standards
  private readonly defaultCriteria: QualityCriterion[] = [
    { name: 'test_coverage', threshold: 0.85, weight: 0.25, type: 'minimum_threshold', critical: true },
    { name: 'test_success_rate', threshold: 0.95, weight: 0.30, type: 'minimum_threshold', critical: true },
    { name: 'security_vulnerabilities', threshold: 0, weight: 0.20, type: 'maximum_threshold', critical: true },
    { name: 'performance_regression', threshold: 0.10, weight: 0.15, type: 'maximum_threshold', critical: false },
    { name: 'code_quality_score', threshold: 0.80, weight: 0.10, type: 'minimum_threshold', critical: false }
  ];

  constructor(config: QualityGateConfig) {
    super(config);
    this.qualityGateLogger = Logger.getInstance();
    this.decisionEngine = new DecisionEngine();
    this.consciousnessEngine = new ConsciousnessEngine();
    this.psychoSymbolicReasoner = new PsychoSymbolicReasoner();
    this.riskAnalyzer = new RiskAnalyzer();
  }

  /**
   * Get string representation of agent ID (handles AgentId object or string)
   */
  private getAgentIdStr(): string {
    const agentId = super.getAgentId();
    return typeof agentId === 'string' ? agentId : agentId.id;
  }

  // ============================================================================
  // BaseAgent Abstract Method Implementations
  // ============================================================================

  /**
   * Initialize agent-specific components
   * Called by BaseAgent.initialize()
   */
  protected async initializeComponents(): Promise<void> {
    // Initialize decision engines
    await this.decisionEngine.initialize();
    await this.consciousnessEngine.initialize();
    await this.psychoSymbolicReasoner.initialize();
    await this.riskAnalyzer.initialize();

    // Initialize ExperienceCapture for Nightly-Learner integration
    this.experienceCapture = await ExperienceCapture.getSharedInstance();
    this.qualityGateLogger.info('[QualityGate] ExperienceCapture initialized for Nightly-Learner');

    // Load historical decision patterns
    await this.loadDecisionPatterns();

    // Load and cache patterns for confidence boosting
    await this.loadAndCachePatternsForConfidence();

    // Store initialization state
    const memoryStore = this.memoryStore;
    if (memoryStore) {
      await memoryStore.set('quality-gate-initialized', true, 'agents');
    }

    this.qualityGateLogger.info(`[QualityGate] Initialized with learning: ${!!this.learningEngine}, patterns cached: ${this.cachedPatterns.length}`);
  }

  /**
   * Execute a QE task - implements BaseAgent abstract method
   */
  protected async performTask(task: QETask): Promise<QualityGateDecision> {
    // Task payload contains the QualityGateRequest
    const request = task.payload as QualityGateRequest;
    return await this.evaluateQualityGate(request);
  }

  /**
   * Load knowledge/patterns - implements BaseAgent abstract method
   */
  protected async loadKnowledge(): Promise<void> {
    await this.loadDecisionPatterns();
    await this.loadAndCachePatternsForConfidence();
  }

  /**
   * Cleanup agent resources - implements BaseAgent abstract method
   */
  protected async cleanup(): Promise<void> {
    // Save learned decision patterns
    await this.saveDecisionPatterns();

    // Cleanup resources
    await this.decisionEngine.cleanup();
    await this.consciousnessEngine.cleanup();
    await this.psychoSymbolicReasoner.cleanup();
    await this.riskAnalyzer.cleanup();
  }

  /**
   * Get quality gate specific status
   */
  getQualityGateStatus(): {
    agentId: string;
    capabilities: string[];
    performance: DecisionPerformanceMetrics;
  } {
    return {
      agentId: this.getAgentIdStr(),
      capabilities: ['quality-evaluation', 'risk-analysis', 'decision-making'],
      performance: {
        decisionsEvaluated: this.decisionEngine.getDecisionCount(),
        averageDecisionTime: this.decisionEngine.getAverageTime(),
        lastDecisionConfidence: this.decisionEngine.getLastConfidence()
      }
    };
  }

  // ============================================================================
  // Core Quality Gate Evaluation - SPARC Algorithm 7.1
  // ============================================================================

  /**
   * Evaluate quality gate using intelligent decision tree
   * Based on SPARC Phase 2 Algorithm: EvaluateQualityGate
   */
  private async evaluateQualityGate(request: QualityGateRequest): Promise<QualityGateDecision> {
    const startTime = Date.now();

    try {

      // Provide default context if missing
      const context = request.context || {
        deploymentTarget: 'development' as const,
        criticality: 'medium' as const,
        changes: [],
        environment: process.env.NODE_ENV || 'development'
      };

      // Phase 1: Initialize Decision Tree using Consciousness Framework
      const decisionTree = await this.consciousnessEngine.buildDecisionTree({
        context,
        historicalDecisions: await this.getHistoricalGateDecisions(),
        adaptationLevel: 0.8
      });

      // Phase 2: Collect and Normalize Metrics
      const normalizedMetrics = await this.normalizeQualityMetrics(request.metrics);

      // Phase 3: Apply Psycho-Symbolic Reasoning for Complex Cases
      const complexityIndicators = await this.detectComplexityIndicators(
        request.testResults,
        request.metrics
      );

      if (complexityIndicators.high) {
        const reasoningResult = await this.psychoSymbolicReasoner.reason({
          query: 'Should deployment proceed given complex quality state?',
          context: {
            testResults: request.testResults,
            metrics: normalizedMetrics,
            deploymentContext: context,
            complexityFactors: complexityIndicators
          },
          depth: 5
        });

        if (reasoningResult.confidence < 0.7) {
          // Escalate to human review
          return {
            decision: 'ESCALATE',
            score: reasoningResult.confidence,
            threshold: 0.7,
            criteriaEvaluations: [],
            riskFactors: await this.analyzeRiskFactors(context, []),
            explanation: reasoningResult.reasoning,
            recommendations: ['Human review required due to complex quality state'],
            confidence: reasoningResult.confidence,
            metadata: {
              evaluationTime: new Date(),
              context,
              decisionTreeVersion: decisionTree.version
            }
          };
        }
      }

      // Phase 4: Evaluate Core Quality Criteria
      const criteria = request.customCriteria || this.defaultCriteria;
      const evaluationResults: CriterionEvaluation[] = [];
      let totalScore = 0.0;

      for (const criterion of criteria) {
        const metricValue = await this.getMetricValue(normalizedMetrics, criterion.name);
        const passed = await this.evaluateCriterion(criterion, metricValue);
        const score = await this.calculateCriterionScore(criterion, metricValue);

        const evaluationResult: CriterionEvaluation = {
          criterion,
          value: metricValue,
          passed,
          score,
          impact: await this.calculateImpact(criterion, metricValue, context)
        };

        evaluationResults.push(evaluationResult);
        totalScore += score * criterion.weight;
      }

      // Phase 5: Apply Dynamic Threshold Adjustment
      const adjustedThreshold = await this.calculateDynamicThreshold(
        context,
        normalizedMetrics
      );

      // Phase 6: Make Final Decision
      const baseDecision = totalScore >= adjustedThreshold ? 'PASS' : 'FAIL';

      // Phase 7: Apply Risk-Based Overrides
      const riskFactors = await this.analyzeRiskFactors(context, evaluationResults);
      const finalDecision = await this.applyRiskBasedLogic(baseDecision, riskFactors);

      // Phase 8: Generate Explanation and Recommendations
      const explanation = await this.generateDecisionExplanation(evaluationResults, finalDecision);
      const recommendations = await this.generateQualityRecommendations(
        evaluationResults,
        context
      );

      const gateDecision: QualityGateDecision = {
        decision: finalDecision as 'PASS' | 'FAIL' | 'ESCALATE',
        score: totalScore,
        threshold: adjustedThreshold,
        criteriaEvaluations: evaluationResults,
        riskFactors,
        explanation,
        recommendations,
        confidence: await this.calculateDecisionConfidence(evaluationResults),
        metadata: {
          evaluationTime: new Date(),
          context,
          decisionTreeVersion: decisionTree.version
        }
      };

      // Phase 9: Learn from Decision using LearningEngine
      await this.storeLearningData(gateDecision, request.testResults, request.metrics);

      // Store decision for future learning
      await this.storeDecisionResult(gateDecision, Date.now() - startTime);

      // Learn from execution with Q-learning
      const executionTime = Date.now() - startTime;
      if (this.learningEngine) {
        await this.learningEngine.learnFromExecution(
          {
            id: `quality-gate-${Date.now()}`,
            type: 'quality-gate-evaluation',
            requirements: {
              capabilities: ['quality-evaluation', 'risk-analysis']
            }
          },
          {
            success: gateDecision.decision !== 'FAIL',
            executionTime,
            strategy: 'decision-tree',
            confidence: gateDecision.confidence,
            toolsUsed: ['decision-engine', 'consciousness-engine', 'risk-analyzer'],
            score: gateDecision.score
          }
        );
      }

      // Track performance
      if (this.performanceTracker) {
        await this.performanceTracker.recordSnapshot({
          metrics: {
            tasksCompleted: 1,
            successRate: gateDecision.decision === 'PASS' ? 1 : 0,
            averageExecutionTime: executionTime,
            errorRate: gateDecision.decision === 'FAIL' ? 1 : 0,
            userSatisfaction: gateDecision.confidence,
            resourceEfficiency: gateDecision.score
          },
          trends: []
        });
      }

      // Capture experience for Nightly-Learner
      await this.captureExperienceForLearning(request, gateDecision, executionTime, true);

      return gateDecision;

    } catch (error) {

      // Capture failed experience
      await this.captureExperienceForLearning(
        request,
        null,
        Date.now() - startTime,
        false,
        error as Error
      );

      throw error;
    }
  }

  // ============================================================================
  // Criterion Evaluation Methods
  // ============================================================================

  private async evaluateCriterion(criterion: QualityCriterion, value: number): Promise<boolean> {
    switch (criterion.type) {
      case 'minimum_threshold':
        return value >= criterion.threshold;
      case 'maximum_threshold':
        return value <= criterion.threshold;
      case 'range':
        // Range criteria would have minThreshold and maxThreshold
        return value >= criterion.threshold; // Simplified
      case 'trend':
        return await this.evaluateTrendCriterion(criterion, value);
      default:
        return false;
    }
  }

  private async calculateCriterionScore(criterion: QualityCriterion, value: number): Promise<number> {
    switch (criterion.type) {
      case 'minimum_threshold':
        return Math.min(1.0, value / criterion.threshold);
      case 'maximum_threshold':
        return value <= criterion.threshold ? 1.0 : Math.max(0.0, 1.0 - (value - criterion.threshold));
      default:
        return value >= criterion.threshold ? 1.0 : 0.0;
    }
  }

  private async calculateDynamicThreshold(context: QualityGateContext, _metrics: NormalizedMetrics): Promise<number> {
    let baseThreshold = 0.8; // Default threshold

    // Adjust based on deployment criticality (with safe access)
    const criticality = context?.criticality || 'medium';
    if (criticality === 'critical') {
      baseThreshold += 0.1;
    } else if (criticality === 'low') {
      baseThreshold -= 0.05;
    }

    // Adjust based on historical performance (with safe access)
    const environment = context?.environment || 'development';
    const historicalPerformance = await this.getHistoricalPerformance(environment);
    if (historicalPerformance > 0.9) {
      baseThreshold -= 0.02; // Slight relaxation for stable systems
    }

    // Adjust based on change magnitude (with safe access)
    const changes = context?.changes || [];
    const changeMagnitude = await this.calculateChangeMagnitude(changes);
    if (changeMagnitude > 0.5) {
      baseThreshold += 0.05; // Higher standards for large changes
    }

    // Ensure threshold stays within bounds
    return Math.max(0.5, Math.min(0.95, baseThreshold));
  }

  // ============================================================================
  // Risk Analysis
  // ============================================================================

  private async analyzeRiskFactors(context: QualityGateContext, evaluations: CriterionEvaluation[]): Promise<RiskFactor[]> {
    const riskFactors: RiskFactor[] = [];

    // Safe access to context fields
    const deploymentTarget = context?.deploymentTarget || 'development';
    const criticality = context?.criticality || 'medium';
    const changes: CodeChange[] = context?.changes || [];

    // Analyze deployment risk
    if (deploymentTarget === 'production' && criticality === 'critical') {
      riskFactors.push({
        type: 'deployment-risk',
        severity: 'high',
        probability: 0.3,
        impact: 'Production outage potential',
        mitigation: ['Additional testing', 'Staged deployment', 'Rollback plan']
      });
    }

    // Analyze change risk (using typed changes variable)
    const highComplexityChanges = changes.filter((c: CodeChange) => c.complexity > 8);
    if (highComplexityChanges.length > 0) {
      riskFactors.push({
        type: 'complexity-risk',
        severity: 'medium',
        probability: 0.4,
        impact: 'Increased defect probability',
        mitigation: ['Code review', 'Additional testing', 'Monitoring']
      });
    }

    // Analyze test quality risk
    const failedTests = evaluations.filter(e => !e.passed && e.criterion.critical);
    if (failedTests.length > 0) {
      riskFactors.push({
        type: 'test-quality-risk',
        severity: 'high',
        probability: 0.7,
        impact: 'Critical quality criteria not met',
        mitigation: ['Fix failing tests', 'Increase coverage', 'Review test strategy']
      });
    }

    return riskFactors;
  }

  private async applyRiskBasedLogic(baseDecision: string, riskFactors: RiskFactor[]): Promise<string> {
    // High-risk scenarios override positive decisions
    const criticalRisks = riskFactors.filter(rf => rf.severity === 'critical');
    const highRisks = riskFactors.filter(rf => rf.severity === 'high');

    if (criticalRisks.length > 0) {
      return 'FAIL';
    }

    if (highRisks.length > 1 && baseDecision === 'PASS') {
      return 'ESCALATE'; // Multiple high risks require human judgment
    }

    return baseDecision;
  }

  // ============================================================================
  // Metrics and Analysis
  // ============================================================================

  private async normalizeQualityMetrics(metrics: QualityMetrics): Promise<NormalizedMetrics> {
    return {
      test_coverage: (metrics.coverage.line + metrics.coverage.branch + metrics.coverage.function) / 300, // Normalize to 0-1
      test_success_rate: metrics.testResults.passed / Math.max(1, metrics.testResults.total),
      security_vulnerabilities: metrics.security.vulnerabilities,
      performance_regression: Math.max(0, metrics.performance.averageResponseTime - 1000) / 5000, // Normalize response time
      code_quality_score: Math.min(1, metrics.performance.throughput / 1000) // Normalize throughput
    };
  }

  private async getMetricValue(normalizedMetrics: NormalizedMetrics, metricName: string): Promise<number> {
    return normalizedMetrics[metricName] || 0;
  }

  private async detectComplexityIndicators(_testResults: QETestResult[], metrics: QualityMetrics): Promise<ComplexityIndicators> {
    // Detect if the quality state is complex enough to require special reasoning
    const failureRate = 1 - (metrics.testResults.passed / Math.max(1, metrics.testResults.total));
    const vulnerabilityCount = metrics.security.vulnerabilities;
    const performanceIssues = metrics.performance.errorRate > 0.05;

    const complexityScore = failureRate * 0.4 +
                           (vulnerabilityCount > 0 ? 0.3 : 0) +
                           (performanceIssues ? 0.3 : 0);

    return {
      high: complexityScore > 0.6,
      score: complexityScore,
      factors: {
        highFailureRate: failureRate > 0.1,
        securityVulnerabilities: vulnerabilityCount > 0,
        performanceIssues
      }
    };
  }

  // ============================================================================
  // Decision Support Methods
  // ============================================================================

  private async generateDecisionExplanation(evaluations: CriterionEvaluation[], decision: string): Promise<string> {
    const passedCriteria = evaluations.filter(e => e.passed).length;
    const totalCriteria = evaluations.length;
    const criticalFailures = evaluations.filter(e => !e.passed && e.criterion.critical);

    let explanation = `Quality gate evaluation completed. ${passedCriteria}/${totalCriteria} criteria passed. `;

    if (decision === 'PASS') {
      explanation += 'All critical quality criteria met. Deployment approved.';
    } else if (decision === 'FAIL') {
      if (criticalFailures.length > 0) {
        explanation += `Critical failures in: ${criticalFailures.map(cf => cf.criterion.name).join(', ')}. `;
      }
      explanation += 'Quality standards not met. Deployment blocked.';
    } else if (decision === 'ESCALATE') {
      explanation += 'Complex quality state detected. Human review required.';
    }

    return explanation;
  }

  private async generateQualityRecommendations(
    evaluations: CriterionEvaluation[],
    context: QualityGateContext
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze failed criteria
    const failedEvaluations = evaluations.filter(e => !e.passed);

    for (const failed of failedEvaluations) {
      switch (failed.criterion.name) {
        case 'test_coverage':
          recommendations.push('Increase test coverage by adding unit tests for uncovered code paths');
          break;
        case 'test_success_rate':
          recommendations.push('Fix failing tests before deployment');
          break;
        case 'security_vulnerabilities':
          recommendations.push('Address security vulnerabilities identified in scan');
          break;
        case 'performance_regression':
          recommendations.push('Optimize performance or investigate regression causes');
          break;
        case 'code_quality_score':
          recommendations.push('Improve code quality through refactoring and linting');
          break;
      }
    }

    // Context-specific recommendations
    if (context.criticality === 'critical' && failedEvaluations.length > 0) {
      recommendations.push('Consider additional manual testing for critical deployment');
    }

    if (context.changes && context.changes.length > 10) {
      recommendations.push('Large changeset detected - consider breaking into smaller deployments');
    }

    return recommendations;
  }

  private async calculateDecisionConfidence(evaluations: CriterionEvaluation[]): Promise<number> {
    // Calculate confidence based on how clearly criteria are met or failed
    let confidenceSum = 0;
    let weightSum = 0;

    for (const evaluation of evaluations) {
      // Higher confidence when values are clearly above/below thresholds
      const distance = Math.abs(evaluation.value - evaluation.criterion.threshold);
      const normalizedDistance = Math.min(1, distance / evaluation.criterion.threshold);
      const confidence = 0.5 + (normalizedDistance * 0.5);

      confidenceSum += confidence * evaluation.criterion.weight;
      weightSum += evaluation.criterion.weight;
    }

    return weightSum > 0 ? confidenceSum / weightSum : 0.5;
  }

  // ============================================================================
  // Learning and Storage
  // ============================================================================

  private async storeLearningData(decision: QualityGateDecision, testResults: QETestResult[], metrics: QualityMetrics): Promise<void> {
    if (this.memoryStore) {
      const learningData = {
        decision: decision.decision,
        score: decision.score,
        confidence: decision.confidence,
        testResultsSummary: {
          total: testResults.length,
          passed: testResults.filter(t => t.status === 'passed').length,
          failed: testResults.filter(t => t.status === 'failed').length
        },
        metricsSummary: {
          coverage: metrics.coverage,
          testResults: metrics.testResults,
          performance: metrics.performance,
          security: metrics.security
        },
        timestamp: new Date()
      };

      await this.memoryStore.set(`learning-${Date.now()}`, learningData, 'quality-gate-learning');
    }
  }

  // Placeholder implementations for complex methods
  private async loadDecisionPatterns(): Promise<void> {
    if (this.memoryStore) {
      const _patterns = await this.memoryStore.get('decision-_patterns', 'agents');
      // Apply loaded patterns
    }
  }

  private async saveDecisionPatterns(): Promise<void> {
    if (this.memoryStore) {
      await this.memoryStore.set('decision-patterns', {
        timestamp: new Date(),
        patterns: []
      }, 'agents');
    }
  }

  private async storeDecisionResult(decision: QualityGateDecision, duration: number): Promise<void> {
    if (this.memoryStore) {
      await this.memoryStore.set(`decision-${Date.now()}`, {
        decision: decision.decision,
        score: decision.score,
        confidence: decision.confidence,
        duration,
        timestamp: new Date()
      }, 'decisions');
    }
  }

  private async getHistoricalGateDecisions(): Promise<HistoricalGateDecision[]> {
    return []; // Placeholder for historical data
  }

  private async evaluateTrendCriterion(criterion: QualityCriterion, value: number): Promise<boolean> {
    // Evaluate trend-based criteria (requires historical data)
    return value >= criterion.threshold;
  }

  private async calculateImpact(criterion: QualityCriterion, value: number, _context: QualityGateContext): Promise<string> {
    if (criterion.critical && value < criterion.threshold) {
      return 'High impact - critical criterion not met';
    } else if (value < criterion.threshold) {
      return 'Medium impact - quality standard not met';
    } else {
      return 'Low impact - criterion satisfied';
    }
  }

  private async getHistoricalPerformance(_environment: string): Promise<number> {
    return 0.85; // Placeholder for historical performance data
  }

  private async calculateChangeMagnitude(changes: CodeChange[]): Promise<number> {
    return changes.reduce((sum, change) => sum + change.complexity, 0) / Math.max(1, changes.length * 10);
  }

  // ============================================================================
  // Nightly-Learner Integration - ExperienceCapture & Pattern Loading
  // ============================================================================

  /**
   * Load patterns from database and cache for confidence boosting at task start
   * This allows the agent to make decisions with higher confidence based on past learnings
   */
  private async loadAndCachePatternsForConfidence(): Promise<void> {
    try {
      // Load from LearningEngine if available
      if (this.learningEngine) {
        const patterns = await this.learningEngine.getPatterns();
        this.cachedPatterns = patterns.map(p => ({
          pattern: p.pattern,
          confidence: p.confidence,
          successRate: p.successRate
        }));
        this.qualityGateLogger.info(`[QualityGate] Cached ${this.cachedPatterns.length} patterns from LearningEngine`);
      }

      // Also load from memoryStore if available
      if (this.memoryStore) {
        const smm = this.memoryStore as unknown as SwarmMemoryManager;
        if (typeof smm.queryPatternsByConfidence === 'function') {
          const dbPatterns: DBPatternRecord[] = await smm.queryPatternsByConfidence(0.5); // High confidence only
          const qualityPatterns = dbPatterns.filter((p: DBPatternRecord) =>
            p.pattern?.includes('quality-gate') || p.metadata?.agent_type === 'quality-gate'
          );

          if (qualityPatterns.length > 0) {
            this.qualityGateLogger.info(`[QualityGate] Found ${qualityPatterns.length} historical quality gate patterns in DB`);

            // Merge with existing patterns
            for (const p of qualityPatterns) {
              if (!this.cachedPatterns.find(cp => cp.pattern === p.pattern)) {
                const successRate = typeof p.metadata?.success_rate === 'number' ? p.metadata.success_rate : 0.5;
                this.cachedPatterns.push({
                  pattern: p.pattern,
                  confidence: p.confidence,
                  successRate
                });
              }
            }
          }
        }
      }

      // Calculate historical accuracy from patterns
      if (this.cachedPatterns.length > 0) {
        const totalSuccessRate = this.cachedPatterns.reduce((sum, p) => sum + p.successRate, 0);
        this.historicalDecisionAccuracy = totalSuccessRate / this.cachedPatterns.length;
      }

      this.qualityGateLogger.info(`[QualityGate] Total cached patterns: ${this.cachedPatterns.length}, historical accuracy: ${(this.historicalDecisionAccuracy * 100).toFixed(1)}%`);
    } catch (error) {
      this.qualityGateLogger.warn('[QualityGate] Failed to load patterns for confidence', error);
    }
  }

  /**
   * Calculate confidence boost based on cached historical patterns
   * Used to improve decision confidence based on past successful decisions
   */
  public getConfidenceBoostFromPatterns(): number {
    if (this.cachedPatterns.length === 0) {
      return 0; // No patterns, no boost
    }

    // Find relevant quality gate patterns
    const relevantPatterns = this.cachedPatterns.filter(p =>
      p.pattern.includes('quality-gate') || p.pattern.includes('decision')
    );

    if (relevantPatterns.length === 0) {
      return 0;
    }

    // Calculate weighted average confidence boost
    const totalWeight = relevantPatterns.reduce((sum, p) => sum + p.successRate, 0);
    const weightedConfidence = relevantPatterns.reduce(
      (sum, p) => sum + p.confidence * p.successRate,
      0
    );

    const boost = totalWeight > 0 ? (weightedConfidence / totalWeight) * 0.25 : 0; // Max 25% boost

    this.qualityGateLogger.debug(`[QualityGate] Confidence boost from ${relevantPatterns.length} patterns: ${(boost * 100).toFixed(1)}%`);

    return boost;
  }

  /**
   * Capture execution experience for Nightly-Learner system
   * Enables cross-agent pattern synthesis and quality gate learning
   */
  private async captureExperienceForLearning(
    request: QualityGateRequest,
    decision: QualityGateDecision | null,
    duration: number,
    success: boolean,
    error?: Error
  ): Promise<void> {
    if (!this.experienceCapture) {
      return; // ExperienceCapture not initialized
    }

    try {
      const agentIdStr = this.getAgentIdStr();
      const agentType = 'quality-gate';

      const event: AgentExecutionEvent = {
        agentId: agentIdStr,
        agentType: agentType,
        taskId: `quality-gate-${Date.now()}`,
        taskType: 'quality-gate-evaluation',
        input: {
          testResultCount: request.testResults.length,
          deploymentTarget: request.context?.deploymentTarget,
          criticality: request.context?.criticality,
          changeCount: request.context?.changes?.length || 0,
          customCriteriaCount: request.customCriteria?.length || 0
        },
        output: success && decision ? {
          decision: decision.decision,
          score: decision.score,
          threshold: decision.threshold,
          confidence: decision.confidence,
          riskFactorCount: decision.riskFactors.length,
          recommendationCount: decision.recommendations.length,
          criteriaEvaluated: decision.criteriaEvaluations.length
        } : {},
        duration,
        success,
        error,
        metrics: success && decision ? {
          decision_score: decision.score,
          confidence: decision.confidence,
          risk_factor_count: decision.riskFactors.length,
          criteria_passed: decision.criteriaEvaluations.filter(e => e.passed).length,
          criteria_failed: decision.criteriaEvaluations.filter(e => !e.passed).length,
          confidence_boost: this.getConfidenceBoostFromPatterns()
        } : {},
        timestamp: new Date()
      };

      await this.experienceCapture.captureExecution(event);

      this.qualityGateLogger.debug(`[QualityGate] Captured experience for Nightly-Learner: ${success ? 'success' : 'failure'}, decision: ${decision?.decision || 'N/A'}`);
      this.emit('experience:captured', { agentId: agentIdStr, success, duration });
    } catch (captureError) {
      // Don't fail the main operation if capture fails
      this.qualityGateLogger.warn('[QualityGate] Failed to capture experience:', captureError);
    }
  }

  /**
   * Get learning status including Nightly-Learner integration
   */
  public async getEnhancedLearningStatus(): Promise<{
    learningEngine: LearningEngineStatus | null;
    experienceCapture: CaptureStats | null;
    cachedPatterns: number;
    confidenceBoost: number;
    historicalAccuracy: number;
  }> {
    const learningStatus: LearningEngineStatus | null = this.learningEngine ? {
      enabled: this.learningEngine.isEnabled(),
      totalExperiences: this.learningEngine.getTotalExperiences(),
      explorationRate: this.learningEngine.getExplorationRate(),
      patterns: (await this.learningEngine.getPatterns()).length
    } : null;

    const captureStats: CaptureStats | null = this.experienceCapture?.getStats() || null;

    return {
      learningEngine: learningStatus,
      experienceCapture: captureStats,
      cachedPatterns: this.cachedPatterns.length,
      confidenceBoost: this.getConfidenceBoostFromPatterns(),
      historicalAccuracy: this.historicalDecisionAccuracy
    };
  }
}

// ============================================================================
// Supporting Classes (Placeholder Implementations)
// ============================================================================

class DecisionEngine {
  private decisionCount = 0;
  private totalTime = 0;
  private lastConfidence = 0.8;

  async initialize(): Promise<void> {}

  getDecisionCount(): number {
    return this.decisionCount;
  }

  getAverageTime(): number {
    return this.decisionCount > 0 ? this.totalTime / this.decisionCount : 0;
  }

  getLastConfidence(): number {
    return this.lastConfidence;
  }

  async cleanup(): Promise<void> {}
}

class ConsciousnessEngine {
  async initialize(): Promise<void> {}

  async buildDecisionTree(params: DecisionTreeParams): Promise<DecisionTree> {
    return {
      version: '1.0.0',
      structure: 'binary',
      adaptationLevel: params.adaptationLevel
    };
  }

  async cleanup(): Promise<void> {}
}

class PsychoSymbolicReasoner {
  async initialize(): Promise<void> {}

  async reason(params: ReasoningParams): Promise<ReasoningResult> {
    // Analyze the context to produce meaningful reasoning
    const context = params.context || {};
    const complexityFactors = context.complexityFactors || { high: false, score: 0, factors: { highFailureRate: false, securityVulnerabilities: false, performanceIssues: false } };

    // Build reasoning based on actual quality state
    const issues: string[] = [];

    if (context.metrics?.test_coverage !== undefined) {
      if (context.metrics.test_coverage < 0.80) {
        issues.push('insufficient test coverage');
      }
    }

    if (context.metrics?.security_vulnerabilities !== undefined) {
      if (context.metrics.security_vulnerabilities > 0) {
        issues.push('security vulnerabilities detected');
      }
    }

    if (context.metrics?.test_success_rate !== undefined) {
      if (context.metrics.test_success_rate < 1.0) {
        issues.push('test failures detected');
      }
    }

    // Determine confidence based on complexity
    const baseConfidence = SecureRandom.randomFloat() * 0.3 + 0.4; // 0.4 to 0.7
    const confidence = complexityFactors.high ? baseConfidence : baseConfidence + 0.2;

    // Generate meaningful reasoning
    let reasoning: string;
    if (issues.length > 0) {
      reasoning = `Quality gate escalation required: ${issues.join(', ')}. Human review recommended before deployment.`;
    } else if (complexityFactors.high) {
      reasoning = 'Complex quality state requires human review. Multiple factors need expert assessment before deployment decision.';
    } else {
      reasoning = 'Quality analysis completed. Review recommended for final deployment approval.';
    }

    return {
      reasoning,
      confidence,
      recommendations: issues.length > 0
        ? [`Address: ${issues.join(', ')}`, 'Consider additional testing']
        : ['Consider additional testing']
    };
  }

  async cleanup(): Promise<void> {}
}

class RiskAnalyzer {
  async initialize(): Promise<void> {}
  async cleanup(): Promise<void> {}
}