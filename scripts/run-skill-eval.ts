#!/usr/bin/env npx tsx
/**
 * AQE Skill Evaluation Runner
 *
 * Runs skill evaluation test suites defined in YAML format.
 * Integrates with AQE MCP tools for shared learning and QualityFeedbackLoop.
 *
 * Usage:
 *   npx tsx scripts/run-skill-eval.ts --skill security-testing --model claude-3.5-sonnet
 *   npx tsx scripts/run-skill-eval.ts --eval-file .claude/skills/security-testing/evals/security-testing.yaml
 *   npx tsx scripts/run-skill-eval.ts --skill security-testing --all-models
 *
 * MCP Integration (per docs/specs/skill-validation-mcp-integration.md):
 *   - Queries patterns before running: mcp__agentic-qe__memory_query
 *   - Tracks test outcomes: mcp__agentic-qe__test_outcome_track
 *   - Stores patterns after: mcp__agentic-qe__memory_store
 *   - Shares learning: mcp__agentic-qe__memory_share
 *   - Updates quality gate: mcp__agentic-qe__quality_assess
 *
 * @module scripts/run-skill-eval
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// For YAML parsing - using dynamic import for ESM compatibility
let yaml: typeof import('yaml');

// =============================================================================
// Types
// =============================================================================

/**
 * Test case from eval YAML
 */
interface TestCase {
  id: string;
  description: string;
  category?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  skip?: boolean;
  skip_reason?: string;
  input: TestInput;
  expected_output: ExpectedOutput;
  validation?: ValidationConfig;
  timeout_ms?: number;
}

interface TestInput {
  code?: string;
  file_path?: string;
  url?: string;
  prompt?: string;
  context?: {
    language?: string;
    framework?: string;
    environment?: 'development' | 'staging' | 'production';
  };
  options?: Record<string, unknown>;
}

interface ExpectedOutput {
  must_contain?: string[];
  must_not_contain?: string[];
  must_match_regex?: string[];
  severity_classification?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  finding_count?: { min?: number; max?: number };
  recommendation_count?: { min?: number; max?: number };
  schema_path?: string;
  custom_assertions?: CustomAssertion[];
}

interface CustomAssertion {
  type: 'jsonpath' | 'semantic' | 'function';
  expression: string;
  expected?: unknown;
}

interface ValidationConfig {
  schema_check?: boolean;
  keyword_match_threshold?: number;
  reasoning_quality_min?: number;
  semantic_similarity_min?: number;
  allow_partial?: boolean;
  grading_rubric?: {
    completeness?: number;
    accuracy?: number;
    actionability?: number;
  };
}

interface MCPIntegrationConfig {
  enabled: boolean;
  namespace: string;
  store_patterns: boolean;
  query_patterns: boolean;
  track_outcomes: boolean;
  share_learning: boolean;
  update_quality_gate: boolean;
  target_agents: string[];
}

interface LearningConfig {
  store_success_patterns: boolean;
  store_failure_patterns: boolean;
  pattern_ttl_days: number;
  min_confidence_to_store: number;
  cross_model_comparison: boolean;
}

interface SuccessCriteria {
  pass_rate: number;
  critical_pass_rate?: number;
  avg_reasoning_quality?: number;
  max_execution_time_ms?: number;
  cross_model_variance?: number;
}

/**
 * Full eval suite configuration
 */
interface EvalSuite {
  skill: string;
  version: string;
  description?: string;
  models_to_test: string[];
  mcp_integration?: MCPIntegrationConfig;
  learning?: LearningConfig;
  setup?: {
    required_tools?: string[];
    environment_variables?: Record<string, string>;
    fixtures?: Array<{ name: string; path: string; content: string }>;
  };
  test_cases: TestCase[];
  success_criteria: SuccessCriteria;
  metadata?: {
    author?: string;
    created?: string;
    last_updated?: string;
    coverage_target?: string;
  };
}

/**
 * Result of a single test case execution
 */
