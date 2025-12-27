#!/usr/bin/env npx ts-node
/**
 * Execute Real QE Agents Against Codebase
 *
 * This script runs actual QE agents through the proper execution path
 * which triggers ExperienceCapture in BaseAgent, storing experiences
 * in memory.db for the Nightly-Learner to process.
 *
 * Output files go to /tmp/aqe-analysis/ to avoid polluting the repo.
 */

import * as fs from 'fs';
import * as path from 'path';
import { QEAgentFactory } from '../src/agents';
import { EventBus } from '../src/core/EventBus';
import { MemoryManager } from '../src/core/MemoryManager';
import { ExperienceCapture, CaptureStats } from '../src/learning/capture/ExperienceCapture';
import { QEAgentType, AgentContext, AgentStatus, TaskAssignment, QETask } from '../src/types';
import { Database } from '../src/utils/Database';

const OUTPUT_DIR = '/tmp/aqe-analysis';

async function ensureOutputDir() {
  const dirs = [
    OUTPUT_DIR,
    `${OUTPUT_DIR}/reports`,
    `${OUTPUT_DIR}/patterns`,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

async function readSourceFile(filePath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf-8');
  }
  return '';
}

async function getFilesForAnalysis(): Promise<string[]> {
  // Get real source files from our codebase
  const srcDir = path.join(process.cwd(), 'src/agents');
  const files: string[] = [];

  function walkDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath.replace(process.cwd() + '/', ''));
      }
    }
  }

  walkDir(srcDir);
  return files.slice(0, 10); // Limit to 10 files for this run
}

