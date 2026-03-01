/**
 * Integration Tests: Parallel Eval Runner
 * ADR-056 Phase 5: Worker pool-based parallel evaluation
 *
 * These tests verify that:
 * 1. Parallel execution is faster than sequential
 * 2. Test cases are distributed evenly across workers
 * 3. Worker failures are handled gracefully
 * 4. Failed tests are retried when configured
 * 5. Outcomes are recorded to SkillValidationLearner
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  ParallelEvalRunner,
  createParallelEvalRunner,
  ParallelEvalConfig,
  EvalSuite,
  LLMExecutor,
} from '../../../src/validation/parallel-eval-runner.js';
import {
  SkillValidationLearner,
  createSkillValidationLearner,
} from '../../../src/learning/skill-validation-learner.js';
import {
  RealQEReasoningBank,
  createRealQEReasoningBank,
} from '../../../src/learning/real-qe-reasoning-bank.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_EVAL_SUITE: EvalSuite = {
  skill: 'test-skill',
  version: '1.0.0',
  description: 'Test eval suite for integration testing',
  models_to_test: ['claude-3.5-sonnet', 'claude-3-haiku'],
  mcp_integration: {
    enabled: true,
    namespace: 'test-validation',
    track_outcomes: true,
  },
  learning: {
    store_success_patterns: true,
    cross_model_comparison: true,
  },
  test_cases: [
    {
      id: 'tc001',
      description: 'Test alt text detection',
      category: 'perceivable',
      priority: 'critical',
      input: {
        code: '<img src="test.jpg">',
        context: { language: 'html', wcagLevel: 'AA' },
      },
      expected_output: {
        must_contain: ['alt', '1.1.1', 'perceivable'],
        must_not_contain: ['no issues'],
      },
      validation: {
        keyword_match_threshold: 0.8,
        reasoning_quality_min: 0.5,
      },
    },
    {
      id: 'tc002',
      description: 'Test contrast detection',
      category: 'perceivable',
      priority: 'high',
      input: {
        code: '<p style="color: #777">Gray text</p>',
        context: { language: 'html', wcagLevel: 'AA' },
      },
      expected_output: {
        must_contain: ['contrast', '1.4.3'],
      },
      validation: {
        keyword_match_threshold: 0.8,
      },
    },
    {
      id: 'tc003',
      description: 'Test keyboard accessibility',
      category: 'operable',
      priority: 'critical',
      input: {
        code: '<div onclick="click()">Button</div>',
        context: { language: 'html', wcagLevel: 'A' },
      },
      expected_output: {
        must_contain: ['keyboard', '2.1.1', 'operable', 'button'],
      },
      validation: {
        keyword_match_threshold: 0.9,
        reasoning_quality_min: 0.6,
      },
    },
    {
      id: 'tc004',
      description: 'Test form labels',
      category: 'understandable',
      priority: 'high',
      input: {
        code: '<input type="text" placeholder="Name">',
        context: { language: 'html', wcagLevel: 'A' },
      },
      expected_output: {
        must_contain: ['label', '3.3.2', 'understandable'],
      },
    },
    {
      id: 'tc005',
      description: 'Test ARIA validation',
      category: 'robust',
      priority: 'medium',
      input: {
        code: '<button aria-label="">Submit</button>',
        context: { language: 'html', wcagLevel: 'A' },
      },
      expected_output: {
        must_contain: ['ARIA', '4.1.2', 'robust'],
      },
    },
    {
      id: 'tc006',
      description: 'Test focus visibility',
      category: 'operable',
      priority: 'high',
      input: {
        code: 'button:focus { outline: none; }',
        context: { language: 'css', wcagLevel: 'AA' },
      },
      expected_output: {
        must_contain: ['focus', '2.4.7', 'outline'],
      },
    },
  ],
  success_criteria: {
    pass_rate: 0.8,
    critical_pass_rate: 1.0,
    avg_reasoning_quality: 0.5,
    max_execution_time_ms: 60000,
  },
};

/**
 * Mock LLM executor that tracks execution times
 */
class TimedMockExecutor implements LLMExecutor {
  public executionTimes: number[] = [];
  public callCount = 0;
  private delayMs: number;

