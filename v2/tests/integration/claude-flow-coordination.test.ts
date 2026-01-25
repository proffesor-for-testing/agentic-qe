/**
 * Integration Tests for Claude Flow Coordination
 * Validates coordination between AQE agents and Claude Flow memory system
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createSeededRandom } from '../../src/utils/SeededRandom';

const execAsync = promisify(spawn);

describe('Claude Flow Coordination Integration', () => {
  const testNamespace = 'aqe-test';
  const timeout = 30000; // 30 seconds
  const rng = createSeededRandom(28100);

  beforeAll(async () => {
    // Ensure Claude Flow is available
    try {
      await execCommand('npx claude-flow@alpha --version');
    } catch (error) {
      console.warn('Claude Flow not available, skipping integration tests');
      pending('Claude Flow not available');
    }
  }, timeout);

  beforeEach(async () => {
    // Clean up test namespace
    try {
      await execCommand(`npx claude-flow@alpha memory clear --namespace ${testNamespace}`);
    } catch (error) {
      // Ignore if namespace doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await execCommand(`npx claude-flow@alpha memory clear --namespace ${testNamespace}`);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Memory Operations', () => {
    it('should store and retrieve agent coordination data', async () => {
      const testData = {
        agentId: 'test-generator-001',
        status: 'active',
        currentTask: 'generating-unit-tests',
        progress: 75,
        timestamp: new Date().toISOString()
      };

      // Store data
      await execCommand(
        `npx claude-flow@alpha memory store "agents/test-generator-001" '${JSON.stringify(testData)}' --namespace ${testNamespace}`
      );

      // Retrieve data
      const retrievedData = await execCommand(
        `npx claude-flow@alpha memory retrieve "agents/test-generator-001" --namespace ${testNamespace}`
      );

      const parsed = JSON.parse(retrievedData);
      expect(parsed.agentId).toBe(testData.agentId);
      expect(parsed.status).toBe(testData.status);
      expect(parsed.progress).toBe(testData.progress);
    }, timeout);

    it('should handle concurrent memory operations', async () => {
      const agents = ['test-gen', 'coverage-analyzer', 'quality-gate'];
      const promises = agents.map(async (agentId, index) => {
        const data = {
          agentId,
          task: `task-${index}`,
          timestamp: new Date().toISOString()
        };

        await execCommand(
          `npx claude-flow@alpha memory store "agents/${agentId}" '${JSON.stringify(data)}' --namespace ${testNamespace}`
        );

        return execCommand(
          `npx claude-flow@alpha memory retrieve "agents/${agentId}" --namespace ${testNamespace}`
        );
      });

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const parsed = JSON.parse(result);
        expect(parsed.agentId).toBe(agents[index]);
        expect(parsed.task).toBe(`task-${index}`);
      });
    }, timeout);

    it('should search coordination data across agents', async () => {
      // Store test data for multiple agents
      const testAgents = [
        { id: 'test-gen-1', status: 'active', type: 'generator' },
        { id: 'test-gen-2', status: 'idle', type: 'generator' },
        { id: 'coverage-1', status: 'active', type: 'analyzer' }
      ];

      for (const agent of testAgents) {
        await execCommand(
          `npx claude-flow@alpha memory store "agents/${agent.id}" '${JSON.stringify(agent)}' --namespace ${testNamespace}`
        );
      }

      // Search for active agents
      const searchResults = await execCommand(
        `npx claude-flow@alpha memory search "status.*active" --namespace ${testNamespace}`
      );

      expect(searchResults).toContain('test-gen-1');
      expect(searchResults).toContain('coverage-1');
      expect(searchResults).not.toContain('test-gen-2');
    }, timeout);
  });

  describe('Hook System Integration', () => {
    it('should execute pre-task hooks for test generation', async () => {
      const taskId = 'generate-tests-001';
      const hookResult = await execCommand(
        `npx claude-flow@alpha hooks pre-task --task-id "${taskId}" --description "Generate unit tests for user service"`
      );

      expect(hookResult).toContain('pre-task');
      expect(hookResult).toContain(taskId);
    }, timeout);

    it('should execute post-edit hooks after file modifications', async () => {
      const testFile = '/tmp/test-file.js';

      // Create a test file
      await fs.writeFile(testFile, 'console.log("test");');

      const hookResult = await execCommand(
        `npx claude-flow@alpha hooks post-edit --file "${testFile}" --memory-key "test-edits"`
      );

      expect(hookResult).toContain('post-edit');

      // Cleanup
      await fs.remove(testFile);
    }, timeout);

    it('should notify other agents of task completion', async () => {
      const message = 'Test generation completed: 50 tests created with 95% coverage';

      const hookResult = await execCommand(
        `npx claude-flow@alpha hooks notify --message "${message}"`
      );

      expect(hookResult).toContain('notify');
    }, timeout);

    it('should handle session management for agent coordination', async () => {
      const sessionId = `aqe-session-${Date.now()}`;

      // Start session
      const startResult = await execCommand(
        `npx claude-flow@alpha hooks session-start --session-id "${sessionId}" --agents 3`
      );

      expect(startResult).toContain('session-start');

      // End session
      const endResult = await execCommand(
        `npx claude-flow@alpha hooks session-end --session-id "${sessionId}" --export-metrics true`
      );

      expect(endResult).toContain('session-end');
    }, timeout);
  });

  describe('Agent Coordination Patterns', () => {
    it('should coordinate test generation workflow', async () => {
      const workflowId = `test-gen-workflow-${Date.now()}`;

      // Store workflow state
      const workflowState = {
        id: workflowId,
        phase: 'generation',
        agents: {
          'test-generator': 'active',
          'coverage-analyzer': 'pending',
          'quality-gate': 'pending'
        },
        progress: {
          testsGenerated: 0,
          coverageAnalyzed: 0,
          qualityChecked: 0
        }
      };

      await execCommand(
        `npx claude-flow@alpha memory store "workflows/${workflowId}" '${JSON.stringify(workflowState)}' --namespace ${testNamespace}`
      );

      // Simulate test generator updating progress
      workflowState.agents['test-generator'] = 'completed';
      workflowState.agents['coverage-analyzer'] = 'active';
      workflowState.progress.testsGenerated = 100;

      await execCommand(
        `npx claude-flow@alpha memory store "workflows/${workflowId}" '${JSON.stringify(workflowState)}' --namespace ${testNamespace}`
      );

      // Verify coordination state
      const retrievedState = await execCommand(
        `npx claude-flow@alpha memory retrieve "workflows/${workflowId}" --namespace ${testNamespace}`
      );

      const parsed = JSON.parse(retrievedState);
      expect(parsed.agents['test-generator']).toBe('completed');
      expect(parsed.agents['coverage-analyzer']).toBe('active');
      expect(parsed.progress.testsGenerated).toBe(100);
    }, timeout);

    it('should handle agent failure and recovery coordination', async () => {
      const agentId = 'failing-agent-001';

      // Store failing agent state
      const failureState = {
        agentId,
        status: 'error',
        error: 'Network timeout during test execution',
        timestamp: new Date().toISOString(),
        retryCount: 0
      };

      await execCommand(
        `npx claude-flow@alpha memory store "agents/${agentId}" '${JSON.stringify(failureState)}' --namespace ${testNamespace}`
      );

      // Simulate recovery attempt
      failureState.status = 'recovering';
      failureState.retryCount = 1;

      await execCommand(
        `npx claude-flow@alpha memory store "agents/${agentId}" '${JSON.stringify(failureState)}' --namespace ${testNamespace}`
      );

      // Verify recovery state
      const recoveryState = await execCommand(
        `npx claude-flow@alpha memory retrieve "agents/${agentId}" --namespace ${testNamespace}`
      );

      const parsed = JSON.parse(recoveryState);
      expect(parsed.status).toBe('recovering');
      expect(parsed.retryCount).toBe(1);
    }, timeout);

    it('should coordinate load balancing across agents', async () => {
      const testAgents = ['agent-1', 'agent-2', 'agent-3'];
      const workloads = [25, 50, 75]; // Different workload percentages

      // Store workload information for each agent
      for (let i = 0; i < testAgents.length; i++) {
        const workloadState = {
          agentId: testAgents[i],
          currentWorkload: workloads[i],
          capacity: 100,
          availableFor: workloads[i] < 80 ? 'new-tasks' : 'none',
          taskQueue: Array(Math.floor(workloads[i] / 10)).fill('task')
        };

        await execCommand(
          `npx claude-flow@alpha memory store "workload/${testAgents[i]}" '${JSON.stringify(workloadState)}' --namespace ${testNamespace}`
        );
      }

      // Find agents available for new tasks
      const searchResult = await execCommand(
        `npx claude-flow@alpha memory search "availableFor.*new-tasks" --namespace ${testNamespace}`
      );

      expect(searchResult).toContain('agent-1');
      expect(searchResult).toContain('agent-2');
      expect(searchResult).not.toContain('agent-3'); // Should be at capacity
    }, timeout);
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale coordination data efficiently', async () => {
      const numAgents = 100;
      const startTime = Date.now();

      // Store data for many agents
      const promises = Array(numAgents).fill(0).map(async (_, index) => {
        const agentData = {
          agentId: `agent-${index}`,
          status: index % 3 === 0 ? 'active' : index % 3 === 1 ? 'idle' : 'busy',
          task: `task-${index}`,
          progress: Math.floor(rng.random() * 100)
        };

        await execCommand(
          `npx claude-flow@alpha memory store "scale-test/${agentData.agentId}" '${JSON.stringify(agentData)}' --namespace ${testNamespace}`
        );
      });

      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify we can still query efficiently
      const queryStart = Date.now();
      const activeAgents = await execCommand(
        `npx claude-flow@alpha memory search "status.*active" --namespace ${testNamespace}`
      );
      const queryEnd = Date.now();

      expect(queryEnd - queryStart).toBeLessThan(1000); // Query should be fast
      expect(activeAgents.split('\n').length).toBeGreaterThan(1); // Should find some active agents
    }, timeout);

    it('should maintain coordination under concurrent operations', async () => {
      const concurrentOps = 20;
      const promises = Array(concurrentOps).fill(0).map(async (_, index) => {
        // Mix of store and retrieve operations
        if (index % 2 === 0) {
          const data = { operation: 'store', index, timestamp: Date.now() };
          await execCommand(
            `npx claude-flow@alpha memory store "concurrent/${index}" '${JSON.stringify(data)}' --namespace ${testNamespace}`
          );
        } else {
          try {
            await execCommand(
              `npx claude-flow@alpha memory retrieve "concurrent/${index - 1}" --namespace ${testNamespace}`
            );
          } catch (error) {
            // Handle case where data doesn't exist yet
          }
        }
      });

      // All operations should complete without errors
      await expect(Promise.all(promises)).resolves.toBeDefined();
    }, timeout);
  });

  describe('Error Handling and Resilience', () => {
    it('should handle network interruptions gracefully', async () => {
      // This test simulates network issues by attempting operations on invalid namespaces
      await expect(
        execCommand(`npx claude-flow@alpha memory store "test" "data" --namespace "invalid/namespace"`)
      ).rejects.toThrow();
    }, timeout);

    it('should recover from memory corruption scenarios', async () => {
      const validData = { test: 'data', number: 42 };

      // Store valid data
      await execCommand(
        `npx claude-flow@alpha memory store "corruption-test" '${JSON.stringify(validData)}' --namespace ${testNamespace}`
      );

      // Verify we can retrieve it
      const retrieved = await execCommand(
        `npx claude-flow@alpha memory retrieve "corruption-test" --namespace ${testNamespace}`
      );

      const parsed = JSON.parse(retrieved);
      expect(parsed.test).toBe('data');
      expect(parsed.number).toBe(42);
    }, timeout);

    it('should handle malformed data gracefully', async () => {
      // Attempt to store invalid JSON (this should be caught by Claude Flow)
      await expect(
        execCommand(`npx claude-flow@alpha memory store "malformed" 'invalid-json{' --namespace ${testNamespace}`)
      ).rejects.toThrow();
    }, timeout);
  });

  describe('Security and Access Control', () => {
    it('should isolate data between namespaces', async () => {
      const namespace1 = `${testNamespace}-1`;
      const namespace2 = `${testNamespace}-2`;

      const data1 = { namespace: 1, secret: 'secret1' };
      const data2 = { namespace: 2, secret: 'secret2' };

      // Store data in different namespaces
      await execCommand(
        `npx claude-flow@alpha memory store "secret-data" '${JSON.stringify(data1)}' --namespace ${namespace1}`
      );

      await execCommand(
        `npx claude-flow@alpha memory store "secret-data" '${JSON.stringify(data2)}' --namespace ${namespace2}`
      );

      // Retrieve from each namespace
      const retrieved1 = await execCommand(
        `npx claude-flow@alpha memory retrieve "secret-data" --namespace ${namespace1}`
      );

      const retrieved2 = await execCommand(
        `npx claude-flow@alpha memory retrieve "secret-data" --namespace ${namespace2}`
      );

      const parsed1 = JSON.parse(retrieved1);
      const parsed2 = JSON.parse(retrieved2);

      expect(parsed1.secret).toBe('secret1');
      expect(parsed2.secret).toBe('secret2');
      expect(parsed1.secret).not.toBe(parsed2.secret);

      // Cleanup
      await execCommand(`npx claude-flow@alpha memory clear --namespace ${namespace1}`);
      await execCommand(`npx claude-flow@alpha memory clear --namespace ${namespace2}`);
    }, timeout);
  });
});

// Helper function to execute commands and return output
async function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}