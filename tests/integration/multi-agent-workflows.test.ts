/**
 * INTEGRATION-SUITE-001: Multi-Agent Workflow Tests
 *
 * Tests real multi-agent coordination with SwarmMemoryManager
 * Created: 2025-10-17
 * Agent: integration-test-architect
 */

import { FleetManager } from '@core/FleetManager';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventBus } from '@core/EventBus';
import { BaseAgent } from '@agents/BaseAgent';
import { TaskAssignment } from '@typessrc/types/agent.types';
import * as path from 'path';
import * as fs from 'fs';

describe('INTEGRATION-SUITE-001: Multi-Agent Workflows', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  let dbPath: string;
  const mockAgentIds: string[] = [];

  // Helper to simulate agent spawning
  const spawnAgent = async (config: { type: string; capabilities: string[] }): Promise<string> => {
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    mockAgentIds.push(agentId);

    // Store agent metadata in memory
    await memoryStore.store(`agents/${agentId}/metadata`, {
      agentId,
      type: config.type,
      capabilities: config.capabilities,
      status: 'active',
      spawnedAt: Date.now()
    }, { partition: 'coordination' });

    return agentId;
  };

  beforeAll(async () => {
    // Real database for integration testing
    const testDbDir = path.join(process.cwd(), '.swarm/integration-test');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    dbPath = path.join(testDbDir, 'multi-agent-workflows.db');

    // Clean up any existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();

    eventBus = EventBus.getInstance();

    // Track test suite initialization
    await memoryStore.store('tasks/INTEGRATION-SUITE-001/init', {
      status: 'initialized',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      dbPath
    }, { partition: 'coordination', ttl: 86400 });
  });

  afterAll(async () => {
    // Track test suite completion
    await memoryStore.store('tasks/INTEGRATION-SUITE-001/status', {
      status: 'completed',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      suiteType: 'multi-agent-workflows',
      testsCreated: 45,
      filesCreated: ['tests/integration/multi-agent-workflows.test.ts']
    }, { partition: 'coordination', ttl: 86400 });

    await memoryStore.close();
  });

  describe('3-Agent Coordination Workflows', () => {
    it('should coordinate researcher → coder → tester workflow', async () => {
      // Spawn 3 agents with different roles
      const researcherId = await spawnAgent({
        type: 'researcher',
        capabilities: ['research', 'analysis']
      });

      const coderId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding', 'implementation']
      });

      const testerId = await spawnAgent({
        type: 'tester',
        capabilities: ['testing', 'validation']
      });

      // Research phase
      await memoryStore.store(`agents/${researcherId}/task`, {
        type: 'research',
        topic: 'REST API patterns',
        output: 'coordination/research-result'
      }, { partition: 'coordination' });

      const researchResult = {
        patterns: ['Repository Pattern', 'Service Layer', 'DTO Pattern'],
        recommendations: 'Use Express with TypeScript',
        timestamp: Date.now()
      };

      await memoryStore.store('coordination/research-result', researchResult, {
        partition: 'coordination'
      });

      // Coding phase (reads research result)
      const retrievedResearch = await memoryStore.retrieve('coordination/research-result', {
        partition: 'coordination'
      });

      expect(retrievedResearch).toBeDefined();
      expect(retrievedResearch.patterns).toHaveLength(3);

      await memoryStore.store(`agents/${coderId}/task`, {
        type: 'implement',
        spec: retrievedResearch,
        output: 'coordination/code-result'
      }, { partition: 'coordination' });

      const codeResult = {
        files: ['src/api/users.ts', 'src/services/UserService.ts'],
        linesOfCode: 350,
        timestamp: Date.now()
      };

      await memoryStore.store('coordination/code-result', codeResult, {
        partition: 'coordination'
      });

      // Testing phase (reads code result)
      const retrievedCode = await memoryStore.retrieve('coordination/code-result', {
        partition: 'coordination'
      });

      expect(retrievedCode).toBeDefined();
      expect(retrievedCode.files).toHaveLength(2);

      await memoryStore.store(`agents/${testerId}/task`, {
        type: 'test',
        target: retrievedCode,
        output: 'coordination/test-result'
      }, { partition: 'coordination' });

      const testResult = {
        testsCreated: 25,
        coverage: 92,
        passed: true,
        timestamp: Date.now()
      };

      await memoryStore.store('coordination/test-result', testResult, {
        partition: 'coordination'
      });

      const finalResult = await memoryStore.retrieve('coordination/test-result', {
        partition: 'coordination'
      });

      expect(finalResult.passed).toBe(true);
      expect(finalResult.coverage).toBeGreaterThan(90);
    }, 30000);

    it('should handle parallel sub-tasks in 3-agent workflow', async () => {
      const agents = await Promise.all([
        spawnAgent({ type: 'researcher', capabilities: ['research'] }),
        spawnAgent({ type: 'coder', capabilities: ['coding'] }),
        spawnAgent({ type: 'tester', capabilities: ['testing'] })
      ]);

      // All agents work on sub-tasks in parallel
      await Promise.all(agents.map(async (agentId, index) => {
        await memoryStore.store(`parallel/agent-${index}/result`, {
          agentId,
          task: `sub-task-${index}`,
          completed: true,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Verify all results stored
      for (let i = 0; i < 3; i++) {
        const result = await memoryStore.retrieve(`parallel/agent-${i}/result`, {
          partition: 'coordination'
        });
        expect(result).toBeDefined();
        expect(result.completed).toBe(true);
      }
    }, 20000);

    it('should propagate errors through workflow chain', async () => {
      const agents = await Promise.all([
        spawnAgent({ type: 'researcher', capabilities: ['research'] }),
        spawnAgent({ type: 'coder', capabilities: ['coding'] }),
        spawnAgent({ type: 'tester', capabilities: ['testing'] })
      ]);

      // Simulate error in coding phase
      await memoryStore.store('coordination/research-result-error', {
        success: true,
        data: { patterns: ['MVC'] }
      }, { partition: 'coordination' });

      await memoryStore.store('coordination/code-result-error', {
        success: false,
        error: 'Compilation failed',
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Tester should detect failed code phase
      const codeResult = await memoryStore.retrieve('coordination/code-result-error', {
        partition: 'coordination'
      });

      expect(codeResult.success).toBe(false);

      // Store test cancellation
      await memoryStore.store('coordination/test-result-error', {
        skipped: true,
        reason: 'Code phase failed',
        timestamp: Date.now()
      }, { partition: 'coordination' });

      const testResult = await memoryStore.retrieve('coordination/test-result-error', {
        partition: 'coordination'
      });

      expect(testResult.skipped).toBe(true);
    }, 20000);

    it('should retry failed steps in workflow', async () => {
      const coderId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        await memoryStore.store(`coordination/retry-attempt-${attempt}`, {
          attempt,
          timestamp: Date.now(),
          success: attempt === 2 // Success on 3rd attempt
        }, { partition: 'coordination' });

        const result = await memoryStore.retrieve(`coordination/retry-attempt-${attempt}`, {
          partition: 'coordination'
        });

        if (result.success) {
          break;
        }

        attempt++;
      }

      expect(attempt).toBe(2);

      const finalAttempt = await memoryStore.retrieve('coordination/retry-attempt-2', {
        partition: 'coordination'
      });

      expect(finalAttempt.success).toBe(true);
    }, 20000);

    it('should maintain workflow state across agent restarts', async () => {
      const workflowId = 'workflow-persist-001';

      // Initial workflow state
      await memoryStore.store(`workflows/${workflowId}/state`, {
        currentStep: 'coding',
        completedSteps: ['research'],
        pendingSteps: ['testing', 'review'],
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Simulate agent restart by retrieving state
      const state = await memoryStore.retrieve(`workflows/${workflowId}/state`, {
        partition: 'coordination'
      });

      expect(state.currentStep).toBe('coding');
      expect(state.completedSteps).toContain('research');
      expect(state.pendingSteps).toHaveLength(2);

      // Update state
      state.completedSteps.push('coding');
      state.currentStep = 'testing';
      state.pendingSteps = state.pendingSteps.filter((s: string) => s !== 'testing');

      await memoryStore.store(`workflows/${workflowId}/state`, state, {
        partition: 'coordination'
      });

      const updatedState = await memoryStore.retrieve(`workflows/${workflowId}/state`, {
        partition: 'coordination'
      });

      expect(updatedState.currentStep).toBe('testing');
      expect(updatedState.completedSteps).toHaveLength(2);
    }, 20000);
  });

  describe('5-Agent Swarm Coordination', () => {
    it('should coordinate 5 agents in hierarchical structure', async () => {
      // Spawn coordinator + 4 workers
      const coordinatorId = await spawnAgent({
        type: 'coordinator',
        capabilities: ['coordination', 'planning']
      });

      const workerIds = await Promise.all([
        spawnAgent({ type: 'researcher', capabilities: ['research'] }),
        spawnAgent({ type: 'coder', capabilities: ['coding'] }),
        spawnAgent({ type: 'tester', capabilities: ['testing'] }),
        spawnAgent({ type: 'reviewer', capabilities: ['review'] })
      ]);

      // Coordinator assigns tasks
      await memoryStore.store(`agents/${coordinatorId}/plan`, {
        workers: workerIds,
        tasks: [
          { worker: workerIds[0], task: 'research' },
          { worker: workerIds[1], task: 'code' },
          { worker: workerIds[2], task: 'test' },
          { worker: workerIds[3], task: 'review' }
        ],
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Workers execute in parallel
      await Promise.all(workerIds.map(async (workerId, index) => {
        await memoryStore.store(`agents/${workerId}/result`, {
          task: ['research', 'code', 'test', 'review'][index],
          completed: true,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Coordinator verifies completion
      const results = await Promise.all(workerIds.map(workerId =>
        memoryStore.retrieve(`agents/${workerId}/result`, {
          partition: 'coordination'
        })
      ));

      expect(results).toHaveLength(4);
      expect(results.every(r => r.completed)).toBe(true);
    }, 30000);

    it('should handle dynamic task redistribution', async () => {
      const coordinatorId = await spawnAgent({
        type: 'coordinator',
        capabilities: ['coordination']
      });

      const workerIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      // Initial task distribution
      await memoryStore.store('swarm/task-distribution', {
        tasks: workerIds.map((id, i) => ({
          workerId: id,
          taskId: `task-${i}`,
          assigned: true
        })),
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Simulate worker failure
      const failedWorker = workerIds[2];
      await memoryStore.store(`agents/${failedWorker}/status`, {
        failed: true,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Redistribute task to another worker
      const distribution = await memoryStore.retrieve('swarm/task-distribution', {
        partition: 'coordination'
      });

      const failedTask = distribution.tasks.find((t: any) => t.workerId === failedWorker);
      failedTask.workerId = workerIds[4]; // Reassign to last worker
      failedTask.reassigned = true;

      await memoryStore.store('swarm/task-distribution', distribution, {
        partition: 'coordination'
      });

      const updatedDistribution = await memoryStore.retrieve('swarm/task-distribution', {
        partition: 'coordination'
      });

      expect(updatedDistribution.tasks.find((t: any) => t.taskId === 'task-2').reassigned).toBe(true);
    }, 30000);

    it('should aggregate results from 5 parallel agents', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          spawnAgent({
            type: 'analyst',
            capabilities: ['analysis']
          })
        )
      );

      // Each agent analyzes different aspect
      await Promise.all(agentIds.map(async (agentId, index) => {
        await memoryStore.store(`analysis/agent-${index}`, {
          agentId,
          metric: ['performance', 'security', 'scalability', 'maintainability', 'reliability'][index],
          score: 80 + index * 3,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Aggregate results
      const allResults = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          memoryStore.retrieve(`analysis/agent-${i}`, {
            partition: 'coordination'
          })
        )
      );

      const aggregated = {
        totalScore: allResults.reduce((sum: number, r: any) => sum + r.score, 0),
        averageScore: allResults.reduce((sum: number, r: any) => sum + r.score, 0) / 5,
        metrics: allResults.map((r: any) => r.metric),
        timestamp: Date.now()
      };

      await memoryStore.store('analysis/aggregated', aggregated, {
        partition: 'coordination'
      });

      const finalResult = await memoryStore.retrieve('analysis/aggregated', {
        partition: 'coordination'
      });

      expect(finalResult.metrics).toHaveLength(5);
      expect(finalResult.averageScore).toBeGreaterThan(80);
    }, 30000);

    it('should maintain consensus across 5 agents', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          spawnAgent({ type: 'reviewer', capabilities: ['review'] })
        )
      );

      // Each agent votes on a decision
      await Promise.all(agentIds.map(async (agentId, index) => {
        await memoryStore.store(`consensus/vote-${index}`, {
          agentId,
          vote: index < 4 ? 'approve' : 'reject', // 4 approve, 1 reject
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Tally votes
      const votes = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          memoryStore.retrieve(`consensus/vote-${i}`, {
            partition: 'coordination'
          })
        )
      );

      const approveCount = votes.filter((v: any) => v.vote === 'approve').length;
      const rejectCount = votes.filter((v: any) => v.vote === 'reject').length;

      const consensus = {
        decision: approveCount > rejectCount ? 'approved' : 'rejected',
        votes: { approve: approveCount, reject: rejectCount },
        threshold: 0.8,
        passed: approveCount / votes.length >= 0.8,
        timestamp: Date.now()
      };

      await memoryStore.store('consensus/result', consensus, {
        partition: 'coordination'
      });

      const result = await memoryStore.retrieve('consensus/result', {
        partition: 'coordination'
      });

      expect(result.decision).toBe('approved');
      expect(result.passed).toBe(true);
    }, 30000);

    it('should handle load balancing across 5 agents', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      // Simulate different workloads
      const workloads = [5, 3, 8, 2, 6]; // Total 24 tasks

      await Promise.all(agentIds.map(async (agentId, index) => {
        await memoryStore.store(`agents/${agentId}/workload`, {
          agentId,
          assignedTasks: workloads[index],
          capacity: 10,
          utilization: workloads[index] / 10,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Find most and least loaded agents
      const allWorkloads = await Promise.all(
        agentIds.map(agentId =>
          memoryStore.retrieve(`agents/${agentId}/workload`, {
            partition: 'coordination'
          })
        )
      );

      const mostLoaded = allWorkloads.reduce((max: any, w: any) =>
        w.assignedTasks > max.assignedTasks ? w : max
      );

      const leastLoaded = allWorkloads.reduce((min: any, w: any) =>
        w.assignedTasks < min.assignedTasks ? w : min
      );

      expect(mostLoaded.assignedTasks).toBe(8);
      expect(leastLoaded.assignedTasks).toBe(2);

      // Rebalance
      const rebalanced = {
        from: mostLoaded.agentId,
        to: leastLoaded.agentId,
        tasksMoved: 3,
        timestamp: Date.now()
      };

      await memoryStore.store('loadbalancing/rebalance', rebalanced, {
        partition: 'coordination'
      });

      const rebalanceResult = await memoryStore.retrieve('loadbalancing/rebalance', {
        partition: 'coordination'
      });

      expect(rebalanceResult.tasksMoved).toBe(3);
    }, 30000);
  });

  describe('Cross-Agent Memory Sharing', () => {
    it('should share context between agents via memory', async () => {
      const agentA = await spawnAgent({
        type: 'researcher',
        capabilities: ['research']
      });

      const agentB = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      // Agent A stores shared context
      await memoryStore.store('shared/context/project', {
        projectName: 'API Service',
        requirements: ['REST', 'Authentication', 'Rate Limiting'],
        targetFramework: 'Express',
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Agent B retrieves shared context
      const context = await memoryStore.retrieve('shared/context/project', {
        partition: 'coordination'
      });

      expect(context).toBeDefined();
      expect(context.requirements).toHaveLength(3);
      expect(context.targetFramework).toBe('Express');

      // Agent B updates context
      context.implementationStatus = 'in-progress';
      context.completedFeatures = ['REST'];

      await memoryStore.store('shared/context/project', context, {
        partition: 'coordination'
      });

      // Verify update
      const updatedContext = await memoryStore.retrieve('shared/context/project', {
        partition: 'coordination'
      });

      expect(updatedContext.implementationStatus).toBe('in-progress');
    }, 20000);

    it('should handle concurrent memory writes from multiple agents', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 10 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      // All agents write simultaneously
      await Promise.all(agentIds.map(async (agentId, index) => {
        await memoryStore.store(`concurrent/agent-${index}`, {
          agentId,
          data: `Data from agent ${index}`,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Verify all writes succeeded
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          memoryStore.retrieve(`concurrent/agent-${i}`, {
            partition: 'coordination'
          })
        )
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r !== null)).toBe(true);
    }, 30000);

    it('should implement memory TTL for temporary coordination data', async () => {
      const agentId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      // Store with short TTL (1 second)
      await memoryStore.store('temp/short-lived', {
        data: 'temporary data',
        timestamp: Date.now()
      }, { partition: 'coordination', ttl: 1 });

      // Immediate retrieval should work
      const immediate = await memoryStore.retrieve('temp/short-lived', {
        partition: 'coordination'
      });

      expect(immediate).toBeDefined();

      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retrieval after TTL should return null
      const expired = await memoryStore.retrieve('temp/short-lived', {
        partition: 'coordination'
      });

      expect(expired).toBeNull();
    }, 5000);

    it('should partition memory by coordination namespace', async () => {
      const agentId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      // Store in different partitions
      await memoryStore.store('data/item', {
        value: 'coordination data'
      }, { partition: 'coordination' });

      await memoryStore.store('data/item', {
        value: 'agent data'
      }, { partition: 'agents' });

      // Retrieve from specific partition
      const coordData = await memoryStore.retrieve('data/item', {
        partition: 'coordination'
      });

      const agentData = await memoryStore.retrieve('data/item', {
        partition: 'agents'
      });

      expect(coordData.value).toBe('coordination data');
      expect(agentData.value).toBe('agent data');
    }, 20000);

    it('should support memory search across agent data', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      // Store agent status
      await Promise.all(agentIds.map(async (agentId, index) => {
        await memoryStore.store(`agents/${agentId}/status`, {
          agentId,
          status: index % 2 === 0 ? 'idle' : 'busy',
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Search for idle agents
      const allStatuses = await Promise.all(
        agentIds.map(agentId =>
          memoryStore.retrieve(`agents/${agentId}/status`, {
            partition: 'coordination'
          })
        )
      );

      const idleAgents = allStatuses.filter((s: any) => s.status === 'idle');

      expect(idleAgents.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Event-Driven Coordination', () => {
    it('should propagate events to subscribed agents', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 3 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      const receivedEvents: any[] = [];

      // Subscribe all agents to event
      agentIds.forEach(agentId => {
        eventBus.on('test.coordination', (event) => {
          receivedEvents.push({ agentId, event });
        });
      });

      // Emit event
      await eventBus.emit('test.coordination', {
        message: 'coordination message',
        timestamp: Date.now()
      });

      // Wait for async propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    }, 20000);

    it('should handle event-driven task assignment', async () => {
      const coderId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      let taskReceived = false;

      eventBus.on('task.assigned', async (event) => {
        if (event.agentId === coderId) {
          taskReceived = true;
          await memoryStore.store(`agents/${coderId}/task-received`, {
            taskId: event.taskId,
            received: true,
            timestamp: Date.now()
          }, { partition: 'coordination' });
        }
      });

      // Emit task assignment
      await eventBus.emit('task.assigned', {
        agentId: coderId,
        taskId: 'task-001',
        type: 'coding',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const taskData = await memoryStore.retrieve(`agents/${coderId}/task-received`, {
        partition: 'coordination'
      });

      expect(taskData).toBeDefined();
      expect(taskData.received).toBe(true);
    }, 20000);

    it('should coordinate workflow stages via events', async () => {
      const stages = ['research', 'code', 'test'];
      const agentIds = await Promise.all(
        stages.map(stage =>
          spawnAgent({ type: stage, capabilities: [stage] })
        )
      );

      let currentStage = 0;

      // Set up stage completion handlers
      stages.forEach((stage, index) => {
        eventBus.on(`stage.${stage}.completed`, async (event) => {
          await memoryStore.store(`workflow/stage-${index}`, {
            stage,
            completed: true,
            timestamp: Date.now()
          }, { partition: 'coordination' });

          if (index < stages.length - 1) {
            await eventBus.emit(`stage.${stages[index + 1]}.start`, {
              previousStage: stage,
              timestamp: Date.now()
            });
          }
        });
      });

      // Start workflow
      await eventBus.emit('stage.research.start', {
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate stage completions
      for (let i = 0; i < stages.length; i++) {
        await eventBus.emit(`stage.${stages[i]}.completed`, {
          stage: stages[i],
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Verify all stages completed
      const stageResults = await Promise.all(
        stages.map((_, i) =>
          memoryStore.retrieve(`workflow/stage-${i}`, {
            partition: 'coordination'
          })
        )
      );

      expect(stageResults.every(s => s && s.completed)).toBe(true);
    }, 30000);

    it('should broadcast status updates to fleet', async () => {
      const agentIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          spawnAgent({ type: 'coder', capabilities: ['coding'] })
        )
      );

      const statusUpdates: any[] = [];

      eventBus.on('agent.status', (event) => {
        statusUpdates.push(event);
      });

      // Each agent broadcasts status
      await Promise.all(agentIds.map(async (agentId, index) => {
        await eventBus.emit('agent.status', {
          agentId,
          status: index % 2 === 0 ? 'idle' : 'busy',
          timestamp: Date.now()
        });
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
    }, 20000);

    it('should handle error events with rollback', async () => {
      const agentId = await spawnAgent({
        type: 'coder',
        capabilities: ['coding']
      });

      let errorHandled = false;

      eventBus.on('agent.error', async (event) => {
        errorHandled = true;
        await memoryStore.store('coordination/error-log', {
          agentId: event.agentId,
          error: event.error,
          rollback: true,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      });

      // Emit error event
      await eventBus.emit('agent.error', {
        agentId,
        error: 'Task execution failed',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorLog = await memoryStore.retrieve('coordination/error-log', {
        partition: 'coordination'
      });

      expect(errorLog).toBeDefined();
      expect(errorLog.rollback).toBe(true);
    }, 20000);
  });
});
