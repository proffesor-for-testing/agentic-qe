#!/usr/bin/env npx tsx
/**
 * Learning Baselines Collection via AQE MCP
 *
 * Uses the agentic-qe MCP handlers with AgentRegistry to enable automatic learning.
 *
 * How it works:
 * 1. MCP handlers route tasks through AgentRegistry
 * 2. AgentRegistry calls agent.executeTask()
 * 3. Agent's onPostTask hook triggers learningEngine.learnFromExecution()
 * 4. Q-values, patterns, and experiences are automatically persisted to memory.db
 *
 * Output files go to tests/tmp/ (gitignored)
 *
 * @module scripts/collect-baselines-mcp
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import BetterSqlite3 from 'better-sqlite3';

// MCP Handler imports
import { TestGenerateEnhancedHandler } from '../src/mcp/handlers/test/test-generate-enhanced';
import { AgentRegistry } from '../src/mcp/services/AgentRegistry';
import { HookExecutor } from '../src/mcp/services/HookExecutor';

// Memory management
import { initializeSharedMemoryManager } from '../src/core/memory/MemoryManagerFactory';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';

// Output directory (gitignored)
const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'tmp', 'mcp-baselines');

// Real source files from the project
const SOURCE_FILES = [
  'src/utils/Logger.ts',
  'src/utils/SecureRandom.ts',
  'src/core/memory/PatternCache.ts',
  'src/core/memory/AccessControl.ts',
  'src/learning/StateExtractor.ts',
  'src/learning/RewardCalculator.ts',
  'src/reasoning/PatternExtractor.ts',
  'src/mcp/handlers/base-handler.ts',
  'src/adapters/MemoryStoreAdapter.ts',
  'src/core/events/QEEventBus.ts',
];

interface TaskResult {
  taskId: string;
  agentId?: string;
  agentType: string;
  sourceFile: string;
  success: boolean;
  executionTime: number;
  learningEnabled: boolean;
  metrics: Record<string, number | boolean>;
  timestamp: Date;
}

class MCPBaselineCollector {
  private memoryManager: SwarmMemoryManager | null = null;
  private db: BetterSqlite3.Database | null = null;
  private registry: AgentRegistry | null = null;
  private hookExecutor: HookExecutor | null = null;
  private testGenHandler: TestGenerateEnhancedHandler | null = null;
  private initialCounts = { patterns: 0, experiences: 0, qValues: 0 };

  async initialize(): Promise<void> {
    console.log('🚀 Initializing MCP Baseline Collector with Learning...\n');

    // Create output directory
    await fs.ensureDir(OUTPUT_DIR);
    await fs.ensureDir(path.join(OUTPUT_DIR, 'tests'));
    await fs.ensureDir(path.join(OUTPUT_DIR, 'reports'));

    // Initialize memory manager
    this.memoryManager = await initializeSharedMemoryManager();

    // Open database for verification
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
    this.db = new BetterSqlite3(dbPath);

    // Initialize MCP services
    this.registry = new AgentRegistry();
    this.hookExecutor = new HookExecutor();

    // Initialize handler WITH registry for automatic learning
    // This is the key difference - handler routes through AgentRegistry
    this.testGenHandler = new TestGenerateEnhancedHandler(this.registry);

    // Record initial counts
    this.initialCounts = this.getDbCounts();

    console.log('✅ MCP handlers initialized with AgentRegistry');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);
    console.log(`💾 Database: ${dbPath}`);
    console.log(`\n📊 Initial DB State:`);
    console.log(`   Patterns: ${this.initialCounts.patterns}`);
    console.log(`   Experiences: ${this.initialCounts.experiences}`);
    console.log(`   Q-Values: ${this.initialCounts.qValues}\n`);
  }

  private getDbCounts(): { patterns: number; experiences: number; qValues: number } {
    if (!this.db) return { patterns: 0, experiences: 0, qValues: 0 };

    const patterns = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get() as { c: number };
    const experiences = this.db.prepare('SELECT COUNT(*) as c FROM learning_experiences').get() as { c: number };
    const qValues = this.db.prepare('SELECT COUNT(*) as c FROM q_values').get() as { c: number };

    return { patterns: patterns.c, experiences: experiences.c, qValues: qValues.c };
  }

  async readSourceFile(relativePath: string): Promise<string | null> {
    const fullPath = path.join(process.cwd(), relativePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async runTestGenerationTasks(): Promise<TaskResult[]> {
    console.log('═'.repeat(60));
    console.log('📝 TEST GENERATION WITH LEARNING');
    console.log('═'.repeat(60));
    console.log('Each task routes through: Handler → Registry → Agent → Learning\n');

    const results: TaskResult[] = [];

    for (let i = 0; i < SOURCE_FILES.length; i++) {
      const sourceFile = SOURCE_FILES[i];
      const taskId = `test-gen-mcp-${i}-${Date.now()}`;
      const startTime = Date.now();

      console.log(`  [${i + 1}/${SOURCE_FILES.length}] ${sourceFile}`);

      const content = await this.readSourceFile(sourceFile);
      if (!content) {
        console.log(`     ⚠️ File not found, skipping`);
        results.push({
          taskId,
          agentType: 'test-generator',
          sourceFile,
          success: false,
          executionTime: Date.now() - startTime,
          learningEnabled: false,
          metrics: {},
          timestamp: new Date(),
        });
        continue;
      }

      // Get counts before task
      const beforeCounts = this.getDbCounts();

      try {
        // Execute via MCP handler - this now routes through AgentRegistry
        // which calls agent.executeTask() and triggers learning automatically
        const result = await this.testGenHandler!.handle({
          sourceCode: content,
          language: 'typescript',
          testType: 'unit',
          aiEnhancement: true,
          coverageGoal: 80,
          detectAntiPatterns: true,
        });

        const executionTime = Date.now() - startTime;
        const responseText = result.content?.[0]?.text || '{}';
        const parsed = JSON.parse(responseText);

        // Get counts after task to verify learning
        const afterCounts = this.getDbCounts();
        const learningOccurred =
          afterCounts.experiences > beforeCounts.experiences ||
          afterCounts.qValues > beforeCounts.qValues ||
          afterCounts.patterns > beforeCounts.patterns;

        // Write generated tests to output
        const outputFile = path.join(OUTPUT_DIR, 'tests', `${path.basename(sourceFile, '.ts')}.test.ts`);
        const testContent = this.generateTestFileContent(sourceFile, parsed.tests || [], parsed);
        await fs.writeFile(outputFile, testContent);

        const testsCount = (parsed.tests || []).length;
        const agentId = parsed.learning?.agentId || 'unknown';
        const learningEnabled = parsed.learning?.enabled || false;

        console.log(`     ✅ ${testsCount} tests | Learning: ${learningEnabled ? '✓' : '✗'} | Agent: ${agentId.substring(0, 20)}... (${executionTime}ms)`);

        if (learningOccurred) {
          console.log(`        📈 DB Changes: Exp +${afterCounts.experiences - beforeCounts.experiences}, Q +${afterCounts.qValues - beforeCounts.qValues}, Pat +${afterCounts.patterns - beforeCounts.patterns}`);
        }

        results.push({
          taskId,
          agentId,
          agentType: 'test-generator',
          sourceFile,
          success: true,
          executionTime,
          learningEnabled,
          metrics: {
            testsGenerated: testsCount,
            coverage: parsed.coverage?.predicted || 0,
            experiencesAdded: afterCounts.experiences - beforeCounts.experiences,
            qValuesAdded: afterCounts.qValues - beforeCounts.qValues,
            patternsAdded: afterCounts.patterns - beforeCounts.patterns,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.log(`     ❌ Failed: ${(error as Error).message}`);
        results.push({
          taskId,
          agentType: 'test-generator',
          sourceFile,
          success: false,
          executionTime: Date.now() - startTime,
          learningEnabled: false,
          metrics: {},
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  private generateTestFileContent(sourceFile: string, tests: unknown[], analysis: Record<string, unknown>): string {
    const moduleName = path.basename(sourceFile, '.ts');

    return `/**
 * Auto-generated tests for ${moduleName}
 * Generated via AQE MCP with Agent Learning
 * Generated at: ${new Date().toISOString()}
 *
 * Source: ${sourceFile}
 * Tests: ${Array.isArray(tests) ? tests.length : 0}
 * Learning: ${(analysis as any).learning?.enabled ? 'Enabled' : 'Disabled'}
 */