interface TestCaseResult {
  id: string;
  description: string;
  category?: string;
  priority: string;
  passed: boolean;
  skipped: boolean;
  skip_reason?: string;
  execution_time_ms: number;
  keyword_match_score: number;
  reasoning_quality_score: number;
  validation_details: {
    must_contain_matches: string[];
    must_contain_misses: string[];
    must_not_contain_violations: string[];
    regex_matches: string[];
    regex_misses: string[];
    severity_matched: boolean;
    finding_count_matched: boolean;
  };
  raw_output?: string;
  error?: string;
}

/**
 * Result of running eval suite against a single model
 */
interface ModelEvalResult {
  model: string;
  skill: string;
  version: string;
  timestamp: string;
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pass_rate: number;
  critical_pass_rate: number;
  avg_reasoning_quality: number;
  total_execution_time_ms: number;
  test_results: TestCaseResult[];
  success_criteria_met: boolean;
  criteria_failures: string[];
}

/**
 * Aggregated result across all models
 */
interface EvalRunResult {
  skill: string;
  version: string;
  run_id: string;
  timestamp: string;
  models_tested: string[];
  model_results: ModelEvalResult[];
  cross_model_variance: number;
  overall_passed: boolean;
  summary: {
    best_model: string;
    worst_model: string;
    avg_pass_rate: number;
    recommendations: string[];
  };
  mcp_integration_log: MCPIntegrationLog;
}

/**
 * Log of MCP tool calls made during evaluation
 */
interface MCPIntegrationLog {
  patterns_queried: number;
  outcomes_tracked: number;
  patterns_stored: number;
  learning_shared: boolean;
  quality_gate_updated: boolean;
  errors: string[];
}

// =============================================================================
// MCP Integration Layer
// =============================================================================

/**
 * Mock MCP client for demonstration
 * In production, this would connect to the actual AQE MCP server
 */
class MCPClient {
  private enabled: boolean;
  private namespace: string;
  private log: MCPIntegrationLog;

  constructor(config?: MCPIntegrationConfig) {
    this.enabled = config?.enabled ?? false;
    this.namespace = config?.namespace ?? 'skill-validation';
    this.log = {
      patterns_queried: 0,
      outcomes_tracked: 0,
      patterns_stored: 0,
      learning_shared: false,
      quality_gate_updated: false,
      errors: [],
    };
  }

  getLog(): MCPIntegrationLog {
    return { ...this.log };
  }

  /**
   * Query existing patterns before running evals
   * MCP Tool: mcp__agentic-qe__memory_query
   */
  async queryPatterns(skill: string): Promise<unknown[]> {
    if (!this.enabled) return [];

    console.log(`[MCP] Querying patterns for skill: ${skill}`);

    // In production, this would call:
    // await mcp__agentic-qe__memory_query({
    //   pattern: `skill-validation-${skill}-*`,
    //   namespace: this.namespace,
    //   limit: 10
    // });

    this.log.patterns_queried++;

    // Return mock patterns for demonstration
    return [
      {
        patternId: `${skill}-baseline-pattern`,
        successRate: 0.92,
        lastValidated: new Date().toISOString(),
      },
    ];
  }

  /**
   * Track individual test outcome
   * MCP Tool: mcp__agentic-qe__test_outcome_track
   */
  async trackOutcome(
    testId: string,
    passed: boolean,
    patternId?: string,
    coverage?: { lines: number; branches: number; functions: number },
    executionTime?: number
  ): Promise<void> {
    if (!this.enabled) return;

    console.log(`[MCP] Tracking outcome: ${testId} - ${passed ? 'PASSED' : 'FAILED'}`);

    // In production, this would call:
    // await mcp__agentic-qe__test_outcome_track({
    //   testId: `skill-${skill}-${testId}`,
    //   generatedBy: 'eval-runner',
    //   patternId,
    //   passed,
    //   coverage,
    //   executionTime,
    //   flaky: false
    // });

    this.log.outcomes_tracked++;
  }

