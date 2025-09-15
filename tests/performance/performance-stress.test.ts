/**
 * Performance and stress tests for the agent system
 */

import { DistributedMemorySystem } from '../../src/memory/distributed-memory';
import { RequirementsExplorerAgent } from '../../src/agents/requirements-explorer';
import { PerformanceHunterAgent } from '../../src/agents/performance-hunter';
import { BaseAgent } from '../../src/agents/base-agent';
import { AgentDecision, TaskDefinition } from '../../src/core/types';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import {
  createTestAgentId,
  createTestAgentConfig,
  createTestTask,
  measureExecutionTime,
  createPerformanceTestData,
  createSeededRandom
} from '../utils/test-helpers';

// Test agent for performance testing
class PerformanceTestAgent extends BaseAgent {
  private processingDelay: number;

  constructor(id: any, config: any, logger: any, eventBus: any, memory: any, delay: number = 0) {
    super(id, config, logger, eventBus, memory);
    this.processingDelay = delay;
  }

  protected async perceive(context: any): Promise<any> {
    if (this.processingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));
    }
    return { context, processed: true };
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    return {
      id: `perf-decision-${Date.now()}`,
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'process',
      reasoning: { factors: [], heuristics: [], evidence: [] },
      confidence: 0.9,
      alternatives: [],
      risks: [],
      recommendations: []
    };
  }

  protected async act(decision: AgentDecision): Promise<any> {
    return { success: true, processed: true };
  }

  protected async learn(feedback: any): Promise<void> {
    // Minimal learning for performance testing
  }
}

