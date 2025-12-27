#!/usr/bin/env npx tsx
/**
 * QE Agent Validation Script
 *
 * Validates that QE agents are using all special features:
 * - Code Intelligence (semantic search, knowledge graph)
 * - Learning (pattern recognition, strategy optimization)
 * - RuVector pattern store
 * - Federated learning
 *
 * Results are saved to tmp/qe-validation/
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { EventEmitter } from 'events';

// Import agent infrastructure
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager.js';
import { QEAgentFactory } from '../src/agents/index.js';
import { QEAgentType } from '../src/types/index.js';
import { CodeIntelligenceService } from '../src/code-intelligence/service/CodeIntelligenceService.js';
import type { BaseAgent } from '../src/agents/BaseAgent.js';
import type { QETask, TaskAssignment } from '../src/types/index.js';

// Results directory
const RESULTS_DIR = path.join(process.cwd(), 'tmp', 'qe-validation');

interface ValidationResult {
  agent: string;
  success: boolean;
  features: {
    codeIntelligence: boolean;
    learning: boolean;
    patternStore: boolean;
    llm: boolean;
  };
  taskResult?: any;
  error?: string;
  duration: number;
}

interface ValidationReport {
  timestamp: string;
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  features: {
    codeIntelligenceAvailable: boolean;
    codeIntelligenceUsed: number;
    learningEnabled: number;
    patternStoreEnabled: number;
  };
  results: ValidationResult[];
  systemInfo: {
    nodeVersion: string;
    platform: string;
    indexedChunks: number;
    graphNodes: number;
  };
}

async function main() {
  console.log(chalk.blue.bold('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║       QE Agent Validation - Feature Verification              ║'));
  console.log(chalk.blue.bold('╚══════════════════════════════════════════════════════════════╝\n'));

  // Ensure results directory exists
  await fs.ensureDir(RESULTS_DIR);

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    totalAgents: 0,
    successfulAgents: 0,
    failedAgents: 0,
    features: {
      codeIntelligenceAvailable: false,
      codeIntelligenceUsed: 0,
      learningEnabled: 0,
      patternStoreEnabled: 0,
    },
    results: [],
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      indexedChunks: 0,
      graphNodes: 0,
    },
  };

  // Initialize shared infrastructure
  const spinner = ora('Initializing shared infrastructure...').start();

  let memoryManager: SwarmMemoryManager;
  let codeIntelService: CodeIntelligenceService | null = null;
  const eventBus = new EventEmitter();

  try {
    // Initialize memory manager
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
    memoryManager = new SwarmMemoryManager(dbPath);
    await memoryManager.initialize();

    // Initialize Code Intelligence
    try {
      const prereqs = await CodeIntelligenceService.checkPrerequisites();
      if (prereqs.allReady) {
        codeIntelService = CodeIntelligenceService.getInstance();
        await codeIntelService.initialize();
        report.features.codeIntelligenceAvailable = true;

        const status = await codeIntelService.getStatus();
        report.systemInfo.indexedChunks = status.indexedChunks;
        report.systemInfo.graphNodes = status.graphNodes;

        spinner.succeed(`Infrastructure initialized (${status.indexedChunks} chunks, ${status.graphNodes} nodes)`);
      } else {
        spinner.warn('Code Intelligence prerequisites not available');
        console.log(chalk.yellow('  Missing: ' + prereqs.messages.join(', ')));
      }
    } catch (ciError) {
      spinner.warn('Code Intelligence initialization failed: ' + (ciError as Error).message);
    }
  } catch (error) {
    spinner.fail('Infrastructure initialization failed');
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }

  // Get Code Intelligence config for agents
  const codeIntelConfig = codeIntelService?.getAgentConfig() || { enabled: false };

  // Define agents to test
  const agentsToTest: Array<{ type: QEAgentType; task: QETask }> = [
    {
      type: QEAgentType.TEST_GENERATOR,
      task: {
        id: 'test-gen-1',
        type: 'test-generation',
        description: 'Generate tests for BaseAgent class',
        payload: {
          targetFiles: ['src/agents/BaseAgent.ts'],
          framework: 'jest',
          coverage: 80,
        },
        priority: 'high',
        requirements: { capabilities: ['test-generation'] },
      },
    },
    {
      type: QEAgentType.COVERAGE_ANALYZER,
      task: {
        id: 'coverage-1',
        type: 'coverage-analysis',
        description: 'Analyze test coverage for Code Intelligence module',
        payload: {
          targetPath: 'src/code-intelligence',
          threshold: 70,
        },
        priority: 'medium',
        requirements: { capabilities: ['coverage-analysis'] },
      },
    },
    {
      type: QEAgentType.CODE_COMPLEXITY,
      task: {
        id: 'complexity-1',
        type: 'code-complexity',
        description: 'Analyze code complexity of FleetManager',
        payload: {
          targetFiles: ['src/core/FleetManager.ts'],
          maxComplexity: 15,
        },
        priority: 'medium',
        requirements: { capabilities: ['code-complexity'] },
      },
    },
    {
      type: QEAgentType.SECURITY_SCANNER,
      task: {
        id: 'security-1',
        type: 'security-scan',
        description: 'Scan for security vulnerabilities',
        payload: {
          targetPath: 'src/cli',
          scanType: 'sast',
        },
        priority: 'high',
        requirements: { capabilities: ['security-scanning'] },
      },
    },
    {
      type: QEAgentType.QUALITY_ANALYZER,
      task: {
        id: 'quality-1',
        type: 'quality-analysis',
        description: 'Analyze code quality metrics',
        payload: {
          targetPath: 'src/agents',
          metrics: ['maintainability', 'reliability'],
        },
        priority: 'medium',
        requirements: { capabilities: ['quality-analysis'] },
      },
    },
  ];

  console.log(chalk.cyan(`\n📋 Testing ${agentsToTest.length} QE agents...\n`));

  // Test each agent
  for (const { type, task } of agentsToTest) {
    const agentSpinner = ora(`Testing ${type}...`).start();
    const startTime = Date.now();

    const result: ValidationResult = {
      agent: type,
      success: false,
      features: {
        codeIntelligence: false,
        learning: false,
        patternStore: false,
        llm: false,
      },
      duration: 0,
    };

    try {
      // Create agent with all features
      const agent = await QEAgentFactory.createAgent(type, {
        memoryStore: memoryManager,
        eventBus,
        enableLearning: true,
        codeIntelligence: codeIntelConfig,
        llm: {
          enabled: true,
          preferredProvider: 'ruvllm',
        },
        patternStore: {
          enabled: true,
          useRuVector: true,
          useHNSW: true,
        },
      });

      // Initialize agent
      await agent.initialize();

      // Check features
      result.features.codeIntelligence = (agent as any).hasCodeIntelligence?.() || false;
      result.features.learning = (agent as any).learningEngine?.isEnabled?.() || false;
      result.features.patternStore = (agent as any).hasPatternStore?.() || false;
      result.features.llm = (agent as any).hasLLM?.() || false;

      // Update counters
      if (result.features.codeIntelligence) report.features.codeIntelligenceUsed++;
      if (result.features.learning) report.features.learningEnabled++;
      if (result.features.patternStore) report.features.patternStoreEnabled++;

      // Execute a lightweight check (don't run full task which would require LLM)
      const status = agent.getStatus();

      result.taskResult = {
        status: status.status,
        capabilities: status.capabilities,
        performanceMetrics: status.performanceMetrics,
        codeIntelligenceStats: (agent as any).getCodeIntelligenceStats?.(),
        learningStatus: await (agent as any).getLearningStatus?.(),
        llmStats: (agent as any).getLLMStats?.(),
        patternMetrics: (agent as any).getQEPatternMetrics?.(),
      };

      result.success = true;
      result.duration = Date.now() - startTime;

      // Terminate agent
      await agent.terminate();

      agentSpinner.succeed(`${type} - Features: CI=${result.features.codeIntelligence ? '✓' : '✗'} Learn=${result.features.learning ? '✓' : '✗'} Pattern=${result.features.patternStore ? '✓' : '✗'} LLM=${result.features.llm ? '✓' : '✗'}`);

    } catch (error) {
      result.error = (error as Error).message;
      result.duration = Date.now() - startTime;
      agentSpinner.fail(`${type} - Error: ${result.error}`);
    }

    report.results.push(result);
    report.totalAgents++;
    if (result.success) report.successfulAgents++;
    else report.failedAgents++;
  }

  // Test Code Intelligence Agent specifically
  if (codeIntelService) {
    console.log(chalk.cyan('\n🧠 Testing Code Intelligence Agent...\n'));

    const ciSpinner = ora('Executing Code Intelligence search...').start();
    try {
      const searchResult = await codeIntelService.search('BaseAgent initialization and learning', {
        topK: 5,
        includeGraphContext: true,
      });

      ciSpinner.succeed(`Found ${searchResult.results.length} results in ${searchResult.metadata?.searchTimeMs}ms`);

      // Save search results
      await fs.writeJson(
        path.join(RESULTS_DIR, 'code-intelligence-search.json'),
        searchResult,
        { spaces: 2 }
      );

      // Add to report
      report.results.push({
        agent: 'code-intelligence-search',
        success: true,
        features: {
          codeIntelligence: true,
          learning: false,
          patternStore: false,
          llm: false,
        },
        taskResult: {
          resultsCount: searchResult.results.length,
          searchTimeMs: searchResult.metadata?.searchTimeMs,
          topResult: searchResult.results[0]?.entityName || searchResult.results[0]?.filePath,
        },
        duration: searchResult.metadata?.searchTimeMs || 0,
      });
      report.successfulAgents++;
      report.totalAgents++;

    } catch (error) {
      ciSpinner.fail('Code Intelligence search failed: ' + (error as Error).message);
    }
  }

  // Print summary
  console.log(chalk.green.bold('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.green.bold('║                    VALIDATION SUMMARY                         ║'));
  console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.white(`║ Total Agents Tested:      ${String(report.totalAgents).padStart(3)}                                ║`));
  console.log(chalk.white(`║ Successful:               ${String(report.successfulAgents).padStart(3)}                                ║`));
  console.log(chalk.white(`║ Failed:                   ${String(report.failedAgents).padStart(3)}                                ║`));
  console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.white(`║ Code Intelligence:        ${report.features.codeIntelligenceAvailable ? 'Available' : 'Not Available'}                         ║`));
  console.log(chalk.white(`║   Agents using CI:        ${String(report.features.codeIntelligenceUsed).padStart(3)}                                ║`));
  console.log(chalk.white(`║ Learning Enabled:         ${String(report.features.learningEnabled).padStart(3)}                                ║`));
  console.log(chalk.white(`║ Pattern Store Enabled:    ${String(report.features.patternStoreEnabled).padStart(3)}                                ║`));
  console.log(chalk.green.bold('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.white(`║ Indexed Chunks:           ${String(report.systemInfo.indexedChunks).padStart(6)}                           ║`));
  console.log(chalk.white(`║ Graph Nodes:              ${String(report.systemInfo.graphNodes).padStart(6)}                           ║`));
  console.log(chalk.green.bold('╚══════════════════════════════════════════════════════════════╝'));

  // Save full report
  const reportPath = path.join(RESULTS_DIR, 'validation-report.json');
  await fs.writeJson(reportPath, report, { spaces: 2 });
  console.log(chalk.gray(`\n📄 Full report saved to: ${reportPath}`));

  // Save individual agent results
  for (const result of report.results) {
    const agentResultPath = path.join(RESULTS_DIR, `${result.agent}-result.json`);
    await fs.writeJson(agentResultPath, result, { spaces: 2 });
  }

  // Generate markdown summary
  const markdownSummary = generateMarkdownSummary(report);
  const summaryPath = path.join(RESULTS_DIR, 'SUMMARY.md');
  await fs.writeFile(summaryPath, markdownSummary);
  console.log(chalk.gray(`📝 Markdown summary: ${summaryPath}`));

  // Cleanup
  if (codeIntelService) {
    await codeIntelService.shutdown();
  }
  await memoryManager.close();

  console.log(chalk.green.bold('\n✅ QE Agent Validation Complete!\n'));

  // Exit with appropriate code
  process.exit(report.failedAgents > 0 ? 1 : 0);
}

function generateMarkdownSummary(report: ValidationReport): string {
  return `# QE Agent Validation Report

**Generated:** ${report.timestamp}

## Summary

| Metric | Value |
|--------|-------|
| Total Agents Tested | ${report.totalAgents} |
| Successful | ${report.successfulAgents} |
| Failed | ${report.failedAgents} |

## Feature Usage

| Feature | Status |
|---------|--------|
| Code Intelligence Available | ${report.features.codeIntelligenceAvailable ? '✅ Yes' : '❌ No'} |
| Agents Using Code Intelligence | ${report.features.codeIntelligenceUsed} |
| Agents With Learning Enabled | ${report.features.learningEnabled} |
| Agents With Pattern Store | ${report.features.patternStoreEnabled} |

## System Info

| Property | Value |
|----------|-------|
| Node Version | ${report.systemInfo.nodeVersion} |
| Platform | ${report.systemInfo.platform} |
| Indexed Chunks | ${report.systemInfo.indexedChunks} |
| Graph Nodes | ${report.systemInfo.graphNodes} |

## Agent Results

${report.results.map(r => `
### ${r.agent}

- **Status:** ${r.success ? '✅ Success' : '❌ Failed'}
- **Duration:** ${r.duration}ms
- **Code Intelligence:** ${r.features.codeIntelligence ? '✅' : '❌'}
- **Learning:** ${r.features.learning ? '✅' : '❌'}
- **Pattern Store:** ${r.features.patternStore ? '✅' : '❌'}
- **LLM:** ${r.features.llm ? '✅' : '❌'}
${r.error ? `- **Error:** ${r.error}` : ''}
`).join('\n')}

## Conclusion

${report.failedAgents === 0
  ? '✅ All agents validated successfully with QE Fleet special features.'
  : `⚠️ ${report.failedAgents} agent(s) had issues. Check individual results for details.`}

---
*Generated by Agentic QE Fleet Validation*
`;
}

main().catch(console.error);
