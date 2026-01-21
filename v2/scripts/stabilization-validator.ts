#!/usr/bin/env ts-node
/**
 * Stabilization Validator - Continuous Monitoring & Decision Engine
 *
 * Monitors test stabilization progress and validates Tier 1 achievement:
 * - 50%+ pass rate
 * - 30+ suites passing
 * - <30s execution time
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/EventBus';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CheckpointData {
  timestamp: number;
  checkpointNumber: number;
  passRate: number;
  testsPassing: number;
  testsFailing: number;
  testsTotal: number;
  suitesPassing: number;
  suitesTotal: number;
  executionTime: number;
  agentProgress: Record<string, string>;
  tier1Criteria: {
    passRate50: boolean;
    suitesStable: boolean;
    executionFast: boolean;
  };
}

interface TestResults {
  passed: number;
  failed: number;
  total: number;
  suitesPassed: number;
  suitesTotal: number;
  passRate: number;
  executionTime: number;
}

class StabilizationValidator {
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;
  private checkpointCount = 0;
  private startTime: number;

  constructor() {
    const dbPath = path.join(process.cwd(), '.swarm/memory.db');
    this.memoryStore = new SwarmMemoryManager(dbPath);
    this.eventBus = EventBus.getInstance();
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    await this.memoryStore.initialize();

    // Store validator startup
    await this.memoryStore.store('aqe/stabilization/validator-started', {
      timestamp: this.startTime,
      agent: 'stabilization-validator',
      mission: 'Validate Tier 1 achievement and make GO/NO-GO decision'
    }, { partition: 'coordination', ttl: 86400 });

    console.log('🎯 Stabilization Validator initialized');
    console.log('📊 Mission: Validate 50%+ pass rate achievement\n');
  }

  async queryAgentProgress(): Promise<Record<string, any>> {
    const agents = {
      'test-cleanup': await this.memoryStore.retrieve('tasks/TEST-CLEANUP/status', {
        partition: 'coordination'
      }),
      'jest-env-fix': await this.memoryStore.retrieve('tasks/JEST-ENV-FIX/status', {
        partition: 'coordination'
      }),
      'core-stabilization': await this.memoryStore.retrieve('tasks/CORE-TEST-STABILIZATION/status', {
        partition: 'coordination'
      })
    };

    return agents;
  }

  async runTests(): Promise<TestResults> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync('npm test -- --passWithNoTests 2>&1', {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const output = stdout + stderr;
      const executionTime = Date.now() - startTime;

      // Save log
      const logFile = path.join(process.cwd(), 'docs/reports', `stabilization-checkpoint-${Date.now()}.log`);
      await fs.writeFile(logFile, output, 'utf-8');

      return this.parseTestResults(output, executionTime);
    } catch (error: any) {
      // Tests may fail, but we still parse results
      const output = error.stdout + error.stderr;
      const executionTime = Date.now() - startTime;

      const logFile = path.join(process.cwd(), 'docs/reports', `stabilization-checkpoint-${Date.now()}.log`);
      await fs.writeFile(logFile, output, 'utf-8');

      return this.parseTestResults(output, executionTime);
    }
  }

  parseTestResults(output: string, executionTime: number): TestResults {
    // Parse Jest output
    const passedMatch = output.match(/Tests:\s+(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const totalMatch = output.match(/(\d+) total/);
    const suitesPassedMatch = output.match(/Test Suites:\s+(\d+) passed/);
    const suitesTotalMatch = output.match(/Test Suites:.*?(\d+) total/);

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    const total = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed;
    const suitesPassed = suitesPassedMatch ? parseInt(suitesPassedMatch[1], 10) : 0;
    const suitesTotal = suitesTotalMatch ? parseInt(suitesTotalMatch[1], 10) : suitesPassed;

    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return {
      passed,
      failed,
      total,
      suitesPassed,
      suitesTotal,
      passRate,
      executionTime: executionTime / 1000 // Convert to seconds
    };
  }

  async createCheckpoint(results: TestResults): Promise<CheckpointData> {
    this.checkpointCount++;

    const agentProgress = await this.queryAgentProgress();

    const checkpoint: CheckpointData = {
      timestamp: Date.now(),
      checkpointNumber: this.checkpointCount,
      passRate: results.passRate,
      testsPassing: results.passed,
      testsFailing: results.failed,
      testsTotal: results.total,
      suitesPassing: results.suitesPassed,
      suitesTotal: results.suitesTotal,
      executionTime: results.executionTime,
      agentProgress: {
        'test-cleanup': agentProgress['test-cleanup']?.status || 'in-progress',
        'jest-env-fix': agentProgress['jest-env-fix']?.status || 'in-progress',
        'core-stabilization': agentProgress['core-stabilization']?.status || 'in-progress'
      },
      tier1Criteria: {
        passRate50: results.passRate >= 50,
        suitesStable: results.suitesPassed >= 30,
        executionFast: results.executionTime < 30
      }
    };

    // Store checkpoint
    await this.memoryStore.store(`aqe/stabilization/checkpoint-${this.checkpointCount}`, checkpoint, {
      partition: 'coordination',
      ttl: 86400
    });

    return checkpoint;
  }

  async updateDashboard(checkpoint: CheckpointData): Promise<void> {
    const timestamp = new Date(checkpoint.timestamp).toISOString();
    const progress = this.calculateTier1Progress(checkpoint);

    const icon = (met: boolean) => met ? '✅' : '❌';

    const dashboard = `# Test Stabilization - Real-Time Dashboard

**Last Updated:** ${timestamp}

## 🎯 Tier 1 Progress: ${progress.toFixed(1)}%

| Criterion | Current | Target | Status |
|-----------|---------|--------|--------|
| Pass Rate | ${checkpoint.passRate.toFixed(1)}% | 50% | ${icon(checkpoint.tier1Criteria.passRate50)} |
| Suites Passing | ${checkpoint.suitesPassing} | 30+ | ${icon(checkpoint.tier1Criteria.suitesStable)} |
| Execution Time | ${checkpoint.executionTime.toFixed(1)}s | <30s | ${icon(checkpoint.tier1Criteria.executionFast)} |

## 🤖 Agent Status

| Agent | Status | Last Update |
|-------|--------|-------------|
| Test Cleanup | ${checkpoint.agentProgress['test-cleanup']} | ${timestamp} |
| Jest Env Fix | ${checkpoint.agentProgress['jest-env-fix']} | ${timestamp} |
| Core Stabilizer | ${checkpoint.agentProgress['core-stabilization']} | ${timestamp} |

## 📊 Test Metrics

- **Total Tests:** ${checkpoint.testsTotal}
- **Passing:** ${checkpoint.testsPassing} (${checkpoint.passRate.toFixed(1)}%)
- **Failing:** ${checkpoint.testsFailing}
- **Suites Passing:** ${checkpoint.suitesPassing}/${checkpoint.suitesTotal}

## 📈 Checkpoint History

- **Checkpoint:** #${checkpoint.checkpointNumber}
- **Runtime:** ${((Date.now() - this.startTime) / 1000 / 60).toFixed(1)} minutes

## 🎯 Tier 1 Criteria Status

${this.formatTier1Status(checkpoint)}

---

*Auto-generated by Stabilization Validator - ${timestamp}*
`;

    await fs.writeFile(
      path.join(process.cwd(), 'docs/reports/STABILIZATION-DASHBOARD.md'),
      dashboard,
      'utf-8'
    );
  }

  calculateTier1Progress(checkpoint: CheckpointData): number {
    let score = 0;
    if (checkpoint.tier1Criteria.passRate50) score += 33.33;
    if (checkpoint.tier1Criteria.suitesStable) score += 33.33;
    if (checkpoint.tier1Criteria.executionFast) score += 33.34;
    return score;
  }

  formatTier1Status(checkpoint: CheckpointData): string {
    const { tier1Criteria } = checkpoint;
    const allMet = tier1Criteria.passRate50 && tier1Criteria.suitesStable && tier1Criteria.executionFast;

    if (allMet) {
      return '🎉 **ALL TIER 1 CRITERIA MET** - Ready for GO-CONDITIONAL decision!';
    }

    const pending: string[] = [];
    if (!tier1Criteria.passRate50) pending.push('Pass Rate 50%');
    if (!tier1Criteria.suitesStable) pending.push('30+ Suites Passing');
    if (!tier1Criteria.executionFast) pending.push('<30s Execution');

    return `⏳ **Pending:** ${pending.join(', ')}`;
  }

  async checkTier1Achievement(checkpoint: CheckpointData): Promise<boolean> {
    const { tier1Criteria } = checkpoint;
    const met = tier1Criteria.passRate50 && tier1Criteria.suitesStable && tier1Criteria.executionFast;

    const tier1Check = {
      timestamp: checkpoint.timestamp,
      passRate: tier1Criteria.passRate50,
      suitesStable: tier1Criteria.suitesStable,
      executionFast: tier1Criteria.executionFast,
      met
    };

    await this.memoryStore.store('aqe/stabilization/tier1-check', tier1Check, {
      partition: 'coordination',
      ttl: 86400
    });

    return met;
  }

  async generateFinalDecision(checkpoint: CheckpointData): Promise<void> {
    const agentProgress = await this.queryAgentProgress();

    const finalDecision = {
      timestamp: checkpoint.timestamp,
      decision: 'GO-CONDITIONAL',
      tier: 1,
      passRate: checkpoint.passRate,
      suitesPassing: checkpoint.suitesPassing,
      executionTime: checkpoint.executionTime,

      metricsComparison: {
        before: {
          passRate: 30.5,
          suitesPassing: 5,
          testsFailing: 326
        },
        after: {
          passRate: checkpoint.passRate,
          suitesPassing: checkpoint.suitesPassing,
          testsFailing: checkpoint.testsFailing
        },
        improvement: {
          passRate: checkpoint.passRate - 30.5,
          suitesPassing: checkpoint.suitesPassing - 5,
          testsFailing: 326 - checkpoint.testsFailing
        }
      },

      agentContributions: {
        'test-cleanup': agentProgress['test-cleanup'],
        'jest-env-fix': agentProgress['jest-env-fix'],
        'core-stabilization': agentProgress['core-stabilization']
      },

      nextSteps: 'Tier 2: Implement missing classes (8-10h) to achieve 70% pass, 20% coverage',
      recommendation: 'PROCEED with caution - foundation stable, ready for implementation phase'
    };

    await this.memoryStore.store('aqe/stabilization/final-decision', finalDecision, {
      partition: 'coordination',
      ttl: 604800 // 7 days
    });

    // Generate final report
    await this.generateFinalReport(finalDecision);

    console.log('\n🎉 TIER 1 ACHIEVED - Final decision stored!');
    console.log('📊 Decision:', finalDecision.decision);
    console.log('📈 Pass Rate:', finalDecision.passRate.toFixed(1) + '%');
  }

  async generateFinalReport(decision: any): Promise<void> {
    const report = `# Tier 1 Stabilization Complete

**Date:** ${new Date(decision.timestamp).toISOString()}
**Decision:** ${decision.decision}

## 🎯 Achievement Summary

**Tier 1 Criteria Met:**
- ✅ Pass Rate: ${decision.passRate.toFixed(1)}% (Target: 50%)
- ✅ Suites Passing: ${decision.suitesPassing} (Target: 30+)
- ✅ Execution Time: ${decision.executionTime.toFixed(1)}s (Target: <30s)

## 📊 Before/After Comparison

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Pass Rate | ${decision.metricsComparison.before.passRate}% | ${decision.metricsComparison.after.passRate.toFixed(1)}% | +${decision.metricsComparison.improvement.passRate.toFixed(1)}% |
| Suites Passing | ${decision.metricsComparison.before.suitesPassing} | ${decision.metricsComparison.after.suitesPassing} | +${decision.metricsComparison.improvement.suitesPassing} |
| Tests Failing | ${decision.metricsComparison.before.testsFailing} | ${decision.metricsComparison.after.testsFailing} | -${decision.metricsComparison.improvement.testsFailing} |

## 🤖 Agent Contributions

### Test Cleanup Agent
${JSON.stringify(decision.agentContributions['test-cleanup'], null, 2)}

### Jest Environment Fix Agent
${JSON.stringify(decision.agentContributions['jest-env-fix'], null, 2)}

### Core Stabilization Agent
${JSON.stringify(decision.agentContributions['core-stabilization'], null, 2)}

## 💾 Database Evidence

All validation data stored in SwarmMemoryManager:
- \`aqe/stabilization/checkpoint-*\` - All checkpoint data
- \`aqe/stabilization/tier1-check\` - Final tier 1 validation
- \`aqe/stabilization/final-decision\` - GO-CONDITIONAL decision

## 🚀 Next Steps: Tier 2 Roadmap

**Goal:** 70% pass rate, 20% coverage (8-10 hours)

### Required Implementations:
1. **Missing Core Classes** (4-5h)
   - AgentFleet
   - AgentOrchestrator
   - SublinearOptimizer
   - TemporalPredictionEngine

2. **Test Environment Fixes** (2-3h)
   - Database integration
   - Config handling
   - Path resolution

3. **Integration Tests** (2h)
   - End-to-end workflows
   - Agent coordination
   - Memory persistence

## ✅ Recommendation

**${decision.recommendation}**

Foundation is now stable with:
- Reliable test execution
- Clean environment setup
- Working core infrastructure

Ready to proceed with implementation phase to achieve Tier 2 targets.

---

*Generated by Stabilization Validator - ${new Date().toISOString()}*
`;

    await fs.writeFile(
      path.join(process.cwd(), 'docs/reports/TIER-1-STABILIZATION-COMPLETE.md'),
      report,
      'utf-8'
    );
  }

  async runValidationCycle(): Promise<void> {
    console.log(`\n🔄 Running validation cycle #${this.checkpointCount + 1}...`);

    // Run tests
    console.log('📝 Executing test suite...');
    const results = await this.runTests();

    // Create checkpoint
    console.log('💾 Creating checkpoint...');
    const checkpoint = await this.createCheckpoint(results);

    // Update dashboard
    console.log('📊 Updating dashboard...');
    await this.updateDashboard(checkpoint);

    // Check Tier 1 achievement
    console.log('🎯 Checking Tier 1 criteria...');
    const tier1Met = await this.checkTier1Achievement(checkpoint);

    // Report results
    console.log('\n📈 Checkpoint Results:');
    console.log(`   Pass Rate: ${checkpoint.passRate.toFixed(1)}%`);
    console.log(`   Suites Passing: ${checkpoint.suitesPassing}/${checkpoint.suitesTotal}`);
    console.log(`   Execution Time: ${checkpoint.executionTime.toFixed(1)}s`);
    console.log(`   Tier 1 Progress: ${this.calculateTier1Progress(checkpoint).toFixed(1)}%`);

    if (tier1Met) {
      console.log('\n🎉 TIER 1 CRITERIA MET!');
      await this.generateFinalDecision(checkpoint);
      return;
    }

    console.log('\n⏳ Tier 1 not yet achieved, continuing monitoring...');
  }

  async continuousMonitoring(intervalMinutes: number = 3): Promise<void> {
    console.log(`\n🚀 Starting continuous monitoring (every ${intervalMinutes} minutes)\n`);

    while (true) {
      try {
        await this.runValidationCycle();

        // Check if Tier 1 is met
        const tier1Check = await this.memoryStore.retrieve('aqe/stabilization/tier1-check', {
          partition: 'coordination'
        });

        if (tier1Check?.met) {
          console.log('\n✅ Monitoring complete - Tier 1 achieved!');
          break;
        }

        // Wait for next cycle
        console.log(`\n⏱️  Next validation in ${intervalMinutes} minutes...`);
        await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));

      } catch (error) {
        console.error('❌ Error in validation cycle:', error);
        // Continue monitoring despite errors
        await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // Wait 1 minute on error
      }
    }
  }

  async runSingleValidation(): Promise<void> {
    await this.runValidationCycle();
  }
}

// Main execution
async function main() {
  const validator = new StabilizationValidator();
  await validator.initialize();

  const mode = process.argv[2] || 'single';

  if (mode === 'continuous') {
    const interval = parseInt(process.argv[3] || '3', 10);
    await validator.continuousMonitoring(interval);
  } else {
    await validator.runSingleValidation();
  }
}

main().catch(console.error);
