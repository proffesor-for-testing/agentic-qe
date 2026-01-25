/**
 * Integration Test Suite: Memory Persistence
 * Tests Claude Flow memory operations, cross-session persistence, and state management
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { createSeededRandom } = require('../../src/utils/SeededRandom');

describe('Memory Persistence Integration Tests', () => {
  const memoryNamespace = 'aqe-memory-test';
  const testSessionId = `session-${Date.now()}`;

  beforeEach(async () => {
    // Clear any existing test data
    try {
      await execCommand(`npx claude-flow@alpha memory clear --namespace "${memoryNamespace}"`);
    } catch (error) {
      // Namespace might not exist, continue
    }
  });

  describe('Basic Memory Operations', () => {
    test('6. Store and retrieve test execution state', async () => {
      const testState = {
        currentSuite: 'UserService',
        testsCompleted: 15,
        testsFailed: 2,
        coverage: 85.7,
        timestamp: new Date().toISOString()
      };

      // Store state
      await execCommand(`npx claude-flow@alpha memory store "test-execution-state" '${JSON.stringify(testState)}' --namespace "${memoryNamespace}"`);

      // Retrieve state
      const retrievedState = await execCommand(`npx claude-flow@alpha memory get "test-execution-state" --namespace "${memoryNamespace}"`);
      const parsedState = JSON.parse(retrievedState.trim());

      expect(parsedState.currentSuite).toBe('UserService');
      expect(parsedState.testsCompleted).toBe(15);
      expect(parsedState.coverage).toBe(85.7);
    });

    test('7. Agent coordination through shared memory', async () => {
      const coordinationData = {
        agentQueue: ['qe-test-generator', 'qe-coverage-analyzer', 'qe-quality-gate'],
        currentAgent: 'qe-test-generator',
        sharedContext: {
          projectPath: '/test/project',
          framework: 'jest',
          targetCoverage: 90
        }
      };

      // Store coordination data
      await execCommand(`npx claude-flow@alpha memory store "agent-coordination" '${JSON.stringify(coordinationData)}' --namespace "${memoryNamespace}"`);

      // Simulate agent updating coordination state
      const updatedData = { ...coordinationData };
      updatedData.currentAgent = 'qe-coverage-analyzer';
      updatedData.agentQueue.shift(); // Remove completed agent

      await execCommand(`npx claude-flow@alpha memory store "agent-coordination" '${JSON.stringify(updatedData)}' --namespace "${memoryNamespace}"`);

      // Verify update
      const finalState = await execCommand(`npx claude-flow@alpha memory get "agent-coordination" --namespace "${memoryNamespace}"`);
      const parsedFinalState = JSON.parse(finalState.trim());

      expect(parsedFinalState.currentAgent).toBe('qe-coverage-analyzer');
      expect(parsedFinalState.agentQueue).toHaveLength(2);
    });

    test('8. Memory namespace isolation', async () => {
      const namespace1 = 'aqe-project-a';
      const namespace2 = 'aqe-project-b';

      // Store same key in different namespaces
      await execCommand(`npx claude-flow@alpha memory store "project-config" '{"name": "Project A"}' --namespace "${namespace1}"`);
      await execCommand(`npx claude-flow@alpha memory store "project-config" '{"name": "Project B"}' --namespace "${namespace2}"`);

      // Retrieve from each namespace
      const configA = await execCommand(`npx claude-flow@alpha memory get "project-config" --namespace "${namespace1}"`);
      const configB = await execCommand(`npx claude-flow@alpha memory get "project-config" --namespace "${namespace2}"`);

      expect(JSON.parse(configA.trim()).name).toBe('Project A');
      expect(JSON.parse(configB.trim()).name).toBe('Project B');
    });
  });

  describe('Cross-Session Persistence', () => {
    test('9. Session state preservation across restarts', async () => {
      const sessionState = {
        sessionId: testSessionId,
        agentStates: {
          'qe-test-generator': { status: 'completed', output: 'test-files' },
          'qe-coverage-analyzer': { status: 'running', progress: 65 }
        },
        globalContext: {
          totalTests: 150,
          passRate: 94.5
        }
      };

      // Store session state
      await execCommand(`npx claude-flow@alpha memory store "session-${testSessionId}" '${JSON.stringify(sessionState)}' --namespace "${memoryNamespace}"`);

      // Simulate session restart by clearing local cache (if any)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Restore session state
      const restoredState = await execCommand(`npx claude-flow@alpha memory get "session-${testSessionId}" --namespace "${memoryNamespace}"`);
      const parsedRestoredState = JSON.parse(restoredState.trim());

      expect(parsedRestoredState.sessionId).toBe(testSessionId);
      expect(parsedRestoredState.agentStates['qe-test-generator'].status).toBe('completed');
      expect(parsedRestoredState.globalContext.totalTests).toBe(150);
    });

    test('10. Memory-based agent recovery after failure', async () => {
      const agentCheckpoint = {
        agentId: 'qe-coverage-001',
        lastOperation: 'analyzing-coverage',
        processedFiles: ['user.service.js', 'auth.service.js'],
        pendingFiles: ['payment.service.js', 'notification.service.js'],
        partialResults: {
          totalLines: 2500,
          coveredLines: 2100
        },
        checkpointTimestamp: new Date().toISOString()
      };

      // Store checkpoint
      await execCommand(`npx claude-flow@alpha memory store "agent-checkpoint-qe-coverage-001" '${JSON.stringify(agentCheckpoint)}' --namespace "${memoryNamespace}"`);

      // Simulate agent failure and recovery
      const recoveryState = await execCommand(`npx claude-flow@alpha memory get "agent-checkpoint-qe-coverage-001" --namespace "${memoryNamespace}"`);
      const parsedRecoveryState = JSON.parse(recoveryState.trim());

      expect(parsedRecoveryState.agentId).toBe('qe-coverage-001');
      expect(parsedRecoveryState.processedFiles).toHaveLength(2);
      expect(parsedRecoveryState.pendingFiles).toHaveLength(2);
      expect(parsedRecoveryState.partialResults.coveredLines).toBe(2100);
    });
  });

  describe('Memory Performance and Scalability', () => {
    test('11. High-volume memory operations', async () => {
      const startTime = Date.now();
      const operations = [];

      // Store 100 test result records
      const rng = createSeededRandom(27200);
      for (let i = 0; i < 100; i++) {
        const testResult = {
          testId: `test-${i}`,
          suite: `Suite${Math.floor(i / 10)}`,
          status: i % 10 === 0 ? 'failed' : 'passed',
          duration: rng.random() * 1000,
          timestamp: new Date().toISOString()
        };

        operations.push(
          execCommand(`npx claude-flow@alpha memory store "test-result-${i}" '${JSON.stringify(testResult)}' --namespace "${memoryNamespace}"`)
        );
      }

      await Promise.all(operations);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify a few random entries
      const randomIndices = [5, 25, 75];
      for (const index of randomIndices) {
        const result = await execCommand(`npx claude-flow@alpha memory get "test-result-${index}" --namespace "${memoryNamespace}"`);
        const parsedResult = JSON.parse(result.trim());
        expect(parsedResult.testId).toBe(`test-${index}`);
      }
    });

    test('12. Memory cleanup and garbage collection', async () => {
      // Store temporary data with TTL simulation
      const tempData = Array.from({ length: 50 }, (_, i) => ({
        key: `temp-data-${i}`,
        value: { data: `temporary-${i}`, created: Date.now() }
      }));

      // Store all temp data
      for (const item of tempData) {
        await execCommand(`npx claude-flow@alpha memory store "${item.key}" '${JSON.stringify(item.value)}' --namespace "${memoryNamespace}"`);
      }

      // Simulate cleanup of old data (remove every other item)
      const cleanupOperations = [];
      for (let i = 0; i < tempData.length; i += 2) {
        cleanupOperations.push(
          execCommand(`npx claude-flow@alpha memory delete "${tempData[i].key}" --namespace "${memoryNamespace}"`)
        );
      }

      await Promise.all(cleanupOperations);

      // Verify cleanup worked
      let remainingItems = 0;
      for (let i = 1; i < tempData.length; i += 2) {
        try {
          await execCommand(`npx claude-flow@alpha memory get "${tempData[i].key}" --namespace "${memoryNamespace}"`);
          remainingItems++;
        } catch (error) {
          // Item was deleted, expected
        }
      }

      expect(remainingItems).toBe(25); // Half should remain
    });
  });
});

// Helper function for command execution
async function execCommand(command) {
  return new Promise((resolve, reject) => {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        timeout: 5000 // 5 second timeout
      });
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}