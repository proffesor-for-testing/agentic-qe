/**
 * Parallel Evaluation Runner for Skill Validation
 * ADR-056 Phase 5: Distributed test execution across worker pool
 *
 * This module provides parallel execution of skill evaluation test cases
 * using a worker pool pattern for faster skill validation.
 *
 * Features:
 * - Worker pool with configurable concurrency
 * - Batch-based test case distribution
 * - Automatic retry of failed tests
 * - Progress tracking and heartbeat monitoring
 * - Integration with SkillValidationLearner for outcome recording
 * - Parallel speedup measurement vs sequential execution
 *
 * @module validation/parallel-eval-runner
 * @see .claude/skills/.validation/schemas/skill-eval.schema.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { toErrorMessage } from '../shared/error-utils.js';
import { secureRandom, secureRandomInt, secureRandomFloat } from '../shared/utils/crypto-random.js';
import {
  SkillValidationLearner,
  TestCaseResult,
  SkillValidationOutcome,
  SkillTrustTier,
  ValidationLevel,
} from '../learning/skill-validation-learner.js';

// ============================================================================
// Module Constants
// ============================================================================

/** Default maximum number of concurrent eval workers */
const DEFAULT_MAX_WORKERS = 5;

/** Default number of test cases per worker batch */
const DEFAULT_BATCH_SIZE = 4;

/** Default timeout per test case in milliseconds (30 seconds) */
const DEFAULT_TEST_TIMEOUT_MS = 30000;

/** Default directory containing skill eval suites */
const DEFAULT_SKILLS_DIR = '.claude/skills';

/** Default progress reporting interval in milliseconds */
const DEFAULT_PROGRESS_INTERVAL_MS = 5000;

/** Maximum simulated LLM delay for mock executor in milliseconds */
const MOCK_LLM_MAX_DELAY_MS = 500;

/** Minimum simulated LLM delay for mock executor in milliseconds */
const MOCK_LLM_MIN_DELAY_MS = 100;

/** Maximum simulated token count for mock executor */
const MOCK_LLM_MAX_TOKENS = 1000;

/** Minimum simulated token count for mock executor */
const MOCK_LLM_MIN_TOKENS = 500;

/** Default keyword match threshold for validation */
const DEFAULT_KEYWORD_MATCH_THRESHOLD = 0.8;

/** Reasoning quality score for substantial content (>200 chars) */
const REASONING_SCORE_SUBSTANTIAL_CONTENT = 0.2;

/** Reasoning quality score for extended content (>500 chars) */
const REASONING_SCORE_EXTENDED_CONTENT = 0.1;

/** Reasoning quality score per structural element */
const REASONING_SCORE_STRUCTURE = 0.1;

/** Reasoning quality score for WCAG reference */
const REASONING_SCORE_WCAG_REFERENCE = 0.1;

/** Reasoning quality score for remediation advice */
const REASONING_SCORE_REMEDIATION = 0.1;

/** Reasoning quality score for severity classification */
const REASONING_SCORE_SEVERITY = 0.1;

/** Minimum content length for substantial content check */
const REASONING_SUBSTANTIAL_CONTENT_LENGTH = 200;

/** Minimum content length for extended content check */
const REASONING_EXTENDED_CONTENT_LENGTH = 500;

/** Minimum content length for rubric completeness check */
const REASONING_RUBRIC_COMPLETENESS_LENGTH = 300;

/** Critical pass rate threshold for tier 3 trust */
const TRUST_TIER_3_CRITICAL_PASS_RATE = 1.0;

/** Critical pass rate threshold for tier 2 trust */
const TRUST_TIER_2_CRITICAL_PASS_RATE = 0.9;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the parallel evaluation runner
 */
export interface ParallelEvalConfig {
  /** Maximum number of concurrent workers (default: 5) */
  maxWorkers: number;

  /** Number of test cases per worker batch */
  batchSize: number;

  /** Whether to retry failed tests once */
  retryFailedTests: boolean;