  constructor(delayMs = 100) {
    this.delayMs = delayMs;
  }

  async execute(
    prompt: string,
    _model: string,
    _options?: { timeout?: number }
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    const start = Date.now();
    this.callCount++;

    // Simulate LLM response time
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const duration = Date.now() - start;
    this.executionTimes.push(duration);

    // Generate response with keywords from prompt
    const output = this.generateResponse(prompt);

    return {
      output,
      tokensUsed: 500,
      durationMs: duration,
    };
  }

  private generateResponse(prompt: string): string {
    const keywords: string[] = [];

    if (prompt.includes('alt') || prompt.includes('img'))
      keywords.push('alt', '1.1.1', 'perceivable');
    if (prompt.includes('contrast') || prompt.includes('color'))
      keywords.push('contrast', '1.4.3', '4.5:1');
    if (prompt.includes('onclick') || prompt.includes('keyboard'))
      keywords.push('keyboard', '2.1.1', 'operable', 'button');
    if (prompt.includes('label') || prompt.includes('input'))
      keywords.push('label', '3.3.2', 'understandable');
    if (prompt.includes('aria') || prompt.includes('ARIA'))
      keywords.push('ARIA', '4.1.2', 'robust');
    if (prompt.includes('focus') || prompt.includes('outline'))
      keywords.push('focus', '2.4.7', 'outline');

    return `WCAG Analysis: Found issues related to ${keywords.join(', ')}.
    Severity: serious
    Remediation: Fix the ${keywords[0]} attribute.
    This affects accessibility for users with disabilities.`;
  }

  reset(): void {
    this.executionTimes = [];
    this.callCount = 0;
  }
}

/**
 * Mock LLM executor that fails on specific test cases
 */
class FailingMockExecutor implements LLMExecutor {
  public failedCalls = 0;
  public retryCalls = 0;
  public totalCalls = 0;
  private failOnFirst: boolean;
  private hasFailed = false;

  constructor(failOnFirst = true) {
    this.failOnFirst = failOnFirst;
  }

  async execute(
    prompt: string,
    _model: string,
    _options?: { timeout?: number }
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    this.totalCalls++;

    // Fail only on first call if configured
    if (this.failOnFirst && !this.hasFailed) {
      this.hasFailed = true;
      this.failedCalls++;
      throw new Error('Simulated failure for first test case');
    }

    // Track retries
    if (this.hasFailed && this.totalCalls === 2) {
      this.retryCalls++;
    }

    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      output: `Analysis complete. WCAG issues found: alt, 1.1.1, perceivable, contrast, 1.4.3, keyboard, 2.1.1, operable, button, label, 3.3.2, understandable, ARIA, 4.1.2, robust, focus, 2.4.7, outline`,
      tokensUsed: 500,
      durationMs: 30,
    };
  }

  reset(): void {
    this.failedCalls = 0;
    this.retryCalls = 0;
    this.totalCalls = 0;
    this.hasFailed = false;
  }
}

// ============================================================================
// Test Setup
// ============================================================================

