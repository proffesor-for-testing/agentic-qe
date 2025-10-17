#!/usr/bin/env ts-node
/**
 * Final Validation Orchestrator - Continuous Monitoring System
 *
 * This script continuously monitors all agents and tracks progress toward GO criteria.
 * Integrates with SwarmMemoryManager for persistent state tracking.
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/EventBus';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ValidationCheckpoint {
  timestamp: number;
  agent: string;
  passRate: number;
  coverage: number;
  status: 'in-progress' | 'GO' | 'NO-GO';
  testsFixed: number;
  testsAdded: number;
  testsPassing: number;
  testsFailing: number;
  totalTests: number;
}

interface AgentStatus {
  agentName: string;
  status: string;
  progress: number;
  lastUpdate: number;
}

interface GOCriteria {
  optionA: {
    passRate: number;
    coverage: number;
    met: boolean;
    target: { passRate: 70; coverage: 15 };
  };
  optionB: {
    passRate: number;
    coverage: number;
    integrationPassing: boolean;
    met: boolean;
    target: { passRate: 70; coverage: 20 };
  };
}

class FinalValidationOrchestrator {
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;
  private checkpointCounter: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private validationInterval: NodeJS.Timeout | null = null;

  constructor() {
    const dbPath = path.join(process.cwd(), '.swarm/memory.db');
    this.memoryStore = new SwarmMemoryManager(dbPath);
    this.eventBus = EventBus.getInstance();
  }

  async initialize(): Promise<void> {
    await this.memoryStore.initialize();
    console.log('✅ Final Validation Orchestrator initialized');

    // Store initialization event
    await this.memoryStore.store('aqe/validation/orchestrator-initialized', {
      timestamp: Date.now(),
      agent: 'final-validation-orchestrator',
      status: 'active',
      monitoring: true
    }, { partition: 'coordination', ttl: 86400 });
  }

  async monitorAllAgents(): Promise<AgentStatus[]> {
    const agents = [
      'tasks/QUICK-FIXES-SUMMARY/status',
      'tasks/BATCH-002/status',
      'tasks/BATCH-003/status',
      'tasks/BATCH-004/status',
      'aqe/coverage/phase-2-complete',
      'aqe/coverage/phase-3-complete',
      'aqe/coverage/phase-4-complete',
      'tasks/INTEGRATION-SUITE-001/status',
      'tasks/INTEGRATION-SUITE-002/status'
    ];

    const statuses: AgentStatus[] = [];

    for (const agentKey of agents) {
      try {
        const status = await this.memoryStore.retrieve(agentKey, {
          partition: 'coordination'
        });

        if (status) {
          statuses.push({
            agentName: agentKey,
            status: status.status || 'unknown',
            progress: status.progress || 0,
            lastUpdate: status.timestamp || 0
          });
        }
      } catch (error) {
        console.log(`⚠️  Agent ${agentKey} not found in memory`);
      }
    }

    return statuses;
  }

  async runValidation(): Promise<ValidationCheckpoint> {
    this.checkpointCounter++;
    console.log(`\n🔍 Running Validation Checkpoint ${this.checkpointCounter}...`);

    try {
      // Run tests
      const { stdout: testOutput } = await execAsync('npm test 2>&1', {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024
      });

      // Parse test results
      const testResults = this.parseTestResults(testOutput);

      // Run coverage
      const { stdout: coverageOutput } = await execAsync(
        'npm test -- --coverage --coverageReporters=json-summary 2>&1',
        {
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024
        }
      );

      // Parse coverage
      const coverage = await this.parseCoverage();

      const checkpoint: ValidationCheckpoint = {
        timestamp: Date.now(),
        agent: 'final-validation-orchestrator',
        passRate: testResults.passRate,
        coverage: coverage,
        status: this.determineStatus(testResults.passRate, coverage),
        testsFixed: await this.getTestsFixed(),
        testsAdded: await this.getTestsAdded(),
        testsPassing: testResults.passing,
        testsFailing: testResults.failing,
        totalTests: testResults.total
      };

      // Store checkpoint
      await this.memoryStore.store(
        `aqe/validation/checkpoint-${this.checkpointCounter}`,
        checkpoint,
        { partition: 'coordination', ttl: 86400 }
      );

      // Store as metric (using standard store with metrics partition)
      await this.memoryStore.store(`metrics/validation_checkpoint_${this.checkpointCounter}`, {
        metric: 'validation_checkpoint',
        value: checkpoint.passRate,
        unit: 'percentage',
        timestamp: Date.now(),
        metadata: {
          checkpoint: this.checkpointCounter,
          coverage: checkpoint.coverage,
          status: checkpoint.status
        }
      }, { partition: 'metrics', ttl: 604800 });

      console.log(`✅ Checkpoint ${this.checkpointCounter}: Pass Rate=${checkpoint.passRate.toFixed(1)}%, Coverage=${checkpoint.coverage.toFixed(1)}%`);

      return checkpoint;
    } catch (error) {
      console.error('❌ Validation failed:', error);
      throw error;
    }
  }

  private parseTestResults(output: string): { passRate: number; passing: number; failing: number; total: number } {
    // Parse Jest output for test results
    const passedMatch = output.match(/Tests:\s+(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const totalMatch = output.match(/(\d+) total/);

    const passing = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failing = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    const total = totalMatch ? parseInt(totalMatch[1], 10) : passing + failing;

    const passRate = total > 0 ? (passing / total) * 100 : 0;

    return { passRate, passing, failing, total };
  }

  private async parseCoverage(): Promise<number> {
    const coveragePath = path.join(process.cwd(), 'coverage/coverage-summary.json');

    try {
      if (fs.existsSync(coveragePath)) {
        const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        const totalCoverage = coverageData.total;

        // Calculate average coverage across all metrics
        const avgCoverage = (
          totalCoverage.lines.pct +
          totalCoverage.statements.pct +
          totalCoverage.functions.pct +
          totalCoverage.branches.pct
        ) / 4;

        return avgCoverage;
      }
    } catch (error) {
      console.warn('⚠️  Could not parse coverage data');
    }

    return 0;
  }

  private determineStatus(passRate: number, coverage: number): 'in-progress' | 'GO' | 'NO-GO' {
    // Option A: Pass rate ≥ 70% AND coverage ≥ 15%
    const optionA = passRate >= 70 && coverage >= 15;

    // Option B: Pass rate ≥ 70% AND coverage ≥ 20%
    const optionB = passRate >= 70 && coverage >= 20;

    if (optionB) return 'GO';
    if (optionA) return 'in-progress';
    return 'NO-GO';
  }

  private async getTestsFixed(): Promise<number> {
    // Query memory for tests fixed count
    const quickFixes = await this.memoryStore.retrieve('tasks/QUICK-FIXES-SUMMARY/status', {
      partition: 'coordination'
    });

    return quickFixes?.testsFixed || 0;
  }

  private async getTestsAdded(): Promise<number> {
    // Query memory for tests added count
    const batches = ['BATCH-002', 'BATCH-003', 'BATCH-004'];
    let totalAdded = 0;

    for (const batch of batches) {
      const status = await this.memoryStore.retrieve(`tasks/${batch}/status`, {
        partition: 'coordination'
      });
      totalAdded += status?.testsAdded || 0;
    }

    return totalAdded;
  }

  async trackGOCriteria(): Promise<GOCriteria> {
    const checkpoint = await this.memoryStore.retrieve(
      `aqe/validation/checkpoint-${this.checkpointCounter}`,
      { partition: 'coordination' }
    );

    if (!checkpoint) {
      throw new Error('No checkpoint data available');
    }

    const goCriteria: GOCriteria = {
      optionA: {
        passRate: checkpoint.passRate,
        coverage: checkpoint.coverage,
        met: checkpoint.passRate >= 70 && checkpoint.coverage >= 15,
        target: { passRate: 70, coverage: 15 }
      },
      optionB: {
        passRate: checkpoint.passRate,
        coverage: checkpoint.coverage,
        integrationPassing: await this.checkIntegrationTests(),
        met: checkpoint.passRate >= 70 && checkpoint.coverage >= 20,
        target: { passRate: 70, coverage: 20 }
      }
    };

    // Store GO criteria tracking
    await this.memoryStore.store('aqe/validation/go-criteria', goCriteria, {
      partition: 'coordination',
      ttl: 86400
    });

    return goCriteria;
  }

  private async checkIntegrationTests(): Promise<boolean> {
    const suite1 = await this.memoryStore.retrieve('tasks/INTEGRATION-SUITE-001/status', {
      partition: 'coordination'
    });
    const suite2 = await this.memoryStore.retrieve('tasks/INTEGRATION-SUITE-002/status', {
      partition: 'coordination'
    });

    return (suite1?.status === 'complete' || false) && (suite2?.status === 'complete' || false);
  }

  async generateDashboard(): Promise<void> {
    const checkpoint = await this.memoryStore.retrieve(
      `aqe/validation/checkpoint-${this.checkpointCounter}`,
      { partition: 'coordination' }
    );

    const goCriteria = await this.memoryStore.retrieve('aqe/validation/go-criteria', {
      partition: 'coordination'
    });

    const agentStatuses = await this.monitorAllAgents();

    const dashboard = `# Comprehensive Stability Dashboard

**Last Updated:** ${new Date().toISOString()}

## Overall Progress: ${this.calculateOverallProgress(checkpoint, goCriteria)}% Complete

| Workstream | Status | Progress |
|-----------|--------|----------|
${this.generateWorkstreamTable(agentStatuses)}

## Current Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Pass Rate | ${checkpoint?.passRate?.toFixed(1) || 0}% | 70% | ${this.getStatusEmoji(checkpoint?.passRate, 70)} |
| Coverage | ${checkpoint?.coverage?.toFixed(1) || 0}% | 20% | ${this.getStatusEmoji(checkpoint?.coverage, 20)} |
| Tests Fixed | ${checkpoint?.testsFixed || 0} | - | ✅ |
| Tests Added | ${checkpoint?.testsAdded || 0} | - | ✅ |

## GO Criteria Progress

### Option A (Intermediate) ${goCriteria?.optionA?.met ? '✅' : '🟡'}
- Pass rate ≥ 70%: ${goCriteria?.optionA?.passRate?.toFixed(1) || 0}% ${goCriteria?.optionA?.passRate >= 70 ? '✅' : '🟡'}
- Coverage ≥ 15%: ${goCriteria?.optionA?.coverage?.toFixed(1) || 0}% ${goCriteria?.optionA?.coverage >= 15 ? '✅' : '🟡'}

### Option B (Final) ${goCriteria?.optionB?.met ? '✅' : '🟡'}
- Pass rate ≥ 70%: ${goCriteria?.optionB?.passRate?.toFixed(1) || 0}% ${goCriteria?.optionB?.passRate >= 70 ? '✅' : '🟡'}
- Coverage ≥ 20%: ${goCriteria?.optionB?.coverage?.toFixed(1) || 0}% ${goCriteria?.optionB?.coverage >= 20 ? '✅' : '🟡'}
- Integration tests passing: ${goCriteria?.optionB?.integrationPassing ? '✅' : '🟡'}

## Checkpoint History

${await this.generateCheckpointHistory()}

---

*Monitoring System: Active | Next Validation: 15 minutes*
`;

    const dashboardPath = path.join(process.cwd(), 'docs/reports/COMPREHENSIVE-STABILITY-DASHBOARD.md');
    fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
    fs.writeFileSync(dashboardPath, dashboard);

    console.log(`📊 Dashboard updated: ${dashboardPath}`);
  }

  private calculateOverallProgress(checkpoint: any, goCriteria: any): number {
    if (!checkpoint || !goCriteria) return 0;

    const passRateProgress = Math.min(checkpoint.passRate / 70, 1) * 40;
    const coverageProgress = Math.min(checkpoint.coverage / 20, 1) * 40;
    const integrationProgress = goCriteria.optionB?.integrationPassing ? 20 : 0;

    return Math.round(passRateProgress + coverageProgress + integrationProgress);
  }

  private generateWorkstreamTable(statuses: AgentStatus[]): string {
    const workstreams = [
      { name: 'Quick Fixes', key: 'QUICK-FIXES' },
      { name: 'Test Suite Completion', key: 'BATCH' },
      { name: 'Coverage Expansion', key: 'coverage/phase' },
      { name: 'Integration Tests', key: 'INTEGRATION-SUITE' }
    ];

    return workstreams.map(ws => {
      const relevant = statuses.filter(s => s.agentName.includes(ws.key));
      const avgProgress = relevant.length > 0
        ? relevant.reduce((sum, s) => sum + s.progress, 0) / relevant.length
        : 0;
      const status = avgProgress === 100 ? '✅ Complete' : '🟡 In Progress';

      return `| ${ws.name} | ${status} | ${avgProgress.toFixed(0)}% |`;
    }).join('\n');
  }

  private getStatusEmoji(current: number | undefined, target: number): string {
    if (!current) return '❌';
    if (current >= target) return '✅';
    if (current >= target * 0.9) return '🟡';
    return '❌';
  }

  private async generateCheckpointHistory(): Promise<string> {
    const history: string[] = [];

    for (let i = 1; i <= this.checkpointCounter; i++) {
      const checkpoint = await this.memoryStore.retrieve(`aqe/validation/checkpoint-${i}`, {
        partition: 'coordination'
      });

      if (checkpoint) {
        history.push(
          `**Checkpoint ${i}** (${new Date(checkpoint.timestamp).toLocaleString()}): ` +
          `Pass=${checkpoint.passRate.toFixed(1)}%, Cov=${checkpoint.coverage.toFixed(1)}%, ` +
          `Status=${checkpoint.status}`
        );
      }
    }

    return history.join('\n');
  }

  async makeFinalDecision(): Promise<void> {
    const checkpoint = await this.memoryStore.retrieve(
      `aqe/validation/checkpoint-${this.checkpointCounter}`,
      { partition: 'coordination' }
    );

    const goCriteria = await this.memoryStore.retrieve('aqe/validation/go-criteria', {
      partition: 'coordination'
    });

    const decision = {
      timestamp: Date.now(),
      decision: goCriteria?.optionB?.met ? 'GO' : 'IN-PROGRESS',
      passRate: checkpoint?.passRate || 0,
      coverage: checkpoint?.coverage || 0,
      integrationTestsPassing: goCriteria?.optionB?.integrationPassing || false,
      safetyNetScore: this.calculateSafetyScore(checkpoint?.passRate || 0, checkpoint?.coverage || 0),
      readyForSprint3: goCriteria?.optionB?.met || false,
      metricsComparison: {
        before: { passRate: 6.82, coverage: 1.30 },
        after: { passRate: checkpoint?.passRate || 0, coverage: checkpoint?.coverage || 0 }
      }
    };

    await this.memoryStore.store('aqe/validation/final-decision', decision, {
      partition: 'coordination',
      ttl: 86400
    });

    await this.memoryStore.store('metrics/comprehensive_stability_score', {
      metric: 'comprehensive_stability_score',
      value: decision.safetyNetScore,
      unit: 'score',
      timestamp: Date.now(),
      metadata: { sprint: 'comprehensive-stability' }
    }, { partition: 'metrics', ttl: 604800 });

    console.log(`\n🎯 Final Decision: ${decision.decision}`);
    console.log(`   Safety Net Score: ${decision.safetyNetScore.toFixed(2)}`);
    console.log(`   Ready for Sprint 3: ${decision.readyForSprint3 ? 'YES' : 'NOT YET'}`);
  }

  private calculateSafetyScore(passRate: number, coverage: number): number {
    // Weighted score: 60% pass rate, 40% coverage
    return (passRate * 0.6) + (coverage * 0.4);
  }

  async startMonitoring(): Promise<void> {
    console.log('🚀 Starting continuous monitoring...');

    // Agent monitoring every 3 minutes
    this.monitoringInterval = setInterval(async () => {
      console.log('\n👀 Monitoring all agents...');
      const statuses = await this.monitorAllAgents();
      console.log(`   Found ${statuses.length} active agents`);
    }, 3 * 60 * 1000);

    // Validation every 15 minutes
    this.validationInterval = setInterval(async () => {
      await this.runValidation();
      await this.trackGOCriteria();
      await this.generateDashboard();
      await this.makeFinalDecision();
    }, 15 * 60 * 1000);

    // Run initial validation immediately
    await this.runValidation();
    await this.trackGOCriteria();
    await this.generateDashboard();
    await this.makeFinalDecision();
  }

  async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.validationInterval) clearInterval(this.validationInterval);
    console.log('🛑 Monitoring stopped');
  }
}

// Main execution
async function main() {
  const orchestrator = new FinalValidationOrchestrator();
  await orchestrator.initialize();
  await orchestrator.startMonitoring();

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n⚠️  Shutting down...');
    await orchestrator.stopMonitoring();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

export { FinalValidationOrchestrator };