  /** Timeout per test case in milliseconds */
  timeout: number;

  /** Directory containing skill eval suites */
  skillsDir: string;

  /** Progress reporting interval in milliseconds */
  progressIntervalMs: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_PARALLEL_EVAL_CONFIG: ParallelEvalConfig = {
  maxWorkers: DEFAULT_MAX_WORKERS,
  batchSize: DEFAULT_BATCH_SIZE,
  retryFailedTests: true,
  timeout: DEFAULT_TEST_TIMEOUT_MS,
  skillsDir: DEFAULT_SKILLS_DIR,
  progressIntervalMs: DEFAULT_PROGRESS_INTERVAL_MS,
};

/**
 * Test case input structure from eval YAML
 */
export interface EvalTestCaseInput {
  code: string;
  context: {
    language?: string;
    wcagLevel?: string;
    description?: string;
    environment?: string;
    options?: Record<string, unknown>;
  };
}

/**
 * Expected output structure from eval YAML
 */
export interface EvalTestCaseExpectedOutput {
  must_contain?: string[];
  must_not_contain?: string[];
  must_match_regex?: string[];
  finding_count?: {
    min?: number;
    max?: number;
  };
  severity_classification?: string;
}

/**
 * Validation criteria from eval YAML
 */
export interface EvalTestCaseValidation {
  schema_check?: boolean;
  keyword_match_threshold?: number;
  reasoning_quality_min?: number;
  grading_rubric?: {
    completeness?: number;
    accuracy?: number;
    actionability?: number;
  };
}

/**
 * Single test case from eval suite YAML
 */
export interface EvalTestCase {
  id: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  input: EvalTestCaseInput;
  expected_output: EvalTestCaseExpectedOutput;
  validation?: EvalTestCaseValidation;
}

/**
 * Complete eval suite loaded from YAML
 */
export interface EvalSuite {
  skill: string;
  version: string;
  description: string;
  models_to_test: string[];
  mcp_integration?: {
    enabled: boolean;
    namespace?: string;
    query_patterns?: boolean;
    track_outcomes?: boolean;
    store_patterns?: boolean;
    share_learning?: boolean;
    update_quality_gate?: boolean;
    target_agents?: string[];
  };
  learning?: {
    store_success_patterns?: boolean;
    store_failure_patterns?: boolean;
    pattern_ttl_days?: number;
    min_confidence_to_store?: number;
    cross_model_comparison?: boolean;
  };
  setup?: {
    required_tools?: string[];
    environment_variables?: Record<string, string>;
    fixtures?: Array<{
      name: string;
      content: string;
    }>;
  };
  test_cases: EvalTestCase[];
  success_criteria: {
    pass_rate: number;
    critical_pass_rate: number;
    avg_reasoning_quality?: number;
    max_execution_time_ms?: number;
    cross_model_variance?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Task unit sent to a worker
 */
export interface TestCaseTask {
  /** Name of the skill being validated */
  skillName: string;

  /** Unique test case identifier */
  testCaseId: string;

  /** Full test case definition */
  testCase: EvalTestCase;

  /** Model to use for this test */
  model: string;

  /** Worker batch ID */
  batchId: number;

  /** Index within the batch */
  indexInBatch: number;
}

/**
 * Result of parallel evaluation for a skill
 */
export interface ParallelEvalResult {
  /** Name of the skill evaluated */
  skill: string;

  /** Model used for evaluation */
  model: string;

  /** Total number of test cases */
  totalTests: number;

  /** Number of tests that passed */
  passedTests: number;

  /** Number of tests that failed */
  failedTests: number;

  /** Number of tests that were skipped */
  skippedTests: number;

  /** Pass rate as a decimal (0-1) */
  passRate: number;

  /** Individual test case results */
  testResults: TestCaseResult[];

  /** Total duration in milliseconds */
  totalDurationMs: number;

  /** Speedup factor vs sequential (e.g., 3.5x faster) */
  parallelSpeedup: number;

  /** Average reasoning quality score */
  avgReasoningQuality: number;

  /** Whether the eval suite passed overall */
  passed: boolean;

  /** Workers used in this run */
  workersUsed: number;

  /** Timestamp of evaluation */
  timestamp: Date;
}

/**
 * Worker communication message types
 */
export interface WorkerMessage {
  type: 'task' | 'result' | 'error' | 'heartbeat' | 'progress';
  workerId: number;
  payload: unknown;
}

/**
 * Progress report from a worker
 */
export interface WorkerProgress {
  workerId: number;
  tasksCompleted: number;
  tasksTotal: number;
  currentTask?: string;
  elapsedMs: number;
}

/**
 * Aggregated progress across all workers
 */
export interface EvalProgress {
  skill: string;
  model: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeWorkers: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  workerProgress: WorkerProgress[];
}

/**
 * LLM executor interface for test case execution
 */
export interface LLMExecutor {
  execute(
    prompt: string,
    model: string,
    options?: { timeout?: number }
  ): Promise<{
    output: string;
    tokensUsed: number;
    durationMs: number;
  }>;
}

/**
 * Mock LLM executor for testing
 */
export class MockLLMExecutor implements LLMExecutor {
  async execute(
    prompt: string,
    model: string,
    options?: { timeout?: number }
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    // Simulate LLM response time
    const delay = secureRandomFloat(MOCK_LLM_MIN_DELAY_MS, MOCK_LLM_MAX_DELAY_MS + MOCK_LLM_MIN_DELAY_MS);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Generate mock response based on test case content
    const output = this.generateMockResponse(prompt);

    return {
      output,
      tokensUsed: secureRandomInt(MOCK_LLM_MIN_TOKENS, MOCK_LLM_MAX_TOKENS + MOCK_LLM_MIN_TOKENS),
      durationMs: delay,
    };
  }

  private generateMockResponse(prompt: string): string {
    // Extract keywords from prompt to generate relevant mock response
    const keywords: string[] = [];

    if (prompt.includes('alt')) keywords.push('alt', '1.1.1', 'perceivable');
    if (prompt.includes('contrast'))
      keywords.push('contrast', '1.4.3', '4.5:1');
    if (prompt.includes('keyboard'))
      keywords.push('keyboard', '2.1.1', 'operable', 'button');
    if (prompt.includes('label'))
      keywords.push('label', '3.3.2', 'understandable');
    if (prompt.includes('ARIA')) keywords.push('ARIA', '4.1.2', 'robust');
    if (prompt.includes('focus')) keywords.push('focus', '2.4.7', 'outline');
    if (prompt.includes('lang')) keywords.push('lang', '3.1.1', 'language');
    if (prompt.includes('caption'))
      keywords.push('caption', '1.2.2', 'track');
    if (prompt.includes('accessible'))
      keywords.push('accessible', 'compliant');

    // If no specific keywords found, include generic accessibility terms
    if (keywords.length === 0) {
      keywords.push('accessibility', 'WCAG', 'finding');
    }

    return `Analysis complete. Found issues related to: ${keywords.join(', ')}.
    Recommendations: Implement proper ${keywords[0]} attributes for better accessibility.
    Severity: ${prompt.includes('critical') ? 'critical' : 'serious'}`;
  }
}

// ============================================================================
// Worker Pool Implementation
// ============================================================================

/**
 * Single worker in the pool
 */
class EvalWorker {
  public readonly id: number;
  public status: 'idle' | 'running' | 'error' = 'idle';
  public tasksCompleted = 0;
  public tasksFailed = 0;
  public lastHeartbeat = Date.now();

  constructor(
    id: number,
    private readonly executor: LLMExecutor,
    private readonly config: ParallelEvalConfig
  ) {
    this.id = id;
  }

  /**
   * Execute a batch of test cases
   */
  async executeBatch(tasks: TestCaseTask[]): Promise<TestCaseResult[]> {
    this.status = 'running';
    const results: TestCaseResult[] = [];

    for (const task of tasks) {
      this.lastHeartbeat = Date.now();

      try {
        const result = await this.executeTestCase(task);
        results.push(result);

        if (result.passed) {
          this.tasksCompleted++;
        } else {
          this.tasksFailed++;

          // Retry failed tests if configured
          if (this.config.retryFailedTests && !result.passed) {
            const retryResult = await this.executeTestCase(task, true);
            if (retryResult.passed) {
              // Replace with successful retry
              results[results.length - 1] = retryResult;
              this.tasksCompleted++;
              this.tasksFailed--;
            }
          }
        }
      } catch (error) {
        this.tasksFailed++;
        results.push({
          testId: task.testCaseId,
          passed: false,
          expectedPatterns: task.testCase.expected_output.must_contain || [],
          actualPatterns: [],
          reasoningQuality: 0,
          category: task.testCase.category,
          priority: task.testCase.priority,
          error: toErrorMessage(error),
        });
      }
    }

    this.status = 'idle';
    return results;
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(
    task: TestCaseTask,
    isRetry = false
  ): Promise<TestCaseResult> {
    const startTime = Date.now();

    // Build prompt from test case
    const prompt = this.buildPrompt(task);

    // Execute via LLM
    const response = await this.executor.execute(prompt, task.model, {
      timeout: this.config.timeout,
    });

    // Validate response against expected output
    const validation = this.validateResponse(
      response.output,
      task.testCase.expected_output,
      task.testCase.validation
    );

    return {
      testId: task.testCaseId,
      passed: validation.passed,
      expectedPatterns: task.testCase.expected_output.must_contain || [],
      actualPatterns: validation.foundPatterns,
      reasoningQuality: validation.reasoningQuality,
      executionTimeMs: Date.now() - startTime,
      category: task.testCase.category,
      priority: task.testCase.priority,
      error: validation.error,
    };
  }

  /**
   * Build LLM prompt from test case
   */
  private buildPrompt(task: TestCaseTask): string {
    const { testCase } = task;
    const context = testCase.input.context;

    return `Analyze the following ${context.language || 'HTML'} code for accessibility issues.
Context: ${context.description || testCase.description}
WCAG Level: ${context.wcagLevel || 'AA'}

Code:
\`\`\`${context.language || 'html'}
${testCase.input.code}
\`\`\`

Provide a detailed analysis including:
1. All accessibility issues found
2. WCAG success criteria violated
3. Severity classification (critical/serious/moderate/minor)
4. Remediation recommendations with code examples`;
  }

  /**
   * Validate LLM response against expected output
   */
  private validateResponse(
    output: string,
    expected: EvalTestCaseExpectedOutput,
    validation?: EvalTestCaseValidation
  ): {
    passed: boolean;
    foundPatterns: string[];
    reasoningQuality: number;
    error?: string;
  } {
    const foundPatterns: string[] = [];
    const errors: string[] = [];

    // Check must_contain patterns
    const mustContain = expected.must_contain || [];
    let matchedCount = 0;

    for (const pattern of mustContain) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(output)) {
        foundPatterns.push(pattern);
        matchedCount++;
      }
    }

    // Check must_not_contain patterns
    const mustNotContain = expected.must_not_contain || [];
    for (const pattern of mustNotContain) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(output)) {
        errors.push(`Output should not contain: ${pattern}`);
      }
    }

