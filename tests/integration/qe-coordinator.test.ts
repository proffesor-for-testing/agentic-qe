/**
 * QE Coordinator Integration Tests
 * Tests phase transitions, quality gates, agent assignment,
 * lifecycle management, metrics collection, and swarm coordination
 */

import { QEMemory } from '../../src/memory/QEMemory';
import { TaskExecutor, TaskDefinition } from '../../src/advanced/task-executor';
import { Logger } from '../../src/utils/Logger';
import { QEMemoryEntry, MemoryType, TestCase, TestSuite, AgentType } from '../../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// QE Coordinator implementation for testing
class QECoordinator extends EventEmitter {
  private memory: QEMemory;
  private taskExecutor: TaskExecutor;
  private logger: Logger;
  private activeAgents = new Map<string, AgentInfo>();
  private activePhases = new Map<string, PhaseInfo>();
  private qualityGates = new Map<string, QualityGate>();
  private metrics = {
    phasesCompleted: 0,
    agentsSpawned: 0,
    qualityGatesPassed: 0,
    qualityGatesFailed: 0,
    totalExecutionTime: 0,
    averagePhaseTime: 0
  };

  constructor(memory: QEMemory, taskExecutor: TaskExecutor, logger: Logger) {
    super();
    this.memory = memory;
    this.taskExecutor = taskExecutor;
    this.logger = logger;
    this.setupDefaultQualityGates();
  }