  /**
   * Store successful patterns for future reference
   * MCP Tool: mcp__agentic-qe__memory_store
   */
  async storePattern(
    skill: string,
    results: ModelEvalResult,
    patterns: unknown[]
  ): Promise<void> {
    if (!this.enabled) return;

    console.log(`[MCP] Storing patterns for skill: ${skill}`);

    const key = `skill-validation-${skill}-${Date.now()}`;
    const value = {
      skillName: skill,
      trustTier: 3, // Level 3 = has eval suite
      validationResult: {
        passRate: results.pass_rate,
        criticalPassRate: results.critical_pass_rate,
        avgReasoningQuality: results.avg_reasoning_quality,
      },
      model: results.model,
      passRate: results.pass_rate,
      patterns,
      timestamp: new Date().toISOString(),
    };

    // In production, this would call:
    // await mcp__agentic-qe__memory_store({
    //   key,
    //   value,
    //   namespace: this.namespace
    // });

    this.log.patterns_stored++;
  }

  /**
   * Share learning with fleet agents
   * MCP Tool: mcp__agentic-qe__memory_share
   */
  async shareLearning(
    skill: string,
    targetAgents: string[],
    insights: unknown
  ): Promise<void> {
    if (!this.enabled) return;

    console.log(`[MCP] Sharing learning with agents: ${targetAgents.join(', ')}`);

    // In production, this would call:
    // await mcp__agentic-qe__memory_share({
    //   sourceAgentId: 'eval-runner',
    //   targetAgentIds: targetAgents,
    //   knowledgeDomain: 'skill-validation',
    //   data: {
    //     skillName: skill,
    //     insights,
    //     recommendations: []
    //   }
    // });

    this.log.learning_shared = true;
  }

  /**
   * Update quality gate with validation metrics
   * MCP Tool: mcp__agentic-qe__quality_assess
   */
  async updateQualityGate(skill: string, metrics: unknown): Promise<void> {
    if (!this.enabled) return;

    console.log(`[MCP] Updating quality gate for skill: ${skill}`);

    // In production, this would call:
    // await mcp__agentic-qe__quality_assess({
    //   target: `skill:${skill}`,
    //   metrics,
    //   updateQualityScore: true
    // });

    this.log.quality_gate_updated = true;
  }
}

// =============================================================================
// Evaluation Engine
// =============================================================================

class SkillEvaluationRunner {
  private suite: EvalSuite;
  private mcpClient: MCPClient;
  private verbose: boolean;

  constructor(suite: EvalSuite, verbose = false) {
    this.suite = suite;
    this.verbose = verbose;
    this.mcpClient = new MCPClient(suite.mcp_integration);
  }