    // Check regex patterns
    const regexPatterns = expected.must_match_regex || [];
    for (const pattern of regexPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (!regex.test(output)) {
        errors.push(`Output should match regex: ${pattern}`);
      }
    }

    // Calculate keyword match rate
    const keywordMatchRate =
      mustContain.length > 0 ? matchedCount / mustContain.length : 1;
    const threshold = validation?.keyword_match_threshold ?? DEFAULT_KEYWORD_MATCH_THRESHOLD;
    const passedKeywords = keywordMatchRate >= threshold;

    // Calculate reasoning quality (simplified heuristic)
    const reasoningQuality = this.calculateReasoningQuality(output, validation);
    const minReasoningQuality = validation?.reasoning_quality_min ?? 0;
    const passedReasoning = reasoningQuality >= minReasoningQuality;

    // Determine overall pass
    const passed =
      passedKeywords && passedReasoning && errors.length === 0;

    return {
      passed,
      foundPatterns,
      reasoningQuality,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Calculate reasoning quality score
   */
  private calculateReasoningQuality(
    output: string,
    validation?: EvalTestCaseValidation
  ): number {
    // Simple heuristic based on response characteristics
    let score = 0;

    // Length check (should have substantial content)
    if (output.length > REASONING_SUBSTANTIAL_CONTENT_LENGTH) score += REASONING_SCORE_SUBSTANTIAL_CONTENT;
    if (output.length > REASONING_EXTENDED_CONTENT_LENGTH) score += REASONING_SCORE_EXTENDED_CONTENT;

    // Structure check (has lists, code blocks, etc.)
    if (output.includes('\n')) score += REASONING_SCORE_STRUCTURE;
    if (output.includes('1.') || output.includes('-')) score += REASONING_SCORE_STRUCTURE;
    if (output.includes('```')) score += REASONING_SCORE_STRUCTURE;

    // Content quality indicators
    if (output.includes('WCAG')) score += REASONING_SCORE_WCAG_REFERENCE;
    if (output.includes('remediation') || output.includes('recommendation'))
      score += REASONING_SCORE_REMEDIATION;
    if (output.includes('severity') || output.includes('critical'))
      score += REASONING_SCORE_SEVERITY;

    // Apply grading rubric if provided
    if (validation?.grading_rubric) {
      const rubric = validation.grading_rubric;
      let rubricScore = 0;

      if (rubric.completeness && output.length > REASONING_RUBRIC_COMPLETENESS_LENGTH) {
        rubricScore += rubric.completeness;
      }
      if (rubric.accuracy && output.includes('WCAG')) {
        rubricScore += rubric.accuracy;
      }
      if (
        rubric.actionability &&
        (output.includes('fix') || output.includes('change'))
      ) {
        rubricScore += rubric.actionability;
      }

      score = Math.max(score, rubricScore);
    }

    return Math.min(score, 1);
  }

  /**
   * Get progress report
   */
  getProgress(totalTasks: number): WorkerProgress {
    return {
      workerId: this.id,
      tasksCompleted: this.tasksCompleted,
      tasksTotal: totalTasks,
      elapsedMs: Date.now() - this.lastHeartbeat,
    };
  }
}

// ============================================================================
// Parallel Eval Runner
// ============================================================================

/**
 * Parallel evaluation runner using worker pool pattern
 * Distributes eval test cases across agents for faster execution
 */
export class ParallelEvalRunner {
  private readonly workers: EvalWorker[] = [];
  private progressCallback?: (progress: EvalProgress) => void;