  async startWorkflow(workflowId: string, phases: PhaseDefinition[]): Promise<WorkflowResult> {
    const startTime = Date.now();
    
    await this.memory.store({
      key: `${workflowId}-workflow`,
      value: {
        id: workflowId,
        phases: phases.map(p => p.name),
        status: 'started',
        startTime: new Date()
      },
      type: 'session',
      sessionId: workflowId,
      timestamp: new Date(),
      tags: ['workflow', 'started']
    });

    this.emit('workflow-started', { workflowId, phases });
    
    try {
      let currentPhaseIndex = 0;
      const results: PhaseResult[] = [];
      
      for (const phase of phases) {
        const phaseResult = await this.executePhase(workflowId, phase, currentPhaseIndex);
        results.push(phaseResult);
        
        if (!phaseResult.success) {
          throw new Error(`Phase ${phase.name} failed: ${phaseResult.error}`);
        }
        
        currentPhaseIndex++;
      }
      
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, results.length);
      
      const result: WorkflowResult = {
        success: true,
        duration,
        phases: results,
        metrics: { ...this.metrics }
      };
      
      await this.memory.store({
        key: `${workflowId}-result`,
        value: result,
        type: 'session',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['workflow', 'completed']
      });
      
      this.emit('workflow-completed', { workflowId, result });
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const result: WorkflowResult = {
        success: false,
        duration,
        error: error.message,
        phases: [],
        metrics: { ...this.metrics }
      };
      
      await this.memory.store({
        key: `${workflowId}-result`,
        value: result,
        type: 'session',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['workflow', 'failed']
      });
      
      this.emit('workflow-failed', { workflowId, error: error.message });
      return result;
    }
  }

  private async executePhase(workflowId: string, phase: PhaseDefinition, index: number): Promise<PhaseResult> {
    const phaseId = `${workflowId}-phase-${index}`;
    const startTime = Date.now();
    
    this.activePhases.set(phaseId, {
      id: phaseId,
      name: phase.name,
      status: 'running',
      startTime: new Date(),
      agents: []
    });
    
    this.emit('phase-started', { workflowId, phaseId, phase });
    
    try {
      // Check quality gate before phase
      if (phase.qualityGate) {
        const gateResult = await this.evaluateQualityGate(workflowId, phase.qualityGate);
        if (!gateResult.passed) {
          throw new Error(`Quality gate failed: ${gateResult.reason}`);
        }
      }
      
      // Assign and execute agents
      const agentResults = [];
      for (const agentSpec of phase.agents) {
        const agent = await this.assignAgent(workflowId, phaseId, agentSpec);
        const result = await this.executeAgentTasks(agent, agentSpec.tasks);
        agentResults.push(result);
      }
      
      const duration = Date.now() - startTime;
      const phaseInfo = this.activePhases.get(phaseId)!;
      phaseInfo.status = 'completed';
      phaseInfo.endTime = new Date();
      
      const result: PhaseResult = {
        phaseId,
        name: phase.name,
        success: true,
        duration,
        agents: agentResults,
        qualityGateResult: phase.qualityGate ? { passed: true, metrics: {} } : undefined
      };
      
      await this.memory.store({
        key: `${phaseId}-result`,
        value: result,
        type: 'session',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['phase', 'completed', phase.name]
      });
      
      this.emit('phase-completed', { workflowId, phaseId, result });
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const phaseInfo = this.activePhases.get(phaseId)!;
      phaseInfo.status = 'failed';
      phaseInfo.endTime = new Date();
      
      const result: PhaseResult = {
        phaseId,
        name: phase.name,
        success: false,
        duration,
        error: error.message,
        agents: [],
        qualityGateResult: phase.qualityGate ? { passed: false, reason: error.message } : undefined
      };
      
      this.emit('phase-failed', { workflowId, phaseId, error: error.message });
      return result;
    }
  }

  private async assignAgent(workflowId: string, phaseId: string, agentSpec: AgentSpecification): Promise<AgentInfo> {
    const agentId = `${phaseId}-${agentSpec.type}-${Date.now()}`;
    
    const agent: AgentInfo = {
      id: agentId,
      type: agentSpec.type,
      capabilities: agentSpec.capabilities || [],
      status: 'assigned',
      assignedTime: new Date(),
      phaseId,
      workflowId
    };
    
    this.activeAgents.set(agentId, agent);
    this.metrics.agentsSpawned++;
    
    await this.memory.store({
      key: `${agentId}-info`,
      value: agent,
      type: 'agent-state',
      sessionId: workflowId,
      agentId,
      timestamp: new Date(),
      tags: ['agent', 'assigned', agentSpec.type]
    });
    
    this.emit('agent-assigned', { workflowId, phaseId, agent });
    return agent;
  }

  private async executeAgentTasks(agent: AgentInfo, tasks: TaskDefinition[]): Promise<AgentResult> {
    const startTime = Date.now();
    agent.status = 'executing';
    
    try {
      const taskResults = [];
      for (const task of tasks) {
        const result = await this.taskExecutor.executeTask(task, agent.id);
        taskResults.push(result);
      }
      
      const duration = Date.now() - startTime;
      agent.status = 'completed';
      agent.completedTime = new Date();
      
      return {
        agentId: agent.id,
        success: true,
        duration,
        tasks: taskResults
      };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      agent.status = 'failed';
      agent.completedTime = new Date();
      
      return {
        agentId: agent.id,
        success: false,
        duration,
        error: error.message,
        tasks: []
      };
    }
  }

  private async evaluateQualityGate(workflowId: string, gateName: string): Promise<QualityGateResult> {
    const gate = this.qualityGates.get(gateName);
    if (!gate) {
      return { passed: false, reason: `Quality gate '${gateName}' not found` };
    }
    
    try {
      const metrics = await this.collectQualityMetrics(workflowId);
      const result = await gate.evaluator(metrics);
      
      if (result.passed) {
        this.metrics.qualityGatesPassed++;
      } else {
        this.metrics.qualityGatesFailed++;
      }
      
      await this.memory.store({
        key: `${workflowId}-gate-${gateName}`,
        value: result,
        type: 'metric',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['quality-gate', gateName, result.passed ? 'passed' : 'failed']
      });
      
      return result;
      
    } catch (error: any) {
      this.metrics.qualityGatesFailed++;
      return { passed: false, reason: `Quality gate evaluation failed: ${error.message}` };
    }
  }

  private async collectQualityMetrics(workflowId: string): Promise<QualityMetrics> {
    const metrics = await this.memory.query({
      sessionId: workflowId,
      type: 'metric',
      tags: ['quality']
    });
    
    return {
      testCoverage: this.calculateTestCoverage(metrics),
      codeQuality: this.calculateCodeQuality(metrics),
      performance: this.calculatePerformanceScore(metrics),
      security: this.calculateSecurityScore(metrics)
    };
  }

  private calculateTestCoverage(metrics: QEMemoryEntry[]): number {
    const coverageMetrics = metrics.filter(m => (m.value as any).metric === 'test_coverage');
    if (coverageMetrics.length === 0) return 0;
    
    const latestCoverage = coverageMetrics
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    return (latestCoverage.value as any).value || 0;
  }

  private calculateCodeQuality(metrics: QEMemoryEntry[]): number {
    const qualityMetrics = metrics.filter(m => (m.value as any).metric === 'code_quality');
    if (qualityMetrics.length === 0) return 100; // Default to good quality
    
    const scores = qualityMetrics.map(m => (m.value as any).value);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculatePerformanceScore(metrics: QEMemoryEntry[]): number {
    const perfMetrics = metrics.filter(m => (m.value as any).metric === 'performance_score');
    if (perfMetrics.length === 0) return 100; // Default to good performance
    
    const scores = perfMetrics.map(m => (m.value as any).value);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculateSecurityScore(metrics: QEMemoryEntry[]): number {
    const securityMetrics = metrics.filter(m => (m.value as any).metric === 'security_score');
    if (securityMetrics.length === 0) return 100; // Default to secure
    
    const scores = securityMetrics.map(m => (m.value as any).value);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private setupDefaultQualityGates(): void {
    this.qualityGates.set('test_coverage', {
      name: 'test_coverage',
      evaluator: async (metrics: QualityMetrics) => {
        const threshold = 80;
        return {
          passed: metrics.testCoverage >= threshold,
          reason: metrics.testCoverage < threshold ? 
            `Test coverage ${metrics.testCoverage}% below threshold ${threshold}%` : undefined,
          metrics: { testCoverage: metrics.testCoverage, threshold }
        };
      }
    });
    
    this.qualityGates.set('code_quality', {
      name: 'code_quality',
      evaluator: async (metrics: QualityMetrics) => {
        const threshold = 85;
        return {
          passed: metrics.codeQuality >= threshold,
          reason: metrics.codeQuality < threshold ? 
            `Code quality ${metrics.codeQuality} below threshold ${threshold}` : undefined,
          metrics: { codeQuality: metrics.codeQuality, threshold }
        };
      }
    });
    
    this.qualityGates.set('performance', {
      name: 'performance',
      evaluator: async (metrics: QualityMetrics) => {
        const threshold = 90;
        return {
          passed: metrics.performance >= threshold,
          reason: metrics.performance < threshold ? 
            `Performance score ${metrics.performance} below threshold ${threshold}` : undefined,
          metrics: { performance: metrics.performance, threshold }
        };
      }
    });
  }

  private updateMetrics(duration: number, phaseCount: number): void {
    this.metrics.phasesCompleted += phaseCount;
    this.metrics.totalExecutionTime += duration;
    this.metrics.averagePhaseTime = this.metrics.totalExecutionTime / this.metrics.phasesCompleted;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getActiveAgents(): AgentInfo[] {
    return Array.from(this.activeAgents.values());
  }

  getActivePhases(): PhaseInfo[] {
    return Array.from(this.activePhases.values());
  }

  async shutdown(): Promise<void> {
    // Clean up active agents and phases
    this.activeAgents.clear();
    this.activePhases.clear();
    this.removeAllListeners();
  }
}

// Type definitions
interface PhaseDefinition {
  name: string;
  agents: AgentSpecification[];
  qualityGate?: string;
  dependencies?: string[];
}

interface AgentSpecification {
  type: AgentType;
  capabilities?: string[];
  tasks: TaskDefinition[];
}

interface AgentInfo {
  id: string;
  type: AgentType;
  capabilities: string[];
  status: 'assigned' | 'executing' | 'completed' | 'failed';
  assignedTime: Date;
  completedTime?: Date;
  phaseId: string;
  workflowId: string;
}

interface PhaseInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  agents: string[];
}

interface QualityGate {
  name: string;
  evaluator: (metrics: QualityMetrics) => Promise<QualityGateResult>;
}

interface QualityGateResult {
  passed: boolean;
  reason?: string;
  metrics?: Record<string, any>;
}

interface QualityMetrics {
  testCoverage: number;
  codeQuality: number;
  performance: number;
  security: number;
}

interface WorkflowResult {
  success: boolean;
  duration: number;
  error?: string;
  phases: PhaseResult[];
  metrics: any;
}

interface PhaseResult {
  phaseId: string;
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  agents: AgentResult[];
  qualityGateResult?: QualityGateResult;
}

interface AgentResult {
  agentId: string;
  success: boolean;
  duration: number;
  error?: string;
  tasks: any[];
}

describe('QE Coordinator Integration', () => {
  let coordinator: QECoordinator;
  let memory: QEMemory;
  let taskExecutor: TaskExecutor;
  let testDir: string;
  let logger: Logger;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'qe-coordinator-test', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('CoordinatorTest', { level: 'debug' });
  });

  afterAll(async () => {
    if (coordinator) {
      await coordinator.shutdown();
    }
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
    if (memory) {
      await memory.destroy();
    }
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    memory = new QEMemory({
      persistPath: path.join(testDir, `memory-${Date.now()}.json`),
      maxEntries: 1000,
      defaultTTL: 60000
    }, logger);
    
    taskExecutor = new TaskExecutor({ maxConcurrent: 5 });
    coordinator = new QECoordinator(memory, taskExecutor, logger);
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown();
    }
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
    if (memory) {
      await memory.destroy();
    }
  });

  describe('Phase Transitions and Quality Gates', () => {
    it('should execute phases in sequence with quality gate validation', async () => {
      const workflowId = 'sequential-workflow';
      
      // Setup quality metrics for gates
      await memory.store({
        key: 'test-coverage-metric',
        value: { metric: 'test_coverage', value: 85 },
        type: 'metric',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['quality', 'coverage']
      });
      
      await memory.store({
        key: 'code-quality-metric',
        value: { metric: 'code_quality', value: 90 },
        type: 'metric',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['quality', 'code']
      });
      
      const phases: PhaseDefinition[] = [
        {
          name: 'requirements',
          agents: [{
            type: 'requirements-explorer',
            tasks: [{
              id: 'req-analysis',
              name: 'Requirements Analysis',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 5000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'planning',
          qualityGate: 'test_coverage',
          agents: [{
            type: 'test-planner',
            tasks: [{
              id: 'test-planning',
              name: 'Test Strategy Planning',
              type: 'analysis',
              priority: 7,
              dependencies: [],
              timeout: 5000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'execution',
          qualityGate: 'code_quality',
          agents: [{
            type: 'test-executor',
            tasks: [{
              id: 'test-execution',
              name: 'Test Execution',
              type: 'testing',
              priority: 9,
              dependencies: [],
              timeout: 10000,
              retryCount: 2,
              resources: {
                maxMemory: 200 * 1024 * 1024,
                maxCpuPercent: 70,
                maxDiskSpace: 20 * 1024 * 1024,
                maxNetworkBandwidth: 2 * 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(3);
      expect(result.duration).toBeGreaterThan(0);
      
      // Verify phase sequence
      expect(result.phases[0].name).toBe('requirements');
      expect(result.phases[1].name).toBe('planning');
      expect(result.phases[2].name).toBe('execution');
      
      // Verify quality gates passed
      expect(result.phases[1].qualityGateResult?.passed).toBe(true);
      expect(result.phases[2].qualityGateResult?.passed).toBe(true);
      
      // Verify workflow persisted
      const workflowResult = await memory.get(`${workflowId}-result`);
      expect(workflowResult).toBeTruthy();
      expect((workflowResult!.value as any).success).toBe(true);
    });

    it('should fail workflow when quality gate fails', async () => {
      const workflowId = 'failing-quality-gate';
      
      // Setup failing quality metrics
      await memory.store({
        key: 'low-coverage-metric',
        value: { metric: 'test_coverage', value: 60 }, // Below 80% threshold
        type: 'metric',
        sessionId: workflowId,
        timestamp: new Date(),
        tags: ['quality', 'coverage']
      });
      
      const phases: PhaseDefinition[] = [
        {
          name: 'requirements',
          agents: [{
            type: 'requirements-explorer',
            tasks: [{
              id: 'req-analysis',
              name: 'Requirements Analysis',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 5000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'testing-with-gate',
          qualityGate: 'test_coverage',
          agents: [{
            type: 'test-executor',
            tasks: [{
              id: 'test-with-gate',
              name: 'Test With Quality Gate',
              type: 'testing',
              priority: 7,
              dependencies: [],
              timeout: 5000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Quality gate failed');
      expect(result.phases).toHaveLength(1); // Only first phase should complete
      
      const metrics = coordinator.getMetrics();
      expect(metrics.qualityGatesFailed).toBeGreaterThan(0);
    });

    it('should handle complex phase dependencies', async () => {
      const workflowId = 'dependency-workflow';
      const phaseEvents: string[] = [];
      
      coordinator.on('phase-started', (event) => {
        phaseEvents.push(`started-${event.phase.name}`);
      });
      
      coordinator.on('phase-completed', (event) => {
        phaseEvents.push(`completed-${event.result.name}`);
      });
      
      const phases: PhaseDefinition[] = [
        {
          name: 'foundation',
          agents: [{
            type: 'requirements-explorer',
            tasks: [{
              id: 'foundation-task',
              name: 'Foundation Analysis',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 50 * 1024 * 1024,
                maxCpuPercent: 30,
                maxDiskSpace: 5 * 1024 * 1024,
                maxNetworkBandwidth: 512 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'parallel-branch-1',
          dependencies: ['foundation'],
          agents: [{
            type: 'test-planner',
            tasks: [{
              id: 'branch1-task',
              name: 'Branch 1 Task',
              type: 'analysis',
              priority: 7,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 50 * 1024 * 1024,
                maxCpuPercent: 30,
                maxDiskSpace: 5 * 1024 * 1024,
                maxNetworkBandwidth: 512 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'parallel-branch-2',
          dependencies: ['foundation'],
          agents: [{
            type: 'test-analyzer',
            tasks: [{
              id: 'branch2-task',
              name: 'Branch 2 Task',
              type: 'analysis',
              priority: 7,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 50 * 1024 * 1024,
                maxCpuPercent: 30,
                maxDiskSpace: 5 * 1024 * 1024,
                maxNetworkBandwidth: 512 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'convergence',
          dependencies: ['parallel-branch-1', 'parallel-branch-2'],
          agents: [{
            type: 'test-executor',
            tasks: [{
              id: 'convergence-task',
              name: 'Convergence Task',
              type: 'testing',
              priority: 9,
              dependencies: [],
              timeout: 5000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(4);
      
      // Verify execution order
      expect(phaseEvents).toContain('started-foundation');
      expect(phaseEvents).toContain('completed-foundation');
      expect(phaseEvents).toContain('started-parallel-branch-1');
      expect(phaseEvents).toContain('started-parallel-branch-2');
      expect(phaseEvents).toContain('completed-parallel-branch-1');
      expect(phaseEvents).toContain('completed-parallel-branch-2');
      expect(phaseEvents).toContain('started-convergence');
      expect(phaseEvents).toContain('completed-convergence');
      
      // Foundation should complete before parallel branches start
      const foundationCompleted = phaseEvents.indexOf('completed-foundation');
      const branch1Started = phaseEvents.indexOf('started-parallel-branch-1');
      const branch2Started = phaseEvents.indexOf('started-parallel-branch-2');
      
      expect(foundationCompleted).toBeLessThan(branch1Started);
      expect(foundationCompleted).toBeLessThan(branch2Started);
    });
  });

  describe('Agent Assignment and Lifecycle', () => {
    it('should assign agents based on capabilities and manage their lifecycle', async () => {
      const workflowId = 'agent-lifecycle';
      const agentEvents: any[] = [];
      
      coordinator.on('agent-assigned', (event) => {
        agentEvents.push({ type: 'assigned', agent: event.agent });
      });
      
      const phases: PhaseDefinition[] = [
        {
          name: 'multi-agent-phase',
          agents: [
            {
              type: 'test-planner',
              capabilities: ['test-generation', 'test-planning'],
              tasks: [{
                id: 'planning-task',
                name: 'Test Planning',
                type: 'analysis',
                priority: 8,
                dependencies: [],
                timeout: 5000,
                retryCount: 1,
                resources: {
                  maxMemory: 100 * 1024 * 1024,
                  maxCpuPercent: 50,
                  maxDiskSpace: 10 * 1024 * 1024,
                  maxNetworkBandwidth: 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: {}
              }]
            },
            {
              type: 'test-executor',
              capabilities: ['test-execution', 'test-automation'],
              tasks: [{
                id: 'execution-task',
                name: 'Test Execution',
                type: 'testing',
                priority: 9,
                dependencies: [],
                timeout: 8000,
                retryCount: 2,
                resources: {
                  maxMemory: 150 * 1024 * 1024,
                  maxCpuPercent: 70,
                  maxDiskSpace: 15 * 1024 * 1024,
                  maxNetworkBandwidth: 1.5 * 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: {}
              }]
            },
            {
              type: 'test-analyzer',
              capabilities: ['test-analysis', 'metrics-collection'],
              tasks: [{
                id: 'analysis-task',
                name: 'Test Analysis',
                type: 'analysis',
                priority: 7,
                dependencies: [],
                timeout: 6000,
                retryCount: 1,
                resources: {
                  maxMemory: 120 * 1024 * 1024,
                  maxCpuPercent: 60,
                  maxDiskSpace: 12 * 1024 * 1024,
                  maxNetworkBandwidth: 1.2 * 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: {}
              }]
            }
          ]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(true);
      expect(agentEvents).toHaveLength(3);
      
      // Verify agent assignment
      const assignedAgents = agentEvents.map(e => e.agent);
      expect(assignedAgents.some(a => a.type === 'test-planner')).toBe(true);
      expect(assignedAgents.some(a => a.type === 'test-executor')).toBe(true);
      expect(assignedAgents.some(a => a.type === 'test-analyzer')).toBe(true);
      
      // Verify capabilities were assigned
      const plannerAgent = assignedAgents.find(a => a.type === 'test-planner');
      expect(plannerAgent.capabilities).toContain('test-generation');
      expect(plannerAgent.capabilities).toContain('test-planning');
      
      // Verify agent lifecycle in memory
      const agentEntries = await memory.query({
        sessionId: workflowId,
        type: 'agent-state',
        tags: ['agent']
      });
      
      expect(agentEntries).toHaveLength(3);
      agentEntries.forEach(entry => {
        const agent = entry.value as any;
        expect(agent.status).toBe('assigned');
        expect(agent.assignedTime).toBeDefined();
        expect(agent.workflowId).toBe(workflowId);
      });
    });

    it('should handle agent failures and reassignment', async () => {
      const workflowId = 'agent-failure';
      
      // Create a task that will fail
      const failingTask: TaskDefinition = {
        id: 'failing-task',
        name: 'Failing Task',
        type: 'testing',
        priority: 8,
        dependencies: [],
        timeout: 1000, // Very short timeout to force failure
        retryCount: 0,
        resources: {
          maxMemory: 50 * 1024 * 1024,
          maxCpuPercent: 30,
          maxDiskSpace: 5 * 1024 * 1024,
          maxNetworkBandwidth: 512 * 1024,
          requiredAgents: 1
        },
        metadata: { shouldFail: true }
      };
      
      // Override the task executor to simulate a very slow task
      const originalExecuteTask = taskExecutor.executeTask;
      taskExecutor.executeTask = async (task: TaskDefinition, agentId: string) => {
        if (task.metadata?.shouldFail) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Longer than timeout
          return {
            success: false,
            output: null,
            error: 'Task timed out',
            duration: 2000,
            resourcesUsed: {
              peakMemory: 1000,
              cpuTime: 100,
              diskIO: 0,
              networkIO: 0,
              agentsUsed: 1
            },
            retries: 0,
            artifacts: []
          };
        }
        return originalExecuteTask.call(taskExecutor, task, agentId);
      };
      
      const phases: PhaseDefinition[] = [
        {
          name: 'failing-phase',
          agents: [{
            type: 'test-executor',
            tasks: [failingTask]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].success).toBe(false);
      
      // Verify agent failure was recorded
      const agentEntries = await memory.query({
        sessionId: workflowId,
        type: 'agent-state'
      });
      
      expect(agentEntries).toHaveLength(1);
      const failedAgent = agentEntries[0].value as any;
      expect(failedAgent.status).toBe('assigned'); // Status doesn't change in memory for this implementation
      
      // Restore original executor
      taskExecutor.executeTask = originalExecuteTask;
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive workflow and agent metrics', async () => {
      const workflowId = 'metrics-collection';
      
      const phases: PhaseDefinition[] = [
        {
          name: 'metrics-phase-1',
          agents: [{
            type: 'test-planner',
            tasks: [{
              id: 'metrics-task-1',
              name: 'Planning Task',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'metrics-phase-2',
          agents: [{
            type: 'test-executor',
            tasks: [{
              id: 'metrics-task-2',
              name: 'Execution Task',
              type: 'testing',
              priority: 9,
              dependencies: [],
              timeout: 4000,
              retryCount: 1,
              resources: {
                maxMemory: 150 * 1024 * 1024,
                maxCpuPercent: 70,
                maxDiskSpace: 15 * 1024 * 1024,
                maxNetworkBandwidth: 1.5 * 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const startTime = Date.now();
      const result = await coordinator.startWorkflow(workflowId, phases);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      
      // Verify workflow metrics
      const metrics = coordinator.getMetrics();
      expect(metrics.phasesCompleted).toBe(2);
      expect(metrics.agentsSpawned).toBe(2);
      expect(metrics.totalExecutionTime).toBeGreaterThan(0);
      expect(metrics.averagePhaseTime).toBeGreaterThan(0);
      
      // Verify timing is reasonable
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(endTime - startTime + 1000); // Allow some buffer
      
      // Verify phase-level metrics
      result.phases.forEach(phase => {
        expect(phase.duration).toBeGreaterThan(0);
        expect(phase.agents).toHaveLength(1);
        expect(phase.agents[0].success).toBe(true);
        expect(phase.agents[0].duration).toBeGreaterThan(0);
      });
      
      // Verify metrics persisted in memory
      const workflowResult = await memory.get(`${workflowId}-result`);
      expect(workflowResult).toBeTruthy();
      expect((workflowResult!.value as any).metrics).toBeDefined();
    });

    it('should track quality gate performance metrics', async () => {
      const workflowId = 'quality-gate-metrics';
      
      // Setup varying quality metrics
      const qualityMetrics = [
        { metric: 'test_coverage', value: 85 },
        { metric: 'code_quality', value: 88 },
        { metric: 'performance_score', value: 92 },
        { metric: 'security_score', value: 95 }
      ];
      
      for (const metric of qualityMetrics) {
        await memory.store({
          key: `${metric.metric}-metric`,
          value: metric,
          type: 'metric',
          sessionId: workflowId,
          timestamp: new Date(),
          tags: ['quality', metric.metric]
        });
      }
      
      const phases: PhaseDefinition[] = [
        {
          name: 'gate-test-coverage',
          qualityGate: 'test_coverage',
          agents: [{
            type: 'test-executor',
            tasks: [{
              id: 'coverage-task',
              name: 'Coverage Task',
              type: 'testing',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'gate-code-quality',
          qualityGate: 'code_quality',
          agents: [{
            type: 'test-analyzer',
            tasks: [{
              id: 'quality-task',
              name: 'Quality Task',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        },
        {
          name: 'gate-performance',
          qualityGate: 'performance',
          agents: [{
            type: 'performance-tester',
            tasks: [{
              id: 'performance-task',
              name: 'Performance Task',
              type: 'testing',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(3);
      
      // Verify quality gates passed
      result.phases.forEach(phase => {
        expect(phase.qualityGateResult?.passed).toBe(true);
        expect(phase.qualityGateResult?.metrics).toBeDefined();
      });
      
      // Verify quality gate metrics collected
      const gateResults = await memory.query({
        sessionId: workflowId,
        tags: ['quality-gate']
      });
      
      expect(gateResults).toHaveLength(3);
      
      const metrics = coordinator.getMetrics();
      expect(metrics.qualityGatesPassed).toBe(3);
      expect(metrics.qualityGatesFailed).toBe(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle coordinator shutdown gracefully', async () => {
      const workflowId = 'shutdown-test';
      
      // Start a workflow
      const phases: PhaseDefinition[] = [
        {
          name: 'simple-phase',
          agents: [{
            type: 'test-planner',
            tasks: [{
              id: 'simple-task',
              name: 'Simple Task',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 1000,
              retryCount: 1,
              resources: {
                maxMemory: 50 * 1024 * 1024,
                maxCpuPercent: 30,
                maxDiskSpace: 5 * 1024 * 1024,
                maxNetworkBandwidth: 512 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      expect(result.success).toBe(true);
      
      // Verify active state before shutdown
      const activeAgents = coordinator.getActiveAgents();
      const activePhases = coordinator.getActivePhases();
      
      // After workflow completion, active agents and phases should be cleared
      expect(activeAgents).toHaveLength(0);
      expect(activePhases).toHaveLength(0);
      
      // Shutdown should complete without errors
      await expect(coordinator.shutdown()).resolves.not.toThrow();
      
      // Verify cleanup
      expect(coordinator.getActiveAgents()).toHaveLength(0);
      expect(coordinator.getActivePhases()).toHaveLength(0);
    });

    it('should recover from memory corruption during workflow', async () => {
      const workflowId = 'memory-corruption-test';
      
      // Start workflow
      const phases: PhaseDefinition[] = [
        {
          name: 'phase-before-corruption',
          agents: [{
            type: 'test-planner',
            tasks: [{
              id: 'before-corruption',
              name: 'Before Corruption',
              type: 'analysis',
              priority: 8,
              dependencies: [],
              timeout: 3000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: {}
            }]
          }]
        }
      ];
      
      const result = await coordinator.startWorkflow(workflowId, phases);
      
      // Even if memory operations fail, workflow should handle gracefully
      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(1);
      
      // Coordinator should maintain its own state
      const metrics = coordinator.getMetrics();
      expect(metrics.phasesCompleted).toBe(1);
      expect(metrics.agentsSpawned).toBe(1);
    });
  });

  describe('Swarm Coordination', () => {
    it('should coordinate multiple agent swarms efficiently', async () => {
      const workflowId = 'swarm-coordination';
      
      const phases: PhaseDefinition[] = [
        {
          name: 'parallel-swarm-phase',
          agents: [
            // Testing swarm
            {
              type: 'test-executor',
              capabilities: ['test-execution', 'api-testing'],
              tasks: [{
                id: 'api-tests',
                name: 'API Testing',
                type: 'testing',
                priority: 8,
                dependencies: [],
                timeout: 5000,
                retryCount: 1,
                resources: {
                  maxMemory: 100 * 1024 * 1024,
                  maxCpuPercent: 50,
                  maxDiskSpace: 10 * 1024 * 1024,
                  maxNetworkBandwidth: 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: { swarm: 'testing' }
              }]
            },
            {
              type: 'performance-tester',
              capabilities: ['performance-testing', 'load-testing'],
              tasks: [{
                id: 'load-tests',
                name: 'Load Testing',
                type: 'testing',
                priority: 8,
                dependencies: [],
                timeout: 6000,
                retryCount: 2,
                resources: {
                  maxMemory: 200 * 1024 * 1024,
                  maxCpuPercent: 70,
                  maxDiskSpace: 20 * 1024 * 1024,
                  maxNetworkBandwidth: 2 * 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: { swarm: 'testing' }
              }]
            },
            // Analysis swarm
            {
              type: 'test-analyzer',
              capabilities: ['test-analysis', 'metrics-collection'],
              tasks: [{
                id: 'metrics-analysis',
                name: 'Metrics Analysis',
                type: 'analysis',
                priority: 7,
                dependencies: [],
                timeout: 4000,
                retryCount: 1,
                resources: {
                  maxMemory: 150 * 1024 * 1024,
                  maxCpuPercent: 60,
                  maxDiskSpace: 15 * 1024 * 1024,
                  maxNetworkBandwidth: 1.5 * 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: { swarm: 'analysis' }
              }]
            },
            {
              type: 'security-tester',
              capabilities: ['security-testing', 'vulnerability-scanning'],
              tasks: [{
                id: 'security-scan',
                name: 'Security Scanning',
                type: 'testing',
                priority: 9,
                dependencies: [],
                timeout: 7000,
                retryCount: 1,
                resources: {
                  maxMemory: 180 * 1024 * 1024,
                  maxCpuPercent: 65,
                  maxDiskSpace: 18 * 1024 * 1024,
                  maxNetworkBandwidth: 1.8 * 1024 * 1024,
                  requiredAgents: 1
                },
                metadata: { swarm: 'analysis' }
              }]
            }
          ]
        }
      ];
      
      const startTime = Date.now();
      const result = await coordinator.startWorkflow(workflowId, phases);
      const totalTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].agents).toHaveLength(4);
      
      // All agents should succeed
      result.phases[0].agents.forEach(agent => {
        expect(agent.success).toBe(true);
        expect(agent.duration).toBeGreaterThan(0);
      });
      
      // Verify coordination efficiency (should complete faster than sequential)
      const sequentialTime = 5000 + 6000 + 4000 + 7000; // Sum of individual timeouts
      expect(totalTime).toBeLessThan(sequentialTime * 0.8); // Should be significantly faster
      
      // Verify swarm metrics
      const metrics = coordinator.getMetrics();
      expect(metrics.agentsSpawned).toBe(4);
      expect(metrics.phasesCompleted).toBe(1);
      
      // Verify all agents were properly tracked
      const agentEntries = await memory.query({
        sessionId: workflowId,
        type: 'agent-state'
      });
      
      expect(agentEntries).toHaveLength(4);
      
      // Verify swarm grouping in metadata
      const testingSwarmAgents = agentEntries.filter(entry => {
        const agent = entry.value as any;
        return agent.type === 'test-executor' || agent.type === 'performance-tester';
      });
      
      const analysisSwarmAgents = agentEntries.filter(entry => {
        const agent = entry.value as any;
        return agent.type === 'test-analyzer' || agent.type === 'security-tester';
      });
      
      expect(testingSwarmAgents).toHaveLength(2);
      expect(analysisSwarmAgents).toHaveLength(2);
    });
  });
});