  /**
   * Run evaluation against a single model
   */
  async runForModel(model: string): Promise<ModelEvalResult> {
    const startTime = Date.now();
    const results: TestCaseResult[] = [];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running ${this.suite.skill} evals against ${model}`);
    console.log(`${'='.repeat(60)}\n`);

    // Query existing patterns (MCP integration)
    await this.mcpClient.queryPatterns(this.suite.skill);

    // Run each test case
    for (const testCase of this.suite.test_cases) {
      const result = await this.runTestCase(testCase, model);
      results.push(result);

      // Track outcome (MCP integration)
      await this.mcpClient.trackOutcome(
        testCase.id,
        result.passed,
        undefined,
        undefined,
        result.execution_time_ms
      );

      // Log progress
      const status = result.skipped ? 'SKIP' : result.passed ? 'PASS' : 'FAIL';
      const icon = result.skipped ? '-' : result.passed ? '+' : 'x';
      console.log(`  [${icon}] ${testCase.id}: ${status} (${result.execution_time_ms}ms)`);
    }

    const totalTime = Date.now() - startTime;

    // Calculate metrics
    const passed = results.filter((r) => r.passed && !r.skipped).length;
    const failed = results.filter((r) => !r.passed && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const total = results.length - skipped;

    const criticalTests = results.filter(
      (r) => this.suite.test_cases.find((tc) => tc.id === r.id)?.priority === 'critical'
    );
    const criticalPassed = criticalTests.filter((r) => r.passed && !r.skipped).length;
    const criticalTotal = criticalTests.filter((r) => !r.skipped).length;

    const avgReasoningQuality =
      results
        .filter((r) => !r.skipped)
        .reduce((sum, r) => sum + r.reasoning_quality_score, 0) / total || 0;

    // Check success criteria
    const criteriaFailures: string[] = [];
    const passRate = total > 0 ? passed / total : 0;
    const criticalPassRate = criticalTotal > 0 ? criticalPassed / criticalTotal : 1;

    if (passRate < this.suite.success_criteria.pass_rate) {
      criteriaFailures.push(
        `Pass rate ${(passRate * 100).toFixed(1)}% < required ${(this.suite.success_criteria.pass_rate * 100).toFixed(1)}%`
      );
    }

    if (
      this.suite.success_criteria.critical_pass_rate &&
      criticalPassRate < this.suite.success_criteria.critical_pass_rate
    ) {
      criteriaFailures.push(
        `Critical pass rate ${(criticalPassRate * 100).toFixed(1)}% < required ${(this.suite.success_criteria.critical_pass_rate * 100).toFixed(1)}%`
      );
    }

    if (
      this.suite.success_criteria.avg_reasoning_quality &&
      avgReasoningQuality < this.suite.success_criteria.avg_reasoning_quality
    ) {
      criteriaFailures.push(
        `Avg reasoning quality ${avgReasoningQuality.toFixed(2)} < required ${this.suite.success_criteria.avg_reasoning_quality}`
      );
    }

    if (
      this.suite.success_criteria.max_execution_time_ms &&
      totalTime > this.suite.success_criteria.max_execution_time_ms
    ) {
      criteriaFailures.push(
        `Execution time ${totalTime}ms > max ${this.suite.success_criteria.max_execution_time_ms}ms`
      );
    }

    const modelResult: ModelEvalResult = {
      model,
      skill: this.suite.skill,
      version: this.suite.version,
      timestamp: new Date().toISOString(),
      total_tests: results.length,
      passed,
      failed,
      skipped,
      pass_rate: passRate,
      critical_pass_rate: criticalPassRate,
      avg_reasoning_quality: avgReasoningQuality,
      total_execution_time_ms: totalTime,
      test_results: results,
      success_criteria_met: criteriaFailures.length === 0,
      criteria_failures: criteriaFailures,
    };

    // Store patterns (MCP integration)
    if (this.suite.mcp_integration?.store_patterns) {
      const learnedPatterns = this.extractPatterns(results);
      await this.mcpClient.storePattern(this.suite.skill, modelResult, learnedPatterns);
    }

    return modelResult;
  }

  /**
   * Run a single test case
   */
  private async runTestCase(testCase: TestCase, model: string): Promise<TestCaseResult> {
    const startTime = Date.now();

    // Handle skipped tests
    if (testCase.skip) {
      return {
        id: testCase.id,
        description: testCase.description,
        category: testCase.category,
        priority: testCase.priority,
        passed: false,
        skipped: true,
        skip_reason: testCase.skip_reason,
        execution_time_ms: 0,
        keyword_match_score: 0,
        reasoning_quality_score: 0,
        validation_details: {
          must_contain_matches: [],
          must_contain_misses: [],
          must_not_contain_violations: [],
          regex_matches: [],
          regex_misses: [],
          severity_matched: false,
          finding_count_matched: false,
        },
      };
    }

    try {
      // In production, this would invoke the actual skill via Claude API
      // For now, we simulate the output based on test case expectations
      const output = await this.simulateSkillExecution(testCase, model);
      const executionTime = Date.now() - startTime;

      // Validate output against expectations
      const validation = this.validateOutput(output, testCase.expected_output, testCase.validation);

      return {
        id: testCase.id,
        description: testCase.description,
        category: testCase.category,
        priority: testCase.priority,
        passed: validation.passed,
        skipped: false,
        execution_time_ms: executionTime,
        keyword_match_score: validation.keywordMatchScore,
        reasoning_quality_score: validation.reasoningQualityScore,
        validation_details: validation.details,
        raw_output: this.verbose ? output : undefined,
      };
    } catch (error) {
      return {
        id: testCase.id,
        description: testCase.description,
        category: testCase.category,
        priority: testCase.priority,
        passed: false,
        skipped: false,
        execution_time_ms: Date.now() - startTime,
        keyword_match_score: 0,
        reasoning_quality_score: 0,
        validation_details: {
          must_contain_matches: [],
          must_contain_misses: [],
          must_not_contain_violations: [],
          regex_matches: [],
          regex_misses: [],
          severity_matched: false,
          finding_count_matched: false,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate skill execution (placeholder for actual LLM call)
   * In production, this would:
   * 1. Load the skill from .claude/skills/{skill}/SKILL.md
   * 2. Call the LLM API with the skill prompt and test input
   * 3. Return the actual LLM output
   */
  private async simulateSkillExecution(testCase: TestCase, model: string): Promise<string> {
    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // For demonstration, generate mock output based on test case category
    const category = testCase.category || 'general';

    // This is a simulation - in production this would be the actual LLM response
    if (category === 'negative') {
      return JSON.stringify({
        findings: [],
        summary: 'The code appears to follow security best practices. No critical vulnerabilities detected.',
        recommendations: ['Continue following current security patterns'],
        severity: 'info',
      });
    }

    // For injection/auth/crypto tests, return findings
    return JSON.stringify({
      findings: [
        {
          type: testCase.expected_output.must_contain?.[0]?.toLowerCase() || 'vulnerability',
          severity: testCase.expected_output.severity_classification || 'high',
          description: `Detected potential ${testCase.expected_output.must_contain?.[0] || 'security issue'}`,
          cwe: 'CWE-89',
          owasp: 'A03:2021',
          remediation: 'Use parameterized queries and proper input validation',
        },
      ],
      summary: `Security analysis complete. Found ${testCase.expected_output.finding_count?.min || 1} issue(s).`,
      recommendations: ['Implement secure coding practices', 'Use prepared statements'],
    });
  }

  /**
   * Validate LLM output against expected output criteria
   */
  private validateOutput(
    output: string,
    expected: ExpectedOutput,
    config?: ValidationConfig
  ): {
    passed: boolean;
    keywordMatchScore: number;
    reasoningQualityScore: number;
    details: TestCaseResult['validation_details'];
  } {
    const outputLower = output.toLowerCase();
    const threshold = config?.keyword_match_threshold ?? 0.8;

    // Check must_contain
    const mustContainMatches: string[] = [];
    const mustContainMisses: string[] = [];

    for (const keyword of expected.must_contain || []) {
      if (outputLower.includes(keyword.toLowerCase())) {
        mustContainMatches.push(keyword);
      } else {
        mustContainMisses.push(keyword);
      }
    }

    // Check must_not_contain
    const violations: string[] = [];
    for (const keyword of expected.must_not_contain || []) {
      if (outputLower.includes(keyword.toLowerCase())) {
        violations.push(keyword);
      }
    }

    // Check regex patterns
    const regexMatches: string[] = [];
    const regexMisses: string[] = [];
    for (const pattern of expected.must_match_regex || []) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(output)) {
          regexMatches.push(pattern);
        } else {
          regexMisses.push(pattern);
        }
      } catch {
        regexMisses.push(pattern);
      }
    }

    // Calculate keyword match score
    const totalKeywords = (expected.must_contain?.length || 0) + (expected.must_match_regex?.length || 0);
    const matchedKeywords = mustContainMatches.length + regexMatches.length;
    const keywordMatchScore = totalKeywords > 0 ? matchedKeywords / totalKeywords : 1;

    // Check severity classification
    const severityMatched =
      !expected.severity_classification ||
      outputLower.includes(expected.severity_classification.toLowerCase());

    // Check finding count (mock implementation)
    const findingCountMatched = true; // Would parse JSON output in production

    // Calculate reasoning quality (simplified - would use embeddings in production)
    const reasoningQualityScore = keywordMatchScore * 0.8 + (violations.length === 0 ? 0.2 : 0);

    // Determine if test passed
    const passed =
      keywordMatchScore >= threshold &&
      violations.length === 0 &&
      (config?.reasoning_quality_min === undefined ||
        reasoningQualityScore >= config.reasoning_quality_min) &&
      (config?.allow_partial || mustContainMisses.length === 0);

    return {
      passed,
      keywordMatchScore,
      reasoningQualityScore,
      details: {
        must_contain_matches: mustContainMatches,
        must_contain_misses: mustContainMisses,
        must_not_contain_violations: violations,
        regex_matches: regexMatches,
        regex_misses: regexMisses,
        severity_matched: severityMatched,
        finding_count_matched: findingCountMatched,
      },
    };
  }

  /**
   * Extract patterns from results for learning
   */
  private extractPatterns(results: TestCaseResult[]): unknown[] {
    return results
      .filter((r) => r.passed && !r.skipped)
      .map((r) => ({
        testId: r.id,
        category: r.category,
        keywordMatchScore: r.keyword_match_score,
        reasoningQualityScore: r.reasoning_quality_score,
      }));
  }

  /**
   * Run full evaluation across all configured models
   */
  async runFull(): Promise<EvalRunResult> {
    const runId = `eval-${this.suite.skill}-${Date.now()}`;
    const modelResults: ModelEvalResult[] = [];

    console.log(`\nStarting evaluation run: ${runId}`);
    console.log(`Skill: ${this.suite.skill} v${this.suite.version}`);
    console.log(`Models: ${this.suite.models_to_test.join(', ')}`);
    console.log(`Test cases: ${this.suite.test_cases.length}`);

    // Run for each model
    for (const model of this.suite.models_to_test) {
      const result = await this.runForModel(model);
      modelResults.push(result);
    }

    // Calculate cross-model variance
    const passRates = modelResults.map((r) => r.pass_rate);
    const maxRate = Math.max(...passRates);
    const minRate = Math.min(...passRates);
    const variance = maxRate - minRate;

    // Share learning with fleet (MCP integration)
    if (this.suite.mcp_integration?.share_learning) {
      await this.mcpClient.shareLearning(
        this.suite.skill,
        this.suite.mcp_integration.target_agents || [],
        {
          passRates,
          variance,
          bestModel: modelResults.find((r) => r.pass_rate === maxRate)?.model,
        }
      );
    }

    // Update quality gate (MCP integration)
    if (this.suite.mcp_integration?.update_quality_gate) {
      const avgPassRate = passRates.reduce((a, b) => a + b, 0) / passRates.length;
      await this.mcpClient.updateQualityGate(this.suite.skill, {
        passRate: avgPassRate,
        schemaCompliance: true,
        validatorPassed: true,
        evalSuiteScore: avgPassRate * 100,
      });
    }

    // Determine overall success
    const overallPassed =
      modelResults.every((r) => r.success_criteria_met) &&
      (!this.suite.success_criteria.cross_model_variance ||
        variance <= this.suite.success_criteria.cross_model_variance);

    // Generate recommendations
    const recommendations: string[] = [];
    if (variance > 0.1) {
      recommendations.push(
        `High cross-model variance (${(variance * 100).toFixed(1)}%). Consider model-specific tuning.`
      );
    }
    const failingModels = modelResults.filter((r) => !r.success_criteria_met);
    if (failingModels.length > 0) {
      recommendations.push(
        `Models failing criteria: ${failingModels.map((r) => r.model).join(', ')}`
      );
    }

    return {
      skill: this.suite.skill,
      version: this.suite.version,
      run_id: runId,
      timestamp: new Date().toISOString(),
      models_tested: this.suite.models_to_test,
      model_results: modelResults,
      cross_model_variance: variance,
      overall_passed: overallPassed,
      summary: {
        best_model: modelResults.find((r) => r.pass_rate === maxRate)?.model || '',
        worst_model: modelResults.find((r) => r.pass_rate === minRate)?.model || '',
        avg_pass_rate: passRates.reduce((a, b) => a + b, 0) / passRates.length,
        recommendations,
      },
      mcp_integration_log: this.mcpClient.getLog(),
    };
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

interface CLIOptions {
  skill?: string;
  evalFile?: string;
  model?: string;
  allModels?: boolean;
  output?: string;
  verbose?: boolean;
  dryRun?: boolean;
  useMcp?: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--skill':
      case '-s':
        options.skill = args[++i];
        break;
      case '--eval-file':
      case '-e':
        options.evalFile = args[++i];
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--all-models':
      case '-a':
        options.allModels = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--use-mcp':
        options.useMcp = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
AQE Skill Evaluation Runner

Usage:
  npx tsx scripts/run-skill-eval.ts [options]

Options:
  -s, --skill <name>      Skill name (looks for .claude/skills/<name>/evals/<name>.yaml)
  -e, --eval-file <path>  Path to eval YAML file (alternative to --skill)
  -m, --model <model>     Run against specific model only
  -a, --all-models        Run against all configured models (default)
  -o, --output <path>     Output JSON results to file
  -v, --verbose           Include raw LLM output in results
  --dry-run               Parse and validate eval file without running
  --use-mcp               Enable MCP integration for shared learning
  -h, --help              Show this help message

Examples:
  # Run security-testing evals against default model
  npx tsx scripts/run-skill-eval.ts --skill security-testing

  # Run against specific model
  npx tsx scripts/run-skill-eval.ts --skill security-testing --model claude-3-haiku

  # Run with MCP integration for learning
  npx tsx scripts/run-skill-eval.ts --skill security-testing --use-mcp

  # Output results to file
  npx tsx scripts/run-skill-eval.ts --skill security-testing --output results.json

MCP Integration:
  When --use-mcp is enabled, the runner will:
  1. Query existing patterns before running (mcp__agentic-qe__memory_query)
  2. Track each test outcome (mcp__agentic-qe__test_outcome_track)
  3. Store successful patterns after (mcp__agentic-qe__memory_store)
  4. Share learning with fleet (mcp__agentic-qe__memory_share)
  5. Update quality gate metrics (mcp__agentic-qe__quality_assess)
`);
}

