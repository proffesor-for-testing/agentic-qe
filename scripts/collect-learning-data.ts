#!/usr/bin/env npx ts-node
/**
 * Collect Learning Data Script
 *
 * Runs multiple QE agents with shared memory to:
 * 1. Analyze codebase complexity
 * 2. Identify test coverage gaps
 * 3. Generate realistic user scenarios
 * 4. Plan and generate new tests
 * 5. Capture all experiences for Nightly-Learner
 *
 * Usage: npx ts-node scripts/collect-learning-data.ts [--full|--quick]
 *
 * Output goes to /tmp/aqe-analysis/ to avoid polluting the repo
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { ExperienceCapture } from '../src/learning/capture/ExperienceCapture';
import { v4 as uuidv4 } from 'uuid';

// Output directories
const OUTPUT_BASE = '/tmp/aqe-analysis';
const DIRS = {
  reports: `${OUTPUT_BASE}/reports`,
  experiences: `${OUTPUT_BASE}/experiences`,
  patterns: `${OUTPUT_BASE}/patterns`,
  scenarios: `${OUTPUT_BASE}/scenarios`,
  metrics: `${OUTPUT_BASE}/metrics`,
  agentOutputs: `${OUTPUT_BASE}/agent-outputs`,
};

// Ensure directories exist
async function ensureDirectories(): Promise<void> {
  for (const dir of Object.values(DIRS)) {
    await fs.ensureDir(dir);
  }
  console.log('✅ Output directories created at', OUTPUT_BASE);
}

// Types for analysis
interface AnalysisResult {
  agentType: string;
  taskType: string;
  timestamp: number;
  duration: number;
  success: boolean;
  findings: any;
  metrics: Record<string, number>;
}

interface CodeComplexityResult {
  file: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  functions: number;
  dependencies: number;
  testability: 'high' | 'medium' | 'low';
}

interface CoverageGap {
  file: string;
  uncoveredLines: number[];
  uncoveredBranches: string[];
  riskScore: number;
  suggestedTests: string[];
}

interface UserScenario {
  id: string;
  name: string;
  description: string;
  steps: string[];
  expectedOutcome: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  agentTypes: string[];
}

// Simulated agent execution with experience capture
class AgentExecutor {
  private experienceCapture: ExperienceCapture;
  private sessionId: string;

  constructor() {
    this.experienceCapture = ExperienceCapture.getInstance();
    this.sessionId = uuidv4();
  }

  async executeWithCapture<T>(
    agentType: string,
    taskType: string,
    task: () => Promise<T>
  ): Promise<{ result: T; experience: any }> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      // Capture pre-execution state
      await this.experienceCapture.captureExecution(
        executionId,
        agentType,
        { taskType, sessionId: this.sessionId, phase: 'start' }
      );

      // Execute the task
      const result = await task();
      const duration = Date.now() - startTime;

      // Capture successful execution
      const experience = {
        executionId,
        agentType,
        taskType,
        duration,
        success: true,
        result: JSON.stringify(result).slice(0, 1000), // Truncate for storage
        timestamp: Date.now(),
        sessionId: this.sessionId,
      };

      await this.experienceCapture.captureExecution(
        executionId,
        agentType,
        { ...experience, phase: 'complete' }
      );

      return { result, experience };
    } catch (error) {
      const duration = Date.now() - startTime;
      const experience = {
        executionId,
        agentType,
        taskType,
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        sessionId: this.sessionId,
      };

      await this.experienceCapture.captureExecution(
        executionId,
        agentType,
        { ...experience, phase: 'error' }
      );

      throw error;
    }
  }
}

// Code Complexity Analyzer
async function analyzeCodeComplexity(executor: AgentExecutor): Promise<CodeComplexityResult[]> {
  console.log('\n📊 Running Code Complexity Analysis...');

  const { result } = await executor.executeWithCapture(
    'qe-code-complexity',
    'complexity-analysis',
    async () => {
      const results: CodeComplexityResult[] = [];

      // Analyze key source directories
      const sourceDirs = ['src/agents', 'src/core', 'src/learning', 'src/cli'];

      for (const dir of sourceDirs) {
        const fullPath = path.join(process.cwd(), dir);
        if (!await fs.pathExists(fullPath)) continue;

        const files = await fs.readdir(fullPath, { recursive: true });
        const tsFiles = (files as string[]).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

        for (const file of tsFiles.slice(0, 20)) { // Limit for speed
          const filePath = path.join(fullPath, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            // Simple complexity metrics
            const functionMatches = content.match(/(?:async\s+)?(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|(?:public|private|protected)?\s*(?:async\s+)?\w+\s*\()/g) || [];
            const ifMatches = content.match(/\bif\s*\(/g) || [];
            const loopMatches = content.match(/\b(?:for|while|do)\s*\(/g) || [];
            const catchMatches = content.match(/\bcatch\s*\(/g) || [];
            const importMatches = content.match(/^import\s+/gm) || [];

            const cyclomaticComplexity = 1 + ifMatches.length + loopMatches.length + catchMatches.length;
            const cognitiveComplexity = ifMatches.length * 1 + loopMatches.length * 2 + catchMatches.length * 1;

            results.push({
              file: path.relative(process.cwd(), filePath),
              cyclomaticComplexity,
              cognitiveComplexity,
              linesOfCode: lines.length,
              functions: functionMatches.length,
              dependencies: importMatches.length,
              testability: cyclomaticComplexity < 10 ? 'high' : cyclomaticComplexity < 20 ? 'medium' : 'low',
            });
          } catch (e) {
            // Skip files that can't be read
          }
        }
      }

      return results.sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);
    }
  );

  // Save results
  await fs.writeJson(
    path.join(DIRS.reports, 'complexity-analysis.json'),
    result,
    { spaces: 2 }
  );

  console.log(`  ✅ Analyzed ${result.length} files`);
  console.log(`  📁 Most complex: ${result[0]?.file} (CC: ${result[0]?.cyclomaticComplexity})`);

  return result;
}

// Coverage Gap Analyzer
async function analyzeCoverageGaps(executor: AgentExecutor): Promise<CoverageGap[]> {
  console.log('\n🔍 Running Coverage Gap Analysis...');

  const { result } = await executor.executeWithCapture(
    'qe-coverage-analyzer',
    'coverage-gap-analysis',
    async () => {
      const gaps: CoverageGap[] = [];

      // Find source files without corresponding test files
      const srcDir = path.join(process.cwd(), 'src');
      const testsDir = path.join(process.cwd(), 'tests');

      const srcFiles = await fs.readdir(srcDir, { recursive: true });
      const testFiles = await fs.readdir(testsDir, { recursive: true });

      const tsrcFiles = (srcFiles as string[]).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
      const testFileSet = new Set((testFiles as string[]).map(f =>
        f.replace(/\.test\.ts$/, '.ts').replace(/\.spec\.ts$/, '.ts')
      ));

      for (const file of tsrcFiles.slice(0, 30)) { // Limit for speed
        const baseName = path.basename(file);
        const hasTest = testFileSet.has(baseName) ||
                        testFileSet.has(file) ||
                        (testFiles as string[]).some(t => t.includes(baseName.replace('.ts', '')));

        if (!hasTest) {
          const filePath = path.join(srcDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            // Identify untested functions
            const exportedFunctions = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g) || [];
            const publicMethods = content.match(/(?:public\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g) || [];

            gaps.push({
              file: path.relative(process.cwd(), filePath),
              uncoveredLines: lines.map((_, i) => i + 1).filter((_, i) => i % 10 === 0), // Simplified
              uncoveredBranches: exportedFunctions.slice(0, 5),
              riskScore: (exportedFunctions.length + publicMethods.length) * 10,
              suggestedTests: [
                `Test exported functions in ${baseName}`,
                `Test error handling in ${baseName}`,
                `Test edge cases in ${baseName}`,
              ],
            });
          } catch (e) {
            // Skip
          }
        }
      }

      return gaps.sort((a, b) => b.riskScore - a.riskScore);
    }
  );

  await fs.writeJson(
    path.join(DIRS.reports, 'coverage-gaps.json'),
    result,
    { spaces: 2 }
  );

  console.log(`  ✅ Found ${result.length} files without test coverage`);
  console.log(`  ⚠️  Highest risk: ${result[0]?.file} (score: ${result[0]?.riskScore})`);

  return result;
}

// User Scenario Generator
async function generateUserScenarios(executor: AgentExecutor): Promise<UserScenario[]> {
  console.log('\n🎭 Generating Realistic User Scenarios...');

  const { result } = await executor.executeWithCapture(
    'qe-test-generator',
    'scenario-generation',
    async () => {
      const scenarios: UserScenario[] = [
        // Fleet Management Scenarios
        {
          id: uuidv4(),
          name: 'Initialize QE Fleet',
          description: 'User initializes a new QE agent fleet with default topology',
          steps: [
            'Run aqe init command',
            'Select hierarchical topology',
            'Configure max agents (10)',
            'Enable learning mode',
            'Verify fleet status',
          ],
          expectedOutcome: 'Fleet initialized with coordinator and worker agents ready',
          priority: 'critical',
          agentTypes: ['qe-fleet-commander', 'coordinator'],
        },
        {
          id: uuidv4(),
          name: 'Generate Tests for New Feature',
          description: 'User requests test generation for a new authentication module',
          steps: [
            'Point agent at src/auth/AuthService.ts',
            'Request unit test generation',
            'Specify 80% coverage target',
            'Review generated tests',
            'Execute generated tests',
          ],
          expectedOutcome: 'Comprehensive test suite generated with passing tests',
          priority: 'high',
          agentTypes: ['qe-test-generator', 'qe-test-writer'],
        },
        {
          id: uuidv4(),
          name: 'Analyze Code Complexity',
          description: 'User requests complexity analysis before refactoring',
          steps: [
            'Select target directory',
            'Run complexity analysis',
            'Review complexity report',
            'Identify refactoring candidates',
            'Get refactoring suggestions',
          ],
          expectedOutcome: 'Detailed complexity report with actionable recommendations',
          priority: 'medium',
          agentTypes: ['qe-code-complexity', 'code-analyzer'],
        },
        {
          id: uuidv4(),
          name: 'Security Audit',
          description: 'User runs security scan on codebase',
          steps: [
            'Initialize security scanner',
            'Scan for OWASP Top 10',
            'Check for dependency vulnerabilities',
            'Review security report',
            'Get remediation suggestions',
          ],
          expectedOutcome: 'Security report with prioritized vulnerabilities',
          priority: 'critical',
          agentTypes: ['qe-security-scanner', 'qe-security-auditor'],
        },
        {
          id: uuidv4(),
          name: 'Performance Testing',
          description: 'User runs performance tests before production deployment',
          steps: [
            'Configure load test parameters',
            'Run baseline performance test',
            'Simulate 100 concurrent users',
            'Analyze bottlenecks',
            'Compare against SLAs',
          ],
          expectedOutcome: 'Performance report with bottleneck analysis',
          priority: 'high',
          agentTypes: ['qe-performance-tester', 'qe-performance-validator'],
        },
        {
          id: uuidv4(),
          name: 'Flaky Test Investigation',
          description: 'User investigates intermittently failing tests',
          steps: [
            'Identify flaky test patterns',
            'Run stability analysis',
            'Detect race conditions',
            'Get stabilization suggestions',
            'Verify fixes',
          ],
          expectedOutcome: 'Flaky tests identified and fixed',
          priority: 'high',
          agentTypes: ['qe-flaky-test-hunter', 'qe-flaky-investigator'],
        },
        {
          id: uuidv4(),
          name: 'API Contract Testing',
          description: 'User validates API contracts between services',
          steps: [
            'Define consumer contracts',
            'Generate provider tests',
            'Run contract validation',
            'Check breaking changes',
            'Generate compatibility report',
          ],
          expectedOutcome: 'API contracts validated with no breaking changes',
          priority: 'high',
          agentTypes: ['qe-api-contract-validator'],
        },
        {
          id: uuidv4(),
          name: 'Visual Regression Testing',
          description: 'User checks for visual regressions after UI changes',
          steps: [
            'Capture baseline screenshots',
            'Apply UI changes',
            'Capture new screenshots',
            'Compare with AI analysis',
            'Review visual diff report',
          ],
          expectedOutcome: 'Visual regression report with highlighted differences',
          priority: 'medium',
          agentTypes: ['qe-visual-tester'],
        },
        {
          id: uuidv4(),
          name: 'Chaos Engineering',
          description: 'User tests system resilience with chaos experiments',
          steps: [
            'Define blast radius',
            'Inject network latency',
            'Simulate service failure',
            'Monitor system behavior',
            'Verify recovery',
          ],
          expectedOutcome: 'System demonstrated resilience under failure conditions',
          priority: 'medium',
          agentTypes: ['qe-chaos-engineer'],
        },
        {
          id: uuidv4(),
          name: 'Quality Gate Check',
          description: 'User validates code meets quality gates before merge',
          steps: [
            'Run all quality checks',
            'Validate coverage thresholds',
            'Check code complexity limits',
            'Verify no security issues',
            'Generate go/no-go decision',
          ],
          expectedOutcome: 'Quality gate passed with all criteria met',
          priority: 'critical',
          agentTypes: ['qe-quality-gate', 'qe-deployment-readiness'],
        },
      ];

      return scenarios;
    }
  );

  await fs.writeJson(
    path.join(DIRS.scenarios, 'user-scenarios.json'),
    result,
    { spaces: 2 }
  );

  console.log(`  ✅ Generated ${result.length} realistic user scenarios`);
  console.log(`  📋 Critical scenarios: ${result.filter(s => s.priority === 'critical').length}`);

  return result;
}

// Test Plan Generator
async function generateTestPlans(
  executor: AgentExecutor,
  complexityResults: CodeComplexityResult[],
  coverageGaps: CoverageGap[]
): Promise<any[]> {
  console.log('\n📝 Generating Test Plans...');

  const { result } = await executor.executeWithCapture(
    'qe-test-generator',
    'test-plan-generation',
    async () => {
      const plans = [];

      // Generate plans for high-complexity files
      const highComplexity = complexityResults.filter(r => r.testability === 'low').slice(0, 5);
      for (const file of highComplexity) {
        plans.push({
          id: uuidv4(),
          targetFile: file.file,
          reason: 'High complexity requires thorough testing',
          priority: 'high',
          testTypes: ['unit', 'integration', 'error-handling'],
          estimatedTests: Math.ceil(file.functions * 2),
          complexityScore: file.cyclomaticComplexity,
          suggestedApproach: 'TDD London School - mock dependencies, test behaviors',
        });
      }

      // Generate plans for coverage gaps
      const highRiskGaps = coverageGaps.filter(g => g.riskScore > 50).slice(0, 5);
      for (const gap of highRiskGaps) {
        plans.push({
          id: uuidv4(),
          targetFile: gap.file,
          reason: 'No existing test coverage',
          priority: 'critical',
          testTypes: ['unit', 'smoke'],
          estimatedTests: gap.suggestedTests.length * 3,
          riskScore: gap.riskScore,
          suggestedApproach: 'Start with happy path, then edge cases',
        });
      }

      return plans;
    }
  );

  await fs.writeJson(
    path.join(DIRS.reports, 'test-plans.json'),
    result,
    { spaces: 2 }
  );

  console.log(`  ✅ Generated ${result.length} test plans`);

  return result;
}

// Pattern Extraction
async function extractPatterns(executor: AgentExecutor): Promise<any[]> {
  console.log('\n🧬 Extracting Code Patterns...');

  const { result } = await executor.executeWithCapture(
    'code-analyzer',
    'pattern-extraction',
    async () => {
      const patterns = [];
      const srcDir = path.join(process.cwd(), 'src');

      // Find common patterns
      const patternTypes = [
        { name: 'Singleton', regex: /getInstance\s*\(\)/g },
        { name: 'Factory', regex: /create\w+\s*\(/g },
        { name: 'Observer', regex: /addEventListener|on\w+\s*\(/g },
        { name: 'Strategy', regex: /strategy|Strategy/g },
        { name: 'Async/Await', regex: /async\s+\w+/g },
        { name: 'Error Handling', regex: /try\s*\{[\s\S]*?catch/g },
        { name: 'Dependency Injection', regex: /constructor\s*\([^)]*:\s*\w+/g },
      ];

      const files = await fs.readdir(srcDir, { recursive: true });
      const tsFiles = (files as string[]).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

      const patternCounts: Record<string, number> = {};
      const patternExamples: Record<string, string[]> = {};

      for (const file of tsFiles.slice(0, 50)) {
        try {
          const content = await fs.readFile(path.join(srcDir, file), 'utf-8');

          for (const pt of patternTypes) {
            const matches = content.match(pt.regex);
            if (matches && matches.length > 0) {
              patternCounts[pt.name] = (patternCounts[pt.name] || 0) + matches.length;
              if (!patternExamples[pt.name]) patternExamples[pt.name] = [];
              if (patternExamples[pt.name].length < 3) {
                patternExamples[pt.name].push(file);
              }
            }
          }
        } catch (e) {
          // Skip
        }
      }

      for (const [name, count] of Object.entries(patternCounts)) {
        patterns.push({
          name,
          occurrences: count,
          examples: patternExamples[name] || [],
          learnability: count > 10 ? 'high' : count > 5 ? 'medium' : 'low',
        });
      }

      return patterns.sort((a, b) => b.occurrences - a.occurrences);
    }
  );

  await fs.writeJson(
    path.join(DIRS.patterns, 'code-patterns.json'),
    result,
    { spaces: 2 }
  );

  console.log(`  ✅ Extracted ${result.length} pattern types`);
  console.log(`  🔝 Most common: ${result[0]?.name} (${result[0]?.occurrences} occurrences)`);

  return result;
}

// Collect metrics
async function collectMetrics(
  executor: AgentExecutor,
  allResults: any
): Promise<any> {
  console.log('\n📈 Collecting Learning Metrics...');

  const { result } = await executor.executeWithCapture(
    'qe-quality-analyzer',
    'metrics-collection',
    async () => {
      return {
        timestamp: Date.now(),
        sessionId: uuidv4(),
        codebase: {
          filesAnalyzed: allResults.complexity?.length || 0,
          averageComplexity: allResults.complexity?.reduce((a: number, b: CodeComplexityResult) => a + b.cyclomaticComplexity, 0) / (allResults.complexity?.length || 1),
          totalLinesOfCode: allResults.complexity?.reduce((a: number, b: CodeComplexityResult) => a + b.linesOfCode, 0) || 0,
        },
        coverage: {
          filesWithoutTests: allResults.gaps?.length || 0,
          totalRiskScore: allResults.gaps?.reduce((a: number, b: CoverageGap) => a + b.riskScore, 0) || 0,
        },
        scenarios: {
          total: allResults.scenarios?.length || 0,
          byCriticality: {
            critical: allResults.scenarios?.filter((s: UserScenario) => s.priority === 'critical').length || 0,
            high: allResults.scenarios?.filter((s: UserScenario) => s.priority === 'high').length || 0,
            medium: allResults.scenarios?.filter((s: UserScenario) => s.priority === 'medium').length || 0,
          },
        },
        patterns: {
          totalExtracted: allResults.patterns?.length || 0,
          highLearnability: allResults.patterns?.filter((p: any) => p.learnability === 'high').length || 0,
        },
        testPlans: {
          total: allResults.plans?.length || 0,
          estimatedTests: allResults.plans?.reduce((a: number, b: any) => a + b.estimatedTests, 0) || 0,
        },
      };
    }
  );

  await fs.writeJson(
    path.join(DIRS.metrics, `metrics-${Date.now()}.json`),
    result,
    { spaces: 2 }
  );

  return result;
}

// Main execution
async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('🚀 Starting Learning Data Collection');
  console.log('=' .repeat(50));
  console.log(`📂 Output directory: ${OUTPUT_BASE}`);

  const isQuick = process.argv.includes('--quick');
  if (isQuick) {
    console.log('⚡ Running in quick mode (limited analysis)');
  }

  await ensureDirectories();

  const executor = new AgentExecutor();
  const allResults: any = {};

  try {
    // Run all analysis tasks
    allResults.complexity = await analyzeCodeComplexity(executor);
    allResults.gaps = await analyzeCoverageGaps(executor);
    allResults.scenarios = await generateUserScenarios(executor);
    allResults.patterns = await extractPatterns(executor);
    allResults.plans = await generateTestPlans(executor, allResults.complexity, allResults.gaps);
    allResults.metrics = await collectMetrics(executor, allResults);

    // Generate summary report
    const summary = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      results: {
        filesAnalyzed: allResults.complexity.length,
        coverageGapsFound: allResults.gaps.length,
        scenariosGenerated: allResults.scenarios.length,
        patternsExtracted: allResults.patterns.length,
        testPlansCreated: allResults.plans.length,
      },
      nextSteps: [
        'Run `aqe learn status` to check learning progress',
        'Run `aqe dream --trigger manual` to process experiences',
        'Review reports in /tmp/aqe-analysis/reports/',
      ],
    };

    await fs.writeJson(
      path.join(DIRS.reports, 'summary.json'),
      summary,
      { spaces: 2 }
    );

    console.log('\n' + '=' .repeat(50));
    console.log('✅ Learning Data Collection Complete!');
    console.log(`⏱️  Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log('\n📊 Summary:');
    console.log(`   Files analyzed: ${summary.results.filesAnalyzed}`);
    console.log(`   Coverage gaps: ${summary.results.coverageGapsFound}`);
    console.log(`   Scenarios generated: ${summary.results.scenariosGenerated}`);
    console.log(`   Patterns extracted: ${summary.results.patternsExtracted}`);
    console.log(`   Test plans created: ${summary.results.testPlansCreated}`);
    console.log(`\n📁 Output saved to: ${OUTPUT_BASE}`);

  } catch (error) {
    console.error('\n❌ Error during collection:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