function createTaskAssignment(taskType: string, payload: any, agentId: string): TaskAssignment {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return {
    id: taskId,
    task: {
      id: taskId,
      type: taskType,
      payload,
      priority: 5,
      status: 'pending',
      description: `${taskType} task`,
      context: {},
      requirements: {}
    } as QETask,
    agentId,
    assignedAt: new Date(),
    status: 'assigned'
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('REAL QE AGENT EXECUTION');
  console.log('='.repeat(60));
  console.log('');

  await ensureOutputDir();

  // Get initial experience count
  const experienceCapture = await ExperienceCapture.getSharedInstance();
  const initialStats: CaptureStats = await experienceCapture.getStats();
  console.log(`Initial experiences in DB: ${initialStats.totalCaptured}`);
  console.log('');

  // Initialize core components
  const eventBus = new EventBus();
  const database = new Database('.agentic-qe/memory.db');
  const memoryManager = new MemoryManager(database);
  await memoryManager.initialize();

  // Create context (matches AgentContext interface)
  const context: AgentContext = {
    id: 'script-runner',
    type: 'script',
    status: AgentStatus.ACTIVE,
    metadata: { workingDir: process.cwd() }
  };

  // Create factory with proper config
  const factory = new QEAgentFactory({
    eventBus,
    memoryStore: memoryManager,
    context
  });

  // Get real source files
  const sourceFiles = await getFilesForAnalysis();
  console.log(`Found ${sourceFiles.length} source files for analysis`);
  console.log('');

  const results: any[] = [];

  // ==========================================
  // 1. Code Complexity Analysis (QualityAnalyzer)
  // ==========================================
  console.log('--- Task 1: Code Complexity Analysis ---');
  try {
    const qualityAgent = await factory.createAgent(QEAgentType.QUALITY_ANALYZER);
    await qualityAgent.initialize();

    for (const file of sourceFiles.slice(0, 3)) {
      const content = await readSourceFile(file);
      if (!content) continue;

      console.log(`  Analyzing: ${file}`);
      const assignment = createTaskAssignment('complexity-analysis', {
        sourceCode: {
          files: [{
            path: file,
            content: content,
            language: 'typescript'
          }],
          complexityMetrics: {}
        },
        thresholds: {
          cyclomaticComplexity: 10,
          cognitiveComplexity: 15,
          maintainabilityIndex: 65
        }
      }, (qualityAgent as any).agentId.id);

      const result = await qualityAgent.executeTask(assignment);

      results.push({
        task: 'complexity-analysis',
        file,
        result: result.success ? 'success' : 'failed',
        metrics: result.data?.complexity || {}
      });
    }
    console.log('  ✓ Complexity analysis complete');
  } catch (error) {
    console.log(`  ✗ Complexity analysis failed: ${error}`);
  }
  console.log('');

  // ==========================================
  // 2. Test Generation
  // ==========================================
  console.log('--- Task 2: Test Generation ---');
  try {
    const testGenAgent = await factory.createAgent(QEAgentType.TEST_GENERATOR);
    await testGenAgent.initialize();

    for (const file of sourceFiles.slice(0, 3)) {
      const content = await readSourceFile(file);
      if (!content) continue;

      console.log(`  Generating tests for: ${file}`);
      const assignment = createTaskAssignment('generate-tests', {
        sourceCode: {
          files: [{
            path: file,
            content: content,
            language: 'typescript'
          }],
          complexityMetrics: {
            cyclomaticComplexity: 5,
            cognitiveComplexity: 8,
            functionCount: 10,
            linesOfCode: content.split('\n').length
          }
        },
        framework: 'jest',
        coverage: { target: 80, type: 'line' },
        constraints: {
          maxTests: 5,
          maxExecutionTime: 30000,
          testTypes: ['unit']
        }
      }, (testGenAgent as any).agentId.id);

      const result = await testGenAgent.executeTask(assignment);

      results.push({
        task: 'test-generation',
        file,
        result: result.success ? 'success' : 'failed',
        testsGenerated: result.data?.testSuite?.tests?.length || 0
      });
    }
    console.log('  ✓ Test generation complete');
  } catch (error) {
    console.log(`  ✗ Test generation failed: ${error}`);
  }
  console.log('');

  // ==========================================
  // 3. Coverage Analysis
  // ==========================================
  console.log('--- Task 3: Coverage Analysis ---');
  try {
    const coverageAgent = await factory.createAgent(QEAgentType.COVERAGE_ANALYZER);
    await coverageAgent.initialize();

    const assignment = createTaskAssignment('analyze-coverage', {
      sourceFiles: sourceFiles.slice(0, 5).map(f => ({
        path: f,
        content: fs.readFileSync(path.join(process.cwd(), f), 'utf-8')
      })),
      testFiles: [],
      coverageReport: {
        summary: { lines: 65, statements: 65, branches: 50, functions: 70 },
        files: {}
      }
    }, (coverageAgent as any).agentId.id);

    const result = await coverageAgent.executeTask(assignment);

    results.push({
      task: 'coverage-analysis',
      result: result.success ? 'success' : 'failed',
      gaps: result.data?.analysis?.gaps?.length || 0
    });
    console.log('  ✓ Coverage analysis complete');
  } catch (error) {
    console.log(`  ✗ Coverage analysis failed: ${error}`);
  }
  console.log('');

  // ==========================================
  // 4. Quality Gate Check
  // ==========================================
  console.log('--- Task 4: Quality Gate Check ---');
  try {
    const qualityGateAgent = await factory.createAgent(QEAgentType.QUALITY_GATE);
    await qualityGateAgent.initialize();

    const assignment = createTaskAssignment('quality-check', {
      metrics: {
        coverage: { line: 65, branch: 50, function: 70 },
        complexity: { average: 8, max: 25 },
        testHealth: { passing: 95, flaky: 2 }
      },
      gates: {
        coverage: { line: { min: 80 }, branch: { min: 70 } },
        complexity: { max: { average: 10 } },
        testHealth: { passing: { min: 90 } }
      }
    }, (qualityGateAgent as any).agentId.id);

    const result = await qualityGateAgent.executeTask(assignment);

    results.push({
      task: 'quality-gate',
      result: result.success ? 'success' : 'failed',
      passed: result.data?.passed || false,
      failures: result.data?.failures?.length || 0
    });
    console.log('  ✓ Quality gate check complete');
  } catch (error) {
    console.log(`  ✗ Quality gate check failed: ${error}`);
  }
  console.log('');

  // ==========================================
  // 5. Flaky Test Detection
  // ==========================================
  console.log('--- Task 5: Flaky Test Detection ---');
  try {
    const flakyAgent = await factory.createAgent(QEAgentType.FLAKY_TEST_HUNTER);
    await flakyAgent.initialize();

    const assignment = createTaskAssignment('detect-flaky', {
      testHistory: [
        { testId: 'test-1', runs: Array(10).fill(null).map((_, i) => ({ passed: i % 3 !== 0, duration: 100 + Math.random() * 50 })) },
        { testId: 'test-2', runs: Array(10).fill(null).map(() => ({ passed: true, duration: 50 })) },
        { testId: 'test-3', runs: Array(10).fill(null).map((_, i) => ({ passed: i % 5 !== 0, duration: 200 + Math.random() * 100 })) }
      ],
      detectionConfig: {
        minRuns: 5,
        flakinessThreshold: 0.1,
        analyzePatterns: true
      }
    }, (flakyAgent as any).agentId.id);

    const result = await flakyAgent.executeTask(assignment);

    results.push({
      task: 'flaky-detection',
      result: result.success ? 'success' : 'failed',
      flakyTests: result.data?.flakyTests?.length || 0
    });
    console.log('  ✓ Flaky test detection complete');
  } catch (error) {
    console.log(`  ✗ Flaky detection failed: ${error}`);
  }
  console.log('');

  // Force flush experiences before getting final stats
  console.log('Flushing experience buffer...');
  await experienceCapture.flush();

  // Get final experience count
  const finalStats = await experienceCapture.getStats();
  const newExperiences = finalStats.totalCaptured - initialStats.totalCaptured;

  // Write results
  const summary = {
    timestamp: new Date().toISOString(),
    executionResults: results,
    experienceStats: {
      initial: initialStats.totalCaptured,
      final: finalStats.totalCaptured,
      newCaptured: newExperiences
    },
    filesAnalyzed: sourceFiles.length
  };

  fs.writeFileSync(
    `${OUTPUT_DIR}/reports/agent-execution-results.json`,
    JSON.stringify(summary, null, 2)
  );

  console.log('='.repeat(60));
  console.log('EXECUTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tasks executed: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.result === 'success').length}`);
  console.log(`Failed: ${results.filter(r => r.result === 'failed').length}`);
  console.log('');
  console.log(`Experiences in DB before: ${initialStats.totalCaptured}`);
  console.log(`Experiences in DB after:  ${finalStats.totalCaptured}`);
  console.log(`NEW experiences captured: ${newExperiences}`);
  console.log('');
  console.log(`Results saved to: ${OUTPUT_DIR}/reports/agent-execution-results.json`);
  console.log('='.repeat(60));

  // Cleanup
  await memoryManager.close();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