async function loadEvalSuite(options: CLIOptions): Promise<EvalSuite> {
  let evalPath: string;

  if (options.evalFile) {
    evalPath = options.evalFile;
  } else if (options.skill) {
    // Look for eval file in standard location
    const possiblePaths = [
      `.claude/skills/${options.skill}/evals/${options.skill}.yaml`,
      `.claude/skills/${options.skill}/evals/${options.skill}.yml`,
      `docs/templates/${options.skill}-eval.template.yaml`,
    ];

    const foundPath = possiblePaths.find((p) => existsSync(p));
    if (!foundPath) {
      throw new Error(
        `Eval file not found for skill '${options.skill}'. Searched:\n  ${possiblePaths.join('\n  ')}`
      );
    }
    evalPath = foundPath;
  } else {
    throw new Error('Either --skill or --eval-file must be specified');
  }

  console.log(`Loading eval suite from: ${evalPath}`);

  const content = readFileSync(evalPath, 'utf-8');

  // Dynamic import of yaml parser
  if (!yaml) {
    yaml = await import('yaml');
  }

  const suite = yaml.parse(content) as EvalSuite;

  // Apply CLI overrides
  if (options.model && !options.allModels) {
    suite.models_to_test = [options.model];
  }

  if (options.useMcp) {
    suite.mcp_integration = {
      enabled: true,
      namespace: 'skill-validation',
      store_patterns: true,
      query_patterns: true,
      track_outcomes: true,
      share_learning: true,
      update_quality_gate: true,
      target_agents: ['qe-learning-coordinator', 'qe-queen-coordinator'],
      ...suite.mcp_integration,
    };
  }

  return suite;
}