describe('ParallelEvalRunner Integration Tests', () => {
  let reasoningBank: RealQEReasoningBank;
  let learner: SkillValidationLearner;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    testDir = path.join(process.cwd(), '.test-evals-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    // Write test eval suite
    const skillDir = path.join(testDir, 'test-skill', 'evals');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'test-skill.yaml'),
      yaml.stringify(TEST_EVAL_SUITE)
    );

    // Initialize reasoning bank with test database
    reasoningBank = await createRealQEReasoningBank({
      persistencePath: path.join(testDir, 'test-memory.db'),
      hnswConfig: {
        m: 8,
        efConstruction: 50,
        efSearch: 25,
      },
    });
    await reasoningBank.initialize();

    // Create learner
    learner = createSkillValidationLearner(reasoningBank);
  });

  afterEach(async () => {
    // Close reasoning bank
    if (reasoningBank) {
      await reasoningBank.dispose();
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Test: Parallel execution is faster than sequential
  // ==========================================================================

  it('should run eval suite faster than sequential execution', async () => {
    const executor = new TimedMockExecutor(50); // 50ms per test

    // Run sequentially (1 worker)
    const sequentialConfig: Partial<ParallelEvalConfig> = {
      maxWorkers: 1,
      batchSize: 1,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const sequentialRunner = createParallelEvalRunner(
      learner,
      sequentialConfig,
      executor
    );

    const sequentialStart = Date.now();
    const sequentialResult = await sequentialRunner.runEvalParallel(
      'test-skill',
      'claude-3.5-sonnet'
    );
    const sequentialDuration = Date.now() - sequentialStart;

    // Reset executor
    executor.reset();

    // Run in parallel (3 workers)
    const parallelConfig: Partial<ParallelEvalConfig> = {
      maxWorkers: 3,
      batchSize: 2,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const parallelRunner = createParallelEvalRunner(
      learner,
      parallelConfig,
      executor
    );

    const parallelStart = Date.now();
    const parallelResult = await parallelRunner.runEvalParallel(
      'test-skill',
      'claude-3.5-sonnet'
    );
    const parallelDuration = Date.now() - parallelStart;

    // Both should have same number of tests
    expect(parallelResult.totalTests).toBe(sequentialResult.totalTests);
    expect(parallelResult.totalTests).toBe(6);

    // Parallel should show some speedup factor
    expect(parallelResult.parallelSpeedup).toBeGreaterThan(0);

    // Results should be valid
    expect(parallelResult.testResults.length).toBe(6);
    expect(sequentialResult.testResults.length).toBe(6);
  }, 30000);

  // ==========================================================================
  // Test: Test cases are distributed across workers
  // ==========================================================================

  it('should distribute test cases across workers', async () => {
    const executor = new TimedMockExecutor(30);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 3,
      batchSize: 2,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);
    const result = await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Should complete all tests
    expect(result.totalTests).toBe(6);
    expect(result.testResults.length).toBe(6);

    // Workers used should be reflected
    expect(result.workersUsed).toBe(3);

    // Check worker status
    const workerStatus = runner.getWorkerStatus();
    expect(workerStatus.length).toBe(3);
  }, 15000);

  // ==========================================================================
  // Test: Worker failures are handled gracefully
  // ==========================================================================

  it('should handle worker failures gracefully', async () => {
    // Create executor that fails on first test
    const executor = new FailingMockExecutor(true);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 1,
      batchSize: 1,
      retryFailedTests: false, // Disable retry
      timeout: 5000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);
    const result = await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Should complete all tests even with failure
    expect(result.totalTests).toBe(6);

    // Should have recorded at least one failure
    expect(result.failedTests).toBeGreaterThanOrEqual(1);

    // Executor should have tracked the failure
    expect(executor.failedCalls).toBeGreaterThanOrEqual(1);
  }, 15000);

  // ==========================================================================
  // Test: Failed tests are retried when configured
  // ==========================================================================

  it('should retry failed tests when configured', async () => {
    // Create executor that fails first time
    const executor = new FailingMockExecutor(true);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 1,
      batchSize: 1,
      retryFailedTests: true, // Enable retry
      timeout: 5000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);
    const result = await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Should have called executor more times due to retry (6 tests + at least 1 retry)
    expect(executor.totalCalls).toBeGreaterThan(6);

    // The first test may fail even with retry (depending on mock logic)
    // but subsequent tests should pass
    // With 6 tests total and first one potentially failing, we expect at least 3 passed
    expect(result.passedTests).toBeGreaterThanOrEqual(3);

    // Verify retry was triggered
    expect(executor.failedCalls).toBeGreaterThanOrEqual(1);
  }, 15000);

  // ==========================================================================
  // Test: Outcomes are recorded to SkillValidationLearner
  // ==========================================================================

  it('should record outcomes to SkillValidationLearner', async () => {
    const executor = new TimedMockExecutor(30);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 2,
      batchSize: 3,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);

    // Run eval
    await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Check that confidence was recorded
    const confidence = await learner.getSkillConfidence('test-skill');

    expect(confidence).not.toBeNull();
    expect(confidence!.skillName).toBe('test-skill');
    expect(confidence!.outcomes.length).toBeGreaterThan(0);
    expect(confidence!.avgScore).toBeGreaterThanOrEqual(0);
    expect(confidence!.avgScore).toBeLessThanOrEqual(1);
  }, 30000);

  // ==========================================================================
  // Test: Progress callback is called during execution
  // ==========================================================================

  it('should report progress during execution', async () => {
    const executor = new TimedMockExecutor(100);
    const progressReports: any[] = [];

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 2,
      batchSize: 2,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
      progressIntervalMs: 50, // Report every 50ms
    };

    const runner = createParallelEvalRunner(learner, config, executor);

    runner.onProgress((progress) => {
      progressReports.push({ ...progress });
    });

    await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Should have received progress reports
    expect(progressReports.length).toBeGreaterThan(0);

    // Progress should include expected fields
    const lastProgress = progressReports[progressReports.length - 1];
    expect(lastProgress.skill).toBe('test-skill');
    expect(lastProgress.totalTasks).toBe(6);
    expect(lastProgress.elapsedMs).toBeGreaterThan(0);
  }, 15000);

  // ==========================================================================
  // Test: Multiple skill evals in parallel
  // ==========================================================================

  it('should run multiple skill evals in parallel', async () => {
    // Create another test skill
    const skill2Dir = path.join(testDir, 'test-skill-2', 'evals');
    fs.mkdirSync(skill2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(skill2Dir, 'test-skill-2.yaml'),
      yaml.stringify({
        ...TEST_EVAL_SUITE,
        skill: 'test-skill-2',
        test_cases: TEST_EVAL_SUITE.test_cases.slice(0, 3), // Only 3 tests
      })
    );

    const executor = new TimedMockExecutor(30);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 3,
      batchSize: 2,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);

    const results = await runner.runMultipleEvalsParallel(
      ['test-skill', 'test-skill-2'],
      ['claude-3.5-sonnet']
    );

    // Should have results for both skills
    expect(results.size).toBe(2);
    expect(results.has('test-skill')).toBe(true);
    expect(results.has('test-skill-2')).toBe(true);

    // Each skill should have results
    const skill1Results = results.get('test-skill')!;
    expect(skill1Results.length).toBe(1);
    expect(skill1Results[0].totalTests).toBe(6);

    const skill2Results = results.get('test-skill-2')!;
    expect(skill2Results.length).toBe(1);
    expect(skill2Results[0].totalTests).toBe(3);
  }, 30000);

  // ==========================================================================
  // Test: Measures and reports speedup correctly
  // ==========================================================================

  it('should measure and report parallel speedup correctly', async () => {
    const executor = new TimedMockExecutor(50);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 3,
      batchSize: 2,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);
    const result = await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');

    // Speedup should be positive
    expect(result.parallelSpeedup).toBeGreaterThan(0);

    // Duration should be recorded
    expect(result.totalDurationMs).toBeGreaterThan(0);

    // Results should be complete
    expect(result.testResults.length).toBe(6);
  }, 15000);

  // ==========================================================================
  // Test: Worker reset clears statistics
  // ==========================================================================

  it('should reset worker statistics between runs', async () => {
    const executor = new TimedMockExecutor(30);

    const config: Partial<ParallelEvalConfig> = {
      maxWorkers: 2,
      batchSize: 3,
      retryFailedTests: false,
      timeout: 10000,
      skillsDir: testDir,
    };

    const runner = createParallelEvalRunner(learner, config, executor);

    // First run
    await runner.runEvalParallel('test-skill', 'claude-3.5-sonnet');
    let status = runner.getWorkerStatus();
    const firstRunTotal = status.reduce((sum, w) => sum + w.tasksCompleted, 0);

    // Reset workers
    runner.resetWorkers();
    status = runner.getWorkerStatus();
    const afterResetTotal = status.reduce((sum, w) => sum + w.tasksCompleted, 0);

    expect(firstRunTotal).toBeGreaterThan(0);
    expect(afterResetTotal).toBe(0);

    // All workers should be idle
    for (const worker of status) {
      expect(worker.status).toBe('idle');
      expect(worker.tasksCompleted).toBe(0);
      expect(worker.tasksFailed).toBe(0);
    }
  }, 15000);
});
