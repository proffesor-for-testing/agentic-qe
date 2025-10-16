/**
 * Learning System Types - Phase 2 (Milestone 2.2)
 *
 * Defines interfaces and types for the Agent Learning System
 * with reinforcement learning capabilities.
 */

/**
 * Learning configuration for agents
 */
export interface LearningConfig {
  enabled: boolean;
  learningRate: number; // 0.0 - 1.0
  discountFactor: number; // gamma for future rewards (0.0 - 1.0)
  explorationRate: number; // epsilon for exploration vs exploitation (0.0 - 1.0)
  explorationDecay: number; // rate at which exploration decreases
  minExplorationRate: number; // minimum exploration rate
  maxMemorySize: number; // max learning data size in bytes
  batchSize: number; // number of experiences to learn from at once
  updateFrequency: number; // how often to update the model (in tasks)
}

/**
 * Task execution experience for learning
 */
export interface TaskExperience {
  taskId: string;
  taskType: string;
  state: TaskState;
  action: AgentAction;
  reward: number;
  nextState: TaskState;
  timestamp: Date;
  agentId: string;
}

/**
 * State representation for reinforcement learning
 */
export interface TaskState {
  taskComplexity: number; // 0.0 - 1.0
  requiredCapabilities: string[];
  contextFeatures: Record<string, any>;
  previousAttempts: number;
  availableResources: number; // 0.0 - 1.0
  timeConstraint?: number; // in milliseconds
}

/**
 * Action taken by agent during task execution
 */
export interface AgentAction {
  strategy: string; // execution strategy chosen
  toolsUsed: string[];
  parallelization: number; // degree of parallelization (0.0 - 1.0)
  retryPolicy: string;
  resourceAllocation: number; // 0.0 - 1.0
}

/**
 * Feedback from user or system
 */
export interface LearningFeedback {
  taskId: string;
  rating: number; // 0.0 - 1.0 (user satisfaction)
  issues: string[];
  suggestions: string[];
  timestamp: Date;
  source: 'user' | 'system' | 'peer';
}

/**
 * Learning outcome from a training session
 */
export interface LearningOutcome {
  improved: boolean;
  previousPerformance: number;
  newPerformance: number;
  improvementRate: number; // percentage improvement
  confidence: number; // 0.0 - 1.0
  patterns: LearnedPattern[];
  timestamp: Date;
}

/**
 * Pattern learned from experiences
 */
export interface LearnedPattern {
  id: string;
  pattern: string;
  confidence: number;
  successRate: number;
  usageCount: number;
  contexts: string[];
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Performance metrics for tracking
 */
export interface PerformanceMetrics {
  agentId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    tasksCompleted: number;
    successRate: number;
    averageExecutionTime: number;
    errorRate: number;
    userSatisfaction: number; // 0.0 - 1.0
    resourceEfficiency: number; // 0.0 - 1.0
  };
  trends: {
    metric: string;
    direction: 'up' | 'down' | 'stable';
    changeRate: number; // percentage
  }[];
}

/**
 * Performance improvement data
 */
export interface ImprovementData {
  agentId: string;
  baseline: PerformanceMetrics;
  current: PerformanceMetrics;
  improvementRate: number; // percentage
  daysElapsed: number;
  targetAchieved: boolean; // 20% improvement target
}

/**
 * Strategy recommendation from learning system
 */
export interface StrategyRecommendation {
  strategy: string;
  confidence: number;
  expectedImprovement: number;
  reasoning: string;
  alternatives: {
    strategy: string;
    confidence: number;
  }[];
}

/**
 * A/B test configuration
 */
export interface ABTest {
  id: string;
  name: string;
  strategies: {
    name: string;
    config: any;
  }[];
  sampleSize: number;
  results: {
    strategy: string;
    successRate: number;
    averageTime: number;
    sampleCount: number;
  }[];
  winner?: string;
  status: 'running' | 'completed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Learning model state for persistence
 */
export interface LearningModelState {
  agentId: string;
  qTable: Record<string, Record<string, number>>; // Q-learning table
  experiences: TaskExperience[];
  patterns: LearnedPattern[];
  config: LearningConfig;
  performance: PerformanceMetrics;
  version: string;
  lastUpdated: Date;
  size: number; // in bytes
}

/**
 * Common failure pattern identified by learning system
 */
export interface FailurePattern {
  id: string;
  pattern: string;
  frequency: number;
  contexts: string[];
  rootCause?: string;
  mitigation?: string;
  confidence: number;
  identifiedAt: Date;
}

/**
 * Learning event for tracking
 */
export interface LearningEvent {
  id: string;
  type: 'training' | 'improvement' | 'pattern_discovered' | 'strategy_changed';
  agentId: string;
  data: any;
  timestamp: Date;
}

/**
 * Flaky Test Detection Types
 */

/**
 * Test result from execution
 */
export interface TestResult {
  name: string;
  passed: boolean;
  status?: 'passed' | 'failed'; // Optional for backward compatibility
  duration: number;
  timestamp: number;
  error?: string;
  environment?: Record<string, any>;
  retryCount?: number; // Number of times test was retried
}

/**
 * Detected flaky test
 */
export interface FlakyTest {
  name: string;
  passRate: number;
  variance: number;
  confidence: number;
  totalRuns: number;
  failurePattern: 'intermittent' | 'environmental' | 'timing' | 'resource';
  recommendation: FlakyFixRecommendation;
  severity: 'low' | 'medium' | 'high' | 'critical';
  firstDetected: number;
  lastSeen: number;
}

/**
 * Fix recommendation for flaky test
 */
export interface FlakyFixRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'timing' | 'resource' | 'environmental' | 'concurrency' | 'data' | 'external';
  recommendation: string;
  codeExample?: string;
  estimatedEffort: 'low' | 'medium' | 'high';
}

/**
 * Statistical metrics
 */
export interface StatisticalMetrics {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  variance: number;
  coefficientOfVariation: number;
  outliers: number[];
}

/**
 * Flaky test prediction
 */
export interface FlakyPrediction {
  testName: string;
  isFlaky: boolean;
  probability: number;
  confidence: number;
  features: Record<string, number>;
  explanation: string;
  reasoning?: string; // Deprecated, use explanation
}

/**
 * Model training data
 */
export interface ModelTrainingData {
  testName: string;
  results: TestResult[];
  isFlaky: boolean;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  truePositiveRate: number;
  confusionMatrix: {
    truePositive: number;
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
  } | number[][]; // Support both formats
}