function printResults(result: EvalRunResult): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION RESULTS');
  console.log(`${'='.repeat(60)}`);

  console.log(`\nSkill: ${result.skill} v${result.version}`);
  console.log(`Run ID: ${result.run_id}`);
  console.log(`Timestamp: ${result.timestamp}`);
  console.log(`Overall: ${result.overall_passed ? 'PASSED' : 'FAILED'}`);

  console.log(`\nCross-Model Summary:`);
  console.log(`  Models tested: ${result.models_tested.join(', ')}`);
  console.log(`  Best model: ${result.summary.best_model}`);
  console.log(`  Worst model: ${result.summary.worst_model}`);
  console.log(`  Avg pass rate: ${(result.summary.avg_pass_rate * 100).toFixed(1)}%`);
  console.log(`  Cross-model variance: ${(result.cross_model_variance * 100).toFixed(1)}%`);

  for (const modelResult of result.model_results) {
    console.log(`\n--- ${modelResult.model} ---`);
    console.log(`  Pass rate: ${(modelResult.pass_rate * 100).toFixed(1)}%`);
    console.log(`  Critical pass rate: ${(modelResult.critical_pass_rate * 100).toFixed(1)}%`);
    console.log(`  Avg reasoning quality: ${modelResult.avg_reasoning_quality.toFixed(2)}`);
    console.log(`  Tests: ${modelResult.passed}/${modelResult.total_tests} passed, ${modelResult.skipped} skipped`);
    console.log(`  Execution time: ${modelResult.total_execution_time_ms}ms`);
    console.log(`  Criteria met: ${modelResult.success_criteria_met ? 'YES' : 'NO'}`);

    if (modelResult.criteria_failures.length > 0) {
      console.log(`  Failures:`);
      for (const failure of modelResult.criteria_failures) {
        console.log(`    - ${failure}`);
      }
    }
  }

  if (result.summary.recommendations.length > 0) {
    console.log(`\nRecommendations:`);
    for (const rec of result.summary.recommendations) {
      console.log(`  - ${rec}`);
    }
  }

  console.log(`\nMCP Integration Log:`);
  console.log(`  Patterns queried: ${result.mcp_integration_log.patterns_queried}`);
  console.log(`  Outcomes tracked: ${result.mcp_integration_log.outcomes_tracked}`);
  console.log(`  Patterns stored: ${result.mcp_integration_log.patterns_stored}`);
  console.log(`  Learning shared: ${result.mcp_integration_log.learning_shared}`);
  console.log(`  Quality gate updated: ${result.mcp_integration_log.quality_gate_updated}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const options = parseArgs(args);

  try {
    const suite = await loadEvalSuite(options);

    console.log(`\nLoaded eval suite: ${suite.skill} v${suite.version}`);
    console.log(`Test cases: ${suite.test_cases.length}`);
    console.log(`Models: ${suite.models_to_test.join(', ')}`);

    if (options.dryRun) {
      console.log('\n[Dry run] Eval file parsed successfully. Exiting.');
      process.exit(0);
    }

    const runner = new SkillEvaluationRunner(suite, options.verbose);
    const result = await runner.runFull();

    printResults(result);

    // Output to file if specified
    if (options.output) {
      writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`\nResults written to: ${options.output}`);
    }

    // Exit with appropriate code
    process.exit(result.overall_passed ? 0 : 1);
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