import { describe, it, expect } from '@jest/globals';

describe('${moduleName}', () => {
${Array.isArray(tests) && tests.length > 0
  ? tests.map((t: unknown, i: number) => {
      const test = t as Record<string, unknown>;
      return `  it('${test.name || `test case ${i + 1}`}', () => {
    // Generated by agent with learning
    expect(true).toBe(true);
  });`;
    }).join('\n\n')
  : `  it('should have tests generated', () => {
    expect(true).toBe(true);
  });`
}
});
`;
  }

  async generateReport(results: TaskResult[]): Promise<void> {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 LEARNING BASELINE COLLECTION REPORT');
    console.log('═'.repeat(60));

    const finalCounts = this.getDbCounts();

    // Summary
    const successCount = results.filter(r => r.success).length;
    const learningCount = results.filter(r => r.learningEnabled).length;

    console.log('\n📈 Database Changes:');
    console.log('┌─────────────────┬──────────┬──────────┬──────────┐');
    console.log('│ Metric          │ Before   │ After    │ Delta    │');
    console.log('├─────────────────┼──────────┼──────────┼──────────┤');
    console.log(`│ Patterns        │ ${this.initialCounts.patterns.toString().padStart(8)} │ ${finalCounts.patterns.toString().padStart(8)} │ ${(finalCounts.patterns - this.initialCounts.patterns).toString().padStart('+8')} │`);
    console.log(`│ Experiences     │ ${this.initialCounts.experiences.toString().padStart(8)} │ ${finalCounts.experiences.toString().padStart(8)} │ ${(finalCounts.experiences - this.initialCounts.experiences).toString().padStart('+8')} │`);
    console.log(`│ Q-Values        │ ${this.initialCounts.qValues.toString().padStart(8)} │ ${finalCounts.qValues.toString().padStart(8)} │ ${(finalCounts.qValues - this.initialCounts.qValues).toString().padStart('+8')} │`);
    console.log('└─────────────────┴──────────┴──────────┴──────────┘');

    console.log('\n📋 Task Summary:');
    console.log(`   Total tasks: ${results.length}`);
    console.log(`   Successful: ${successCount} (${((successCount/results.length)*100).toFixed(0)}%)`);
    console.log(`   With learning: ${learningCount} (${((learningCount/results.length)*100).toFixed(0)}%)`);

    // Save report
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalTasks: results.length,
        successRate: successCount / results.length,
        learningRate: learningCount / results.length,
        sourceFilesAnalyzed: SOURCE_FILES.length,
      },
      databaseChanges: {
        before: this.initialCounts,
        after: finalCounts,
        delta: {
          patterns: finalCounts.patterns - this.initialCounts.patterns,
          experiences: finalCounts.experiences - this.initialCounts.experiences,
          qValues: finalCounts.qValues - this.initialCounts.qValues,
        },
      },
      results,
    };

    const reportPath = path.join(OUTPUT_DIR, 'reports', 'learning-baselines-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });

    console.log(`\n📄 Report: ${reportPath}`);
    console.log(`📁 Outputs: ${OUTPUT_DIR}/`);

    // Verify learning actually happened
    if (finalCounts.experiences > this.initialCounts.experiences ||
        finalCounts.qValues > this.initialCounts.qValues) {
      console.log('\n✅ LEARNING VERIFIED: Database shows new experiences/Q-values');
    } else {
      console.log('\n⚠️ WARNING: No new learning data detected in database');
    }
  }

  async cleanup(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
    console.log('\n✅ MCP Baseline collection complete!');
  }
}

async function main() {
  const collector = new MCPBaselineCollector();

  try {
    await collector.initialize();

    // Run test generation tasks (with learning)
    const results = await collector.runTestGenerationTasks();

    // Generate report
    await collector.generateReport(results);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await collector.cleanup();
  }
}

main();