  constructor(
    private readonly config: ParallelEvalConfig = DEFAULT_PARALLEL_EVAL_CONFIG,
    private readonly skillValidationLearner: SkillValidationLearner,
    private readonly executor: LLMExecutor = new MockLLMExecutor()
  ) {
    // Initialize worker pool
    for (let i = 0; i < config.maxWorkers; i++) {
      this.workers.push(new EvalWorker(i, executor, config));
    }
  }

  /**
   * Set progress callback for reporting
   */
  onProgress(callback: (progress: EvalProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Run eval suite for a skill in parallel
   */
  async runEvalParallel(
    skill: string,
    model: string
  ): Promise<ParallelEvalResult> {
    const startTime = Date.now();

    // Load eval suite
    const suite = this.loadEvalSuite(skill);
    if (!suite) {
      throw new Error(`Failed to load eval suite for skill: ${skill}`);
    }

    // Create test case tasks
    const tasks = this.createTasks(suite, model);

    // Partition tasks into batches
    const batches = this.partitionTestCases(tasks, this.config.batchSize);

    // Track sequential estimate
    const sequentialEstimate = tasks.length * (this.config.timeout / 2);

    // Execute batches in parallel across workers
    const allResults: TestCaseResult[] = [];
    const batchPromises: Promise<TestCaseResult[]>[] = [];

    // Assign batches to workers in round-robin fashion
    for (let i = 0; i < batches.length; i++) {
      const worker = this.workers[i % this.workers.length];
      batchPromises.push(worker.executeBatch(batches[i]));
    }

    // Start progress reporting
    const progressInterval = this.startProgressReporting(
      skill,
      model,
      tasks.length,
      startTime
    );

    try {
      // Wait for all batches to complete
      const batchResults = await Promise.all(batchPromises);

      // Flatten results
      for (const batch of batchResults) {
        allResults.push(...batch);
      }
    } finally {
      // Stop progress reporting
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }

    const totalDurationMs = Date.now() - startTime;

    // Calculate metrics
    const passedTests = allResults.filter((r) => r.passed).length;
    const failedTests = allResults.filter((r) => !r.passed).length;
    const skippedTests = tasks.length - allResults.length;
    const passRate = allResults.length > 0 ? passedTests / allResults.length : 0;

    const avgReasoningQuality =
      allResults.length > 0
        ? allResults.reduce((sum, r) => sum + r.reasoningQuality, 0) /
          allResults.length
        : 0;

    // Calculate parallel speedup
    const parallelSpeedup =
      totalDurationMs > 0 ? sequentialEstimate / totalDurationMs : 1;

    // Determine if suite passed
    const passed =
      passRate >= suite.success_criteria.pass_rate &&
      avgReasoningQuality >= (suite.success_criteria.avg_reasoning_quality ?? 0);

    // Record outcome to learner
    await this.recordOutcome({
      skillName: skill,
      trustTier: this.determineTrustTier(suite),
      validationLevel: 'eval',
      model,
      passed,
      score: passRate,
      testCaseResults: allResults,
      timestamp: new Date(),
      runId: `${skill}-${model}-${Date.now()}`,
      metadata: {
        duration: totalDurationMs,
        parallelSpeedup,
        workersUsed: this.config.maxWorkers,
        version: suite.version,
      },
    });

    return {
      skill,
      model,
      totalTests: tasks.length,
      passedTests,
      failedTests,
      skippedTests,
      passRate,
      testResults: allResults,
      totalDurationMs,
      parallelSpeedup,
      avgReasoningQuality,
      passed,
      workersUsed: this.config.maxWorkers,
      timestamp: new Date(),
    };
  }

  /**
   * Run multiple skill evals in parallel
   */
  async runMultipleEvalsParallel(
    skills: string[],
    models: string[]
  ): Promise<Map<string, ParallelEvalResult[]>> {
    const results = new Map<string, ParallelEvalResult[]>();

    // Create all skill-model combinations
    const combinations: Array<{ skill: string; model: string }> = [];
    for (const skill of skills) {
      results.set(skill, []);
      for (const model of models) {
        combinations.push({ skill, model });
      }
    }

    // Run all combinations in parallel (limited by worker pool)
    const evalPromises = combinations.map(async ({ skill, model }) => {
      const result = await this.runEvalParallel(skill, model);
      return { skill, result };
    });

    const evalResults = await Promise.all(evalPromises);

    // Organize results by skill
    for (const { skill, result } of evalResults) {
      results.get(skill)!.push(result);
    }

    return results;
  }

  /**
   * Load eval suite from skill's evals/ directory
   */
  loadEvalSuite(skill: string): EvalSuite | null {
    // If skillsDir is absolute, use it directly; otherwise join with cwd
    const baseDir = path.isAbsolute(this.config.skillsDir)
      ? this.config.skillsDir
      : path.join(process.cwd(), this.config.skillsDir);

    const evalPath = path.join(baseDir, skill, 'evals', `${skill}.yaml`);

    if (!fs.existsSync(evalPath)) {
      console.error(`Eval suite not found: ${evalPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(evalPath, 'utf-8');
      return yaml.parse(content) as EvalSuite;
    } catch (error) {
      console.error(
        `Failed to parse eval suite: ${error instanceof Error ? error.message : error}`
      );
      return null;
    }
  }

  /**
   * Create test case tasks from suite
   */
  private createTasks(suite: EvalSuite, model: string): TestCaseTask[] {
    return suite.test_cases.map((testCase, index) => ({
      skillName: suite.skill,
      testCaseId: testCase.id,
      testCase,
      model,
      batchId: Math.floor(index / this.config.batchSize),
      indexInBatch: index % this.config.batchSize,
    }));
  }

  /**
   * Partition test cases into batches for workers
   */
  private partitionTestCases(
    tasks: TestCaseTask[],
    batchSize: number
  ): TestCaseTask[][] {
    const batches: TestCaseTask[][] = [];

    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Determine trust tier based on suite configuration
   */
  private determineTrustTier(suite: EvalSuite): SkillTrustTier {
    // Check for MCP integration and learning config
    const hasMcp = suite.mcp_integration?.enabled ?? false;
    const hasLearning = suite.learning?.cross_model_comparison ?? false;
    const criticalPassRate = suite.success_criteria.critical_pass_rate ?? 0;

    if (hasMcp && hasLearning && criticalPassRate >= TRUST_TIER_3_CRITICAL_PASS_RATE) {
      return 3; // Highest tier
    } else if (hasMcp || criticalPassRate >= TRUST_TIER_2_CRITICAL_PASS_RATE) {
      return 2;
    }
    return 1;
  }

  /**
   * Start progress reporting interval
   */
  private startProgressReporting(
    skill: string,
    model: string,
    totalTasks: number,
    startTime: number
  ): NodeJS.Timeout | null {
    if (!this.progressCallback) return null;

    return setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      const completedTasks = this.workers.reduce(
        (sum, w) => sum + w.tasksCompleted,
        0
      );
      const failedTasks = this.workers.reduce(
        (sum, w) => sum + w.tasksFailed,
        0
      );
      const activeWorkers = this.workers.filter(
        (w) => w.status === 'running'
      ).length;

      const tasksPerMs =
        elapsedMs > 0 ? completedTasks / elapsedMs : 0;
      const remainingTasks = totalTasks - completedTasks;
      const estimatedRemainingMs =
        tasksPerMs > 0 ? remainingTasks / tasksPerMs : 0;

      const progress: EvalProgress = {
        skill,
        model,
        totalTasks,
        completedTasks,
        failedTasks,
        activeWorkers,
        elapsedMs,
        estimatedRemainingMs,
        workerProgress: this.workers.map((w) => w.getProgress(totalTasks)),
      };

      this.progressCallback!(progress);
    }, this.config.progressIntervalMs);
  }

  /**
   * Record validation outcome to learner
   */
  private async recordOutcome(
    outcome: SkillValidationOutcome
  ): Promise<void> {
    await this.skillValidationLearner.recordValidationOutcome(outcome);
  }

  /**
   * Get worker pool status
   */
  getWorkerStatus(): Array<{
    id: number;
    status: string;
    tasksCompleted: number;
    tasksFailed: number;
  }> {
    return this.workers.map((w) => ({
      id: w.id,
      status: w.status,
      tasksCompleted: w.tasksCompleted,
      tasksFailed: w.tasksFailed,
    }));
  }

  /**
   * Reset worker statistics
   */
  resetWorkers(): void {
    for (const worker of this.workers) {
      worker.tasksCompleted = 0;
      worker.tasksFailed = 0;
      worker.status = 'idle';
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a ParallelEvalRunner instance
 */
export function createParallelEvalRunner(
  skillValidationLearner: SkillValidationLearner,
  config: Partial<ParallelEvalConfig> = {},
  executor?: LLMExecutor
): ParallelEvalRunner {
  const mergedConfig = {
    ...DEFAULT_PARALLEL_EVAL_CONFIG,
    ...config,
  };

  return new ParallelEvalRunner(mergedConfig, skillValidationLearner, executor);
}
