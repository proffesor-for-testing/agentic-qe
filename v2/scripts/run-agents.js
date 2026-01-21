#!/usr/bin/env node
/**
 * Execute Real QE Agents to Collect Experiences
 *
 * Uses SwarmMemoryManager (via MemoryManagerFactory) to ensure all agents
 * have full learning capabilities including pattern storage and events.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const { QEAgentFactory } = require('../dist/agents');
  const { EventBus } = require('../dist/core/EventBus');
  const { initializeSharedMemoryManager } = require('../dist/core/memory/MemoryManagerFactory');
  const { ExperienceCapture } = require('../dist/learning/capture/ExperienceCapture');
  const { QEAgentType, AgentStatus } = require('../dist/types');

  console.log('============================================================');
  console.log('REAL QE AGENT EXECUTION');
  console.log('============================================================');

  // Get initial experience count
  const experienceCapture = await ExperienceCapture.getSharedInstance();
  const initialStats = await experienceCapture.getStats();
  console.log('Initial experiences in DB:', initialStats.totalCaptured);

  // Initialize core components using SwarmMemoryManager (shared singleton)
  const eventBus = new EventBus();
  const memoryManager = await initializeSharedMemoryManager('.agentic-qe/memory.db');
  console.log('Using SwarmMemoryManager for full learning support\n');

  const context = {
    id: 'script-runner',
    type: 'script',
    status: AgentStatus.ACTIVE,
    metadata: { workingDir: process.cwd() }
  };

  const factory = new QEAgentFactory({
    eventBus,
    memoryStore: memoryManager,
    context
  });

  // Get source files
  const srcDir = path.join(process.cwd(), 'src/agents');
  const files = fs.readdirSync(srcDir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .slice(0, 5)
    .map(f => path.join('src/agents', f));

  console.log('Found', files.length, 'source files\n');

  const results = [];

  // 1. Quality Analysis
  console.log('--- Task 1: Quality Analysis ---');
  try {
    const agent = await factory.createAgent(QEAgentType.QUALITY_ANALYZER);
    await agent.initialize();

    for (const file of files.slice(0, 2)) {
      const content = fs.readFileSync(file, 'utf-8');
      console.log('  Analyzing:', file);

      const assignment = {
        id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        task: {
          id: 'task-' + Date.now(),
          type: 'complexity-analysis',
          payload: {
            sourceCode: { files: [{ path: file, content, language: 'typescript' }] }
          },
          priority: 5,
          status: 'pending'
        },
        agentId: agent.agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      results.push({ task: 'complexity', file, success: result.success });
    }
    console.log('  ✓ Quality analysis complete\n');
  } catch (e) {
    console.log('  ✗ Quality analysis failed:', e.message, '\n');
  }

  // 2. Test Generation
  console.log('--- Task 2: Test Generation ---');
  try {
    const agent = await factory.createAgent(QEAgentType.TEST_GENERATOR);
    await agent.initialize();

    for (const file of files.slice(0, 2)) {
      const content = fs.readFileSync(file, 'utf-8');
      console.log('  Generating tests for:', file);

      const assignment = {
        id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        task: {
          id: 'task-' + Date.now(),
          type: 'generate-tests',
          payload: {
            sourceCode: {
              files: [{ path: file, content, language: 'typescript' }],
              complexityMetrics: { cyclomaticComplexity: 5 }
            },
            framework: 'jest'
          },
          priority: 5,
          status: 'pending'
        },
        agentId: agent.agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      results.push({ task: 'test-gen', file, success: result.success, tests: result.data?.testSuite?.tests?.length || 0 });
    }
    console.log('  ✓ Test generation complete\n');
  } catch (e) {
    console.log('  ✗ Test generation failed:', e.message, '\n');
  }

  // 3. Coverage Analysis
  console.log('--- Task 3: Coverage Analysis ---');
  try {
    const agent = await factory.createAgent(QEAgentType.COVERAGE_ANALYZER);
    await agent.initialize();

    // Build proper CoverageAnalysisRequest format
    const sourceFilesForCoverage = files.slice(0, 3).map(f => {
      const content = fs.readFileSync(f, 'utf-8');
      return {
        path: f,
        content: content,
        language: 'typescript',
        functions: [{ name: 'main', startLine: 1, endLine: content.split('\n').length, complexity: 5 }]
      };
    });

    // Create coverage points (one per file line for simulation)
    const coveragePoints = [];
    let pointId = 0;
    for (const file of sourceFilesForCoverage) {
      const lineCount = Math.min(file.content.split('\n').length, 50); // Limit for performance
      for (let line = 1; line <= lineCount; line++) {
        coveragePoints.push({
          id: `cp-${pointId++}`,
          file: file.path,
          line: line,
          type: line % 10 === 0 ? 'function' : line % 3 === 0 ? 'branch' : 'statement'
        });
      }
    }

    // Create test suite with required metadata
    const testSuite = {
      id: 'test-suite-1',
      name: 'Coverage Analysis Test Suite',
      tests: [
        { id: 'test-1', name: 'basic-test', type: 'unit', estimatedDuration: 100 },
        { id: 'test-2', name: 'integration-test', type: 'integration', estimatedDuration: 200 },
        { id: 'test-3', name: 'edge-case-test', type: 'unit', estimatedDuration: 150 }
      ],
      metadata: {
        framework: 'jest',
        language: 'typescript',
        generatedAt: new Date()
      }
    };

    // CoverageAnalyzerAgent.executeTask expects TaskSpec directly, not wrapped in assignment
    const taskSpec = {
      id: 'task-' + Date.now(),
      type: 'analyze-coverage',
      payload: {
        testSuite: testSuite,
        codeBase: {
          files: sourceFilesForCoverage,
          coveragePoints: coveragePoints
        },
        targetCoverage: 80,
        optimizationGoals: {
          minimizeTestCount: true,
          maximizeCoverage: true,
          balanceEfficiency: true
        }
      },
      priority: 5,
      status: 'pending'
    };

    const result = await agent.executeTask(taskSpec);
    results.push({ task: 'coverage', success: result.success });
    console.log('  ✓ Coverage analysis complete\n');
  } catch (e) {
    console.log('  ✗ Coverage analysis failed:', e.message, '\n');
  }

  // Flush experiences
  console.log('Flushing experience buffer...');
  await experienceCapture.flush();

  // Get final stats
  const finalStats = await experienceCapture.getStats();
  const newExperiences = finalStats.totalCaptured - initialStats.totalCaptured;

  console.log('\n============================================================');
  console.log('EXECUTION SUMMARY');
  console.log('============================================================');
  console.log('Tasks executed:', results.length);
  console.log('Successful:', results.filter(r => r.success).length);
  console.log('');
  console.log('Experiences before:', initialStats.totalCaptured);
  console.log('Experiences after:', finalStats.totalCaptured);
  console.log('NEW experiences:', newExperiences);
  console.log('============================================================');

  await memoryManager.close();
  process.exit(0);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