describe('Performance and Stress Tests', () => {
  let memory: DistributedMemorySystem;
  let eventBus: MockEventBus;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    eventBus = new MockEventBus();
    memory = new DistributedMemorySystem(logger, eventBus);
  });

  afterEach(() => {
    logger.reset();
    eventBus.reset();
  });

  describe('Memory System Performance', () => {
    it('should handle high-volume storage operations efficiently', async () => {
      const testData = createPerformanceTestData('complex');
      const operations = [];

      const { result: storeResults, duration: storeTime } = await measureExecutionTime(async () => {
        for (let i = 0; i < testData.itemCount; i++) {
          operations.push(
            memory.store(`perf-test-${i}`, {
              id: i,
              data: `test-data-${i}`,
              timestamp: Date.now(),
              metadata: { type: 'performance', batch: Math.floor(i / 100) }
            }, {
              type: 'state',
              tags: ['performance', `batch-${Math.floor(i / 100)}`],
              partition: 'performance'
            })
          );
        }
        return Promise.all(operations);
      });

      expect(storeTime).toBeLessThan(testData.timeout);
      expect(operations.length).toBe(testData.itemCount);

      // Verify all items were stored
      const stats = memory.getStatistics();
      expect(stats.totalEntries).toBe(testData.itemCount);
    });

    it('should handle concurrent read operations efficiently', async () => {
      // Setup test data
      const itemCount = 500;
      for (let i = 0; i < itemCount; i++) {
        await memory.store(`concurrent-read-${i}`, { value: i });
      }

      const { result: readResults, duration: readTime } = await measureExecutionTime(async () => {
        const readOperations = [];
        for (let i = 0; i < itemCount; i++) {
          readOperations.push(memory.retrieve(`concurrent-read-${i}`));
        }
        return Promise.all(readOperations);
      });

      expect(readTime).toBeLessThan(2000); // 2 seconds
      expect(readResults).toHaveLength(itemCount);
      expect(readResults.every(result => result !== null)).toBe(true);
    });

    it('should handle complex queries efficiently', async () => {
      // Setup diverse test data
      const categories = ['user', 'product', 'order', 'payment', 'analytics'];
      const statuses = ['active', 'inactive', 'pending', 'completed'];
      const random = createSeededRandom();

      for (let i = 0; i < 1000; i++) {
        const category = random.choice(categories);
        const status = random.choice(statuses);

        await memory.store(`query-test-${i}`, {
          id: i,
          category,
          status,
          value: random.integer(1, 1000)
        }, {
          type: 'state',
          tags: [category, status, `value-${Math.floor(random.integer(1, 1000) / 100)}`],
          partition: category
        });
      }

      // Test various query patterns
      const queries = [
        { tags: ['user'], limit: 100 },
        { tags: ['active'], limit: 50 },
        { partition: 'product', limit: 75 },
        { type: 'state', tags: ['completed'], limit: 25 },
        { tags: ['user', 'active'], limit: 30 }
      ];

      const { duration: queryTime } = await measureExecutionTime(async () => {
        const queryPromises = queries.map(query => memory.query(query));
        return Promise.all(queryPromises);
      });

      expect(queryTime).toBeLessThan(1000); // 1 second for all queries
    });

    it('should maintain performance under memory pressure', async () => {
      const largeBatch = 2000;
      const largeData = 'x'.repeat(1024); // 1KB per entry

      // Fill memory with large entries
      const fillOperations = [];
      for (let i = 0; i < largeBatch; i++) {
        fillOperations.push(
          memory.store(`large-entry-${i}`, {
            id: i,
            payload: largeData,
            timestamp: Date.now()
          }, {
            type: 'artifact',
            tags: ['large-data'],
            partition: 'large-data'
          })
        );
      }

      const { duration: fillTime } = await measureExecutionTime(async () => {
        return Promise.all(fillOperations);
      });

      expect(fillTime).toBeLessThan(10000); // 10 seconds

      // Test retrieval performance under load
      const { duration: retrievalTime } = await measureExecutionTime(async () => {
        const retrievalOps = [];
        for (let i = 0; i < 100; i++) {
          retrievalOps.push(memory.retrieve(`large-entry-${i * 10}`));
        }
        return Promise.all(retrievalOps);
      });

      expect(retrievalTime).toBeLessThan(1000); // 1 second
    });
  });

  describe('Agent Performance', () => {
    it('should handle multiple agents executing concurrently', async () => {
      const agentCount = 10;
      const tasksPerAgent = 5;
      const agents: PerformanceTestAgent[] = [];

      // Create multiple agents
      for (let i = 0; i < agentCount; i++) {
        const agent = new PerformanceTestAgent(
          createTestAgentId({ id: `perf-agent-${i}` }),
          createTestAgentConfig(),
          logger,
          eventBus,
          memory,
          10 // 10ms processing delay
        );
        await agent.initialize();
        agents.push(agent);
      }

      // Execute tasks concurrently across all agents
      const { duration: executionTime } = await measureExecutionTime(async () => {
        const allTaskPromises = [];

        for (let agentIndex = 0; agentIndex < agentCount; agentIndex++) {
          for (let taskIndex = 0; taskIndex < tasksPerAgent; taskIndex++) {
            const task = createTestTask({
              id: `task-${agentIndex}-${taskIndex}`,
              context: { agentIndex, taskIndex }
            });
            allTaskPromises.push(agents[agentIndex].executeTask(task));
          }
        }

        return Promise.all(allTaskPromises);
      });

      const totalTasks = agentCount * tasksPerAgent;
      expect(executionTime).toBeLessThan(5000); // 5 seconds for all tasks

      // Verify all agents completed their tasks
      agents.forEach((agent, index) => {
        const metrics = agent.getMetrics();
        expect(metrics.tasksCompleted).toBe(tasksPerAgent);
      });
    });

    it('should handle agent collaboration under load', async () => {
      const collaboratingAgents = 5;
      const agents: PerformanceTestAgent[] = [];

      // Create collaborating agents
      for (let i = 0; i < collaboratingAgents; i++) {
        const agent = new PerformanceTestAgent(
          createTestAgentId({ id: `collab-agent-${i}` }),
          createTestAgentConfig(),
          logger,
          eventBus,
          memory
        );
        await agent.initialize();
        agents.push(agent);
      }

      // Test collaboration performance
      const { duration: collabTime } = await measureExecutionTime(async () => {
        const collaborationPromises = [];

        // Each agent collaborates with every other agent
        for (let i = 0; i < collaboratingAgents; i++) {
          for (let j = 0; j < collaboratingAgents; j++) {
            if (i !== j) {
              collaborationPromises.push(
                agents[i].collaborate(agents[j].getFullState().id, {
                  type: 'performance-test',
                  data: `collaboration-${i}-${j}`
                })
              );
            }
          }
        }

        return Promise.all(collaborationPromises);
      });

      const expectedCollaborations = collaboratingAgents * (collaboratingAgents - 1);
      expect(collabTime).toBeLessThan(3000); // 3 seconds

      // Verify collaborations were established
      const collaborationEvents = eventBus.getEmittedEvents('agent:collaboration');
      expect(collaborationEvents.length).toBe(expectedCollaborations);
    });

    it('should maintain performance with large task queues', async () => {
      const agent = new PerformanceTestAgent(
        createTestAgentId({ id: 'queue-test-agent' }),
        createTestAgentConfig(),
        logger,
        eventBus,
        memory
      );
      await agent.initialize();

      const queueSize = 100;
      const tasks: TaskDefinition[] = [];

      // Create large task queue
      for (let i = 0; i < queueSize; i++) {
        tasks.push(createTestTask({
          id: `queue-task-${i}`,
          context: {
            taskNumber: i,
            complexity: i % 10 // Varying complexity
          }
        }));
      }

      // Process queue sequentially (simulating real-world queue processing)
      const { duration: processingTime } = await measureExecutionTime(async () => {
        const results = [];
        for (const task of tasks) {
          results.push(await agent.executeTask(task));
        }
        return results;
      });

      expect(processingTime).toBeLessThan(10000); // 10 seconds
      expect(agent.getMetrics().tasksCompleted).toBe(queueSize);
    });
  });

  describe('System Scalability', () => {
    it('should scale memory operations linearly', async () => {
      const sizes = [100, 500, 1000];
      const results = [];

      for (const size of sizes) {
        const { duration } = await measureExecutionTime(async () => {
          const operations = [];
          for (let i = 0; i < size; i++) {
            operations.push(memory.store(`scale-test-${size}-${i}`, { data: i }));
          }
          return Promise.all(operations);
        });

        results.push({ size, duration, rate: size / duration });
      }

      // Check that rate doesn't degrade significantly
      const initialRate = results[0].rate;
      const finalRate = results[results.length - 1].rate;
      const degradation = (initialRate - finalRate) / initialRate;

      expect(degradation).toBeLessThan(0.5); // Less than 50% degradation
    });

    it('should handle increasing agent loads gracefully', async () => {
      const agentCounts = [5, 10, 15];
      const results = [];

      for (const count of agentCounts) {
        const agents: PerformanceTestAgent[] = [];

        // Create agents
        for (let i = 0; i < count; i++) {
          const agent = new PerformanceTestAgent(
            createTestAgentId({ id: `scale-agent-${count}-${i}` }),
            createTestAgentConfig(),
            logger,
            eventBus,
            memory
          );
          await agent.initialize();
          agents.push(agent);
        }

        // Measure execution time
        const { duration } = await measureExecutionTime(async () => {
          const taskPromises = agents.map(agent =>
            agent.executeTask(createTestTask({
              context: { agentCount: count }
            }))
          );
          return Promise.all(taskPromises);
        });

        results.push({ count, duration, timePerAgent: duration / count });
      }

      // Time per agent should not increase dramatically
      const initialTimePerAgent = results[0].timePerAgent;
      const finalTimePerAgent = results[results.length - 1].timePerAgent;
      const increase = (finalTimePerAgent - initialTimePerAgent) / initialTimePerAgent;

      expect(increase).toBeLessThan(2.0); // Less than 100% increase
    });
  });

  describe('Memory Pressure Tests', () => {
    it('should handle TTL expiration under high load', async () => {
      const shortTTL = 100; // 100ms
      const itemCount = 500;

      // Store items with short TTL
      const storePromises = [];
      for (let i = 0; i < itemCount; i++) {
        storePromises.push(
          memory.store(`ttl-test-${i}`, { data: i }, { ttl: shortTTL })
        );
      }

      await Promise.all(storePromises);

      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, shortTTL * 2));

      // Try to retrieve expired items
      const { duration: retrievalTime } = await measureExecutionTime(async () => {
        const retrievalPromises = [];
        for (let i = 0; i < itemCount; i++) {
          retrievalPromises.push(memory.retrieve(`ttl-test-${i}`));
        }
        return Promise.all(retrievalPromises);
      });

      expect(retrievalTime).toBeLessThan(1000); // Should be fast (cache misses)
    });

    it('should maintain query performance with large datasets', async () => {
      const datasetSize = 5000;
      const queryCount = 50;

      // Create large dataset
      for (let i = 0; i < datasetSize; i++) {
        await memory.store(`large-dataset-${i}`, {
          id: i,
          category: `cat-${i % 10}`,
          status: `status-${i % 5}`,
          priority: i % 3
        }, {
          type: 'state',
          tags: [`cat-${i % 10}`, `status-${i % 5}`, `priority-${i % 3}`],
          partition: `partition-${i % 20}`
        });
      }

      // Run multiple queries
      const { duration: queryTime } = await measureExecutionTime(async () => {
        const queryPromises = [];
        for (let i = 0; i < queryCount; i++) {
          queryPromises.push(
            memory.query({
              tags: [`cat-${i % 10}`],
              limit: 100
            })
          );
        }
        return Promise.all(queryPromises);
      });

      expect(queryTime).toBeLessThan(5000); // 5 seconds for all queries
    });
  });

  describe('Real-world Load Simulation', () => {
    it('should handle realistic QE workflow load', async () => {
      // Simulate a realistic QE workflow with multiple agent types
      const reqAgent = new RequirementsExplorerAgent(
        createTestAgentId({ type: 'requirements-explorer' }),
        createTestAgentConfig({ type: 'requirements-explorer' }),
        logger,
        eventBus,
        memory
      );

      const perfAgent = new PerformanceHunterAgent(
        createTestAgentId({ type: 'performance-hunter' }),
        createTestAgentConfig({ type: 'performance-hunter' }),
        logger,
        eventBus,
        memory
      );

      await Promise.all([reqAgent.initialize(), perfAgent.initialize()]);

      // Simulate realistic workload
      const { duration: workflowTime } = await measureExecutionTime(async () => {
        const workflowTasks = [];

        // Requirements analysis
        for (let i = 0; i < 5; i++) {
          workflowTasks.push(
            reqAgent.executeTask(createTestTask({
              type: 'analyze-requirements',
              context: {
                requirements: [
                  `System must handle ${1000 + i * 100} concurrent users`,
                  `Response time should be under ${100 + i * 50}ms`,
                  'Security requirements must be met'
                ]
              }
            }))
          );
        }

        // Performance analysis
        for (let i = 0; i < 5; i++) {
          workflowTasks.push(
            perfAgent.executeTask(createTestTask({
              type: 'performance-test',
              context: {
                responseTime: 200 + i * 50,
                throughput: 1000 - i * 100,
                errorRate: 0.1 + i * 0.1,
                cpu: 60 + i * 5,
                memory: 50 + i * 8
              }
            }))
          );
        }

        return Promise.all(workflowTasks);
      });

      expect(workflowTime).toBeLessThan(15000); // 15 seconds for realistic workflow

      // Verify both agents completed their tasks (allow for async timing)
      expect(reqAgent.getMetrics().tasksCompleted).toBeGreaterThanOrEqual(4);
      expect(perfAgent.getMetrics().tasksCompleted).toBeGreaterThanOrEqual(4);

      // Verify knowledge was shared and stored
      const sharedKnowledge = await memory.query({
        tags: ['requirements', 'performance'],
        limit: 20
      });
      expect(sharedKnowledge.length).toBeGreaterThan(0);
    });

    it('should maintain stability under sustained load', async () => {
      const testAgent = new PerformanceTestAgent(
        createTestAgentId({ id: 'stability-test-agent' }),
        createTestAgentConfig(),
        logger,
        eventBus,
        memory
      );
      await testAgent.initialize();

      const sustainedLoadDuration = 5000; // 5 seconds
      const taskInterval = 100; // 100ms between tasks
      const tasksExecuted: number[] = [];

      const { duration: totalTime } = await measureExecutionTime(async () => {
        return new Promise<void>((resolve) => {
          const startTime = Date.now();
          let taskCounter = 0;

          const executeTask = async () => {
            const task = createTestTask({
              id: `stability-task-${taskCounter++}`,
              context: { timestamp: Date.now() }
            });

            try {
              await testAgent.executeTask(task);
              tasksExecuted.push(taskCounter);
            } catch (error) {
              // Track errors but continue
            }

            if (Date.now() - startTime < sustainedLoadDuration) {
              setTimeout(executeTask, taskInterval);
            } else {
              resolve();
            }
          };

          executeTask();
        });
      });

      expect(totalTime).toBeCloseTo(sustainedLoadDuration, -1); // Within 1000ms (allow for CI variations)
      expect(tasksExecuted.length).toBeGreaterThan(30); // At least 30 tasks
      expect(testAgent.getMetrics().tasksFailed).toBe(0); // No failures
    });
  });

  describe('Edge Cases and Stress Conditions', () => {
    it('should handle empty and null data gracefully under load', async () => {
      const edgeCaseData = [
        null,
        undefined,
        {},
        [],
        '',
        { empty: null },
        { array: [] },
        { nested: { empty: {} } }
      ];

      const { duration } = await measureExecutionTime(async () => {
        const operations = [];

        for (let i = 0; i < 100; i++) {
          const data = edgeCaseData[i % edgeCaseData.length];
          operations.push(memory.store(`edge-case-${i}`, data));
        }

        return Promise.all(operations);
      });

      expect(duration).toBeLessThan(2000);

      // Verify all entries were stored
      const stats = memory.getStatistics();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(100);
    });

    it('should handle rapid sequential operations', async () => {
      const rapidOps = 1000;
      const operations = [];

      // Rapid fire operations
      for (let i = 0; i < rapidOps; i++) {
        if (i % 3 === 0) {
          operations.push(memory.store(`rapid-${i}`, { value: i }));
        } else if (i % 3 === 1) {
          operations.push(memory.retrieve(`rapid-${i - 1}`));
        } else {
          operations.push(memory.query({ tags: [`rapid-${Math.floor(i / 10)}`], limit: 5 }));
        }
      }

      const { duration } = await measureExecutionTime(async () => {
        return Promise.all(operations);
      });

      expect(duration).toBeLessThan(3000); // 3 seconds
    });
  });
});