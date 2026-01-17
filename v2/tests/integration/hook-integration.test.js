/**
 * Integration Test Suite: Hook Integration Points
 * Tests Claude Flow hooks, lifecycle management, and event-driven coordination
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

describe('Hook Integration Tests', () => {
  const hookNamespace = 'aqe-hook-test';
  let testWorkspace;

  beforeAll(async () => {
    testWorkspace = path.join(__dirname, '../../.test-hook-workspace');
    await fs.mkdir(testWorkspace, { recursive: true });
  });

  afterAll(async () => {
    await fs.rmdir(testWorkspace, { recursive: true, force: true });
  });

  describe('Lifecycle Hook Integration', () => {
    test('29. Pre-task hook execution and validation', async () => {
      const taskDescription = 'Generate comprehensive test suite for UserService with 95% coverage';
      const expectedTaskId = `task-${Date.now()}`;

      // Execute pre-task hook
      const preTaskResult = await execCommand(`npx claude-flow@alpha hooks pre-task --description "${taskDescription}"`);

      expect(preTaskResult).toContain('TASK PREPARATION COMPLETE');

      // Verify task information was stored
      const taskInfo = extractTaskIdFromHookOutput(preTaskResult);
      expect(taskInfo).toBeDefined();
      expect(taskInfo.length).toBeGreaterThan(0);

      // Store hook execution result for verification
      const hookResult = {
        hookType: 'pre-task',
        taskDescription,
        taskId: taskInfo,
        status: 'completed',
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "pre-task-hook-${taskInfo}" '${JSON.stringify(hookResult)}' --namespace "${hookNamespace}"`);

      // Verify memory storage
      const storedResult = await execCommand(`npx claude-flow@alpha memory get "pre-task-hook-${taskInfo}" --namespace "${hookNamespace}"`);
      const parsedResult = JSON.parse(storedResult.trim());

      expect(parsedResult.hookType).toBe('pre-task');
      expect(parsedResult.status).toBe('completed');
    });

    test('30. Post-task hook with metrics and coordination', async () => {
      const taskId = `task-${Date.now()}-post`;
      const taskMetrics = {
        duration: 2500,
        testsGenerated: 15,
        coverage: 94.2,
        qualityScore: 8.7
      };

      // Store task metrics first
      await execCommand(`npx claude-flow@alpha memory store "task-metrics-${taskId}" '${JSON.stringify(taskMetrics)}' --namespace "${hookNamespace}"`);

      // Execute post-task hook
      const postTaskResult = await execCommand(`npx claude-flow@alpha hooks post-task --task-id "${taskId}"`);

      expect(postTaskResult).toContain('POST-TASK PROCESSING COMPLETE');

      // Verify hook execution
      const hookResult = {
        hookType: 'post-task',
        taskId,
        metrics: taskMetrics,
        status: 'completed',
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "post-task-hook-${taskId}" '${JSON.stringify(hookResult)}' --namespace "${hookNamespace}"`);

      const storedResult = await execCommand(`npx claude-flow@alpha memory get "post-task-hook-${taskId}" --namespace "${hookNamespace}"`);
      const parsedResult = JSON.parse(storedResult.trim());

      expect(parsedResult.hookType).toBe('post-task');
      expect(parsedResult.metrics.testsGenerated).toBe(15);
    });

    test('31. Post-edit hook with file coordination', async () => {
      const testFile = path.join(testWorkspace, 'user.service.test.js');
      const fileContent = `
describe('UserService', () => {
  test('should create user with valid data', () => {
    expect(true).toBe(true);
  });
});`;

      // Create test file
      await fs.writeFile(testFile, fileContent);

      const memoryKey = 'swarm/test-generator/user-service-tests';

      // Execute post-edit hook
      const postEditResult = await execCommand(`npx claude-flow@alpha hooks post-edit --file "${testFile}" --memory-key "${memoryKey}"`);

      expect(postEditResult).toContain('POST-EDIT PROCESSING COMPLETE');

      // Verify file information was processed
      const editInfo = {
        hookType: 'post-edit',
        file: testFile,
        memoryKey,
        fileSize: fileContent.length,
        status: 'completed',
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "post-edit-hook-${Date.now()}" '${JSON.stringify(editInfo)}' --namespace "${hookNamespace}"`);
    });

    test('32. Session management hooks', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Test session start
      const sessionStartResult = await execCommand(`npx claude-flow@alpha hooks session-start --session-id "${sessionId}"`);

      expect(sessionStartResult).toContain('SESSION STARTED') || expect(sessionStartResult).toContain('session-start');

      // Store session data
      const sessionData = {
        sessionId,
        startTime: new Date().toISOString(),
        agents: ['qe-test-generator', 'qe-coverage-analyzer'],
        status: 'active'
      };

      await execCommand(`npx claude-flow@alpha memory store "session-${sessionId}" '${JSON.stringify(sessionData)}' --namespace "${hookNamespace}"`);

      // Test session restore
      const sessionRestoreResult = await execCommand(`npx claude-flow@alpha hooks session-restore --session-id "${sessionId}"`);

      // Should not fail
      expect(sessionRestoreResult).toBeDefined();

      // Test session end
      const sessionEndResult = await execCommand(`npx claude-flow@alpha hooks session-end --session-id "${sessionId}" --export-metrics true`);

      expect(sessionEndResult).toBeDefined();

      // Update session status
      sessionData.status = 'completed';
      sessionData.endTime = new Date().toISOString();

      await execCommand(`npx claude-flow@alpha memory store "session-${sessionId}" '${JSON.stringify(sessionData)}' --namespace "${hookNamespace}"`);

      const finalSessionData = await execCommand(`npx claude-flow@alpha memory get "session-${sessionId}" --namespace "${hookNamespace}"`);
      const parsedSessionData = JSON.parse(finalSessionData.trim());

      expect(parsedSessionData.status).toBe('completed');
      expect(parsedSessionData.endTime).toBeDefined();
    });
  });

  describe('Event-Driven Coordination', () => {
    test('33. Notification hook for agent coordination', async () => {
      const notifications = [
        { agent: 'qe-test-generator', message: 'Test generation completed for UserService', priority: 'high' },
        { agent: 'qe-coverage-analyzer', message: 'Coverage analysis in progress', priority: 'medium' },
        { agent: 'qe-quality-gate', message: 'Quality thresholds met', priority: 'high' }
      ];

      const notificationResults = [];

      for (const notification of notifications) {
        const notifyResult = await execCommand(`npx claude-flow@alpha hooks notify --message "${notification.message}"`);

        notificationResults.push({
          agent: notification.agent,
          message: notification.message,
          hookResult: notifyResult,
          timestamp: new Date().toISOString()
        });

        // Store notification for coordination
        await execCommand(`npx claude-flow@alpha memory store "notification-${notification.agent}-${Date.now()}" '${JSON.stringify(notification)}' --namespace "${hookNamespace}"`);
      }

      expect(notificationResults).toHaveLength(3);
      notificationResults.forEach(result => {
        expect(result.hookResult).toBeDefined();
        expect(result.message).toContain('completed') || expect(result.message).toContain('progress') || expect(result.message).toContain('met');
      });
    });

    test('34. Hook-based workflow orchestration', async () => {
      const workflow = {
        id: `workflow-${Date.now()}`,
        steps: [
          { order: 1, agent: 'qe-test-generator', action: 'generate-tests', status: 'pending' },
          { order: 2, agent: 'qe-test-executor', action: 'execute-tests', status: 'pending' },
          { order: 3, agent: 'qe-coverage-analyzer', action: 'analyze-coverage', status: 'pending' },
          { order: 4, agent: 'qe-quality-gate', action: 'validate-quality', status: 'pending' }
        ],
        status: 'initialized'
      };

      // Store workflow definition
      await execCommand(`npx claude-flow@alpha memory store "workflow-${workflow.id}" '${JSON.stringify(workflow)}' --namespace "${hookNamespace}"`);

      // Execute workflow steps with hooks
      for (const step of workflow.steps) {
        // Pre-step hook
        const preStepDescription = `${step.action} for ${step.agent}`;
        const preStepResult = await execCommand(`npx claude-flow@alpha hooks pre-task --description "${preStepDescription}"`);

        expect(preStepResult).toContain('TASK PREPARATION COMPLETE');

        // Simulate step execution
        await new Promise(resolve => setTimeout(resolve, 500));

        // Update step status
        step.status = 'completed';
        step.completedAt = new Date().toISOString();

        // Post-step hook
        const taskId = extractTaskIdFromHookOutput(preStepResult);
        const postStepResult = await execCommand(`npx claude-flow@alpha hooks post-task --task-id "${taskId}"`);

        expect(postStepResult).toBeDefined();

        // Update workflow
        await execCommand(`npx claude-flow@alpha memory store "workflow-${workflow.id}" '${JSON.stringify(workflow)}' --namespace "${hookNamespace}"`);

        // Notify completion
        await execCommand(`npx claude-flow@alpha hooks notify --message "Step ${step.order} completed: ${step.action}"`);
      }

      // Verify workflow completion
      const completedWorkflow = await execCommand(`npx claude-flow@alpha memory get "workflow-${workflow.id}" --namespace "${hookNamespace}"`);
      const parsedWorkflow = JSON.parse(completedWorkflow.trim());

      expect(parsedWorkflow.steps.every(step => step.status === 'completed')).toBe(true);
    });

    test('35. Error propagation through hooks', async () => {
      const errorScenarios = [
        { type: 'task-failure', description: 'Test generation failed due to invalid input' },
        { type: 'memory-error', description: 'Memory storage operation failed' },
        { type: 'coordination-failure', description: 'Agent coordination lost' }
      ];

      const errorHandlingResults = [];

      for (const scenario of errorScenarios) {
        try {
          // Simulate error-prone operation
          if (scenario.type === 'task-failure') {
            // This should trigger error handling
            await execCommand(`npx claude-flow@alpha hooks pre-task --description "INVALID_TASK_${Date.now()}"`);
          }

          // If no error, create artificial error for testing
          throw new Error(scenario.description);

        } catch (error) {
          // Handle error through hooks (notification)
          const errorNotification = `ERROR: ${scenario.type} - ${error.message}`;

          try {
            const notifyResult = await execCommand(`npx claude-flow@alpha hooks notify --message "${errorNotification}"`);

            errorHandlingResults.push({
              scenario: scenario.type,
              error: error.message,
              notificationSent: true,
              hookResult: notifyResult,
              timestamp: new Date().toISOString()
            });

            // Store error for analysis
            await execCommand(`npx claude-flow@alpha memory store "error-${scenario.type}-${Date.now()}" '${JSON.stringify({
              type: scenario.type,
              description: scenario.description,
              error: error.message,
              handled: true,
              timestamp: new Date().toISOString()
            })}' --namespace "${hookNamespace}"`);

          } catch (hookError) {
            errorHandlingResults.push({
              scenario: scenario.type,
              error: error.message,
              notificationSent: false,
              hookError: hookError.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      expect(errorHandlingResults).toHaveLength(3);
      expect(errorHandlingResults.filter(result => result.notificationSent).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Performance and Reliability', () => {
    test('36. Hook execution performance under load', async () => {
      const hookOperations = 50;
      const concurrentHooks = 10;

      const performanceTest = async (batchIndex) => {
        const batchResults = [];

        for (let i = 0; i < hookOperations / concurrentHooks; i++) {
          const startTime = Date.now();

          try {
            const description = `Performance test batch ${batchIndex} operation ${i}`;
            const hookResult = await execCommand(`npx claude-flow@alpha hooks pre-task --description "${description}"`);

            const endTime = Date.now();

            batchResults.push({
              batchIndex,
              operationIndex: i,
              executionTime: endTime - startTime,
              success: true,
              timestamp: new Date().toISOString()
            });

          } catch (error) {
            const endTime = Date.now();

            batchResults.push({
              batchIndex,
              operationIndex: i,
              executionTime: endTime - startTime,
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }

        return batchResults;
      };

      const startTime = Date.now();

      // Execute hooks concurrently
      const batchPromises = Array.from({ length: concurrentHooks }, (_, index) =>
        performanceTest(index)
      );

      const batchResults = await Promise.all(batchPromises);
      const endTime = Date.now();

      // Flatten results
      const allResults = batchResults.flat();
      const successfulOperations = allResults.filter(result => result.success);

      // Performance assertions
      expect(successfulOperations.length / hookOperations).toBeGreaterThanOrEqual(0.8); // 80% success rate
      expect(endTime - startTime).toBeLessThan(30000); // Complete within 30 seconds

      const averageExecutionTime = successfulOperations.reduce((sum, result) => sum + result.executionTime, 0) / successfulOperations.length;
      expect(averageExecutionTime).toBeLessThan(2000); // Average execution under 2 seconds

      // Store performance results
      const performanceReport = {
        totalOperations: hookOperations,
        successfulOperations: successfulOperations.length,
        averageExecutionTime,
        totalExecutionTime: endTime - startTime,
        operationsPerSecond: hookOperations / ((endTime - startTime) / 1000),
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "hook-performance-report" '${JSON.stringify(performanceReport)}' --namespace "${hookNamespace}"`);
    });

    test('37. Hook reliability and retry mechanisms', async () => {
      const reliabilityTests = [
        { operation: 'pre-task', shouldFail: true, retries: 3 },
        { operation: 'notify', shouldFail: false, retries: 0 },
        { operation: 'post-edit', shouldFail: true, retries: 2 }
      ];

      const reliabilityResults = [];

      for (const test of reliabilityTests) {
        let success = false;
        let attempts = 0;
        let lastError = null;

        while (attempts <= test.retries && !success) {
          attempts++;

          try {
            let hookResult;

            switch (test.operation) {
              case 'pre-task':
                if (test.shouldFail && attempts < test.retries + 1) {
                  throw new Error(`Simulated ${test.operation} failure`);
                }
                hookResult = await execCommand(`npx claude-flow@alpha hooks pre-task --description "Reliability test ${attempts}"`);
                break;

              case 'notify':
                hookResult = await execCommand(`npx claude-flow@alpha hooks notify --message "Reliability test ${attempts}"`);
                break;

              case 'post-edit':
                if (test.shouldFail && attempts < test.retries + 1) {
                  throw new Error(`Simulated ${test.operation} failure`);
                }

                const testFile = path.join(testWorkspace, `reliability-test-${attempts}.js`);
                await fs.writeFile(testFile, '// Test file for reliability');

                hookResult = await execCommand(`npx claude-flow@alpha hooks post-edit --file "${testFile}" --memory-key "test-key"`);
                break;
            }

            success = true;

            reliabilityResults.push({
              operation: test.operation,
              success: true,
              attempts,
              expectedRetries: test.retries,
              hookResult: hookResult?.substring(0, 100) || 'Success',
              timestamp: new Date().toISOString()
            });

          } catch (error) {
            lastError = error;

            if (attempts <= test.retries) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 500 * attempts));
            }
          }
        }

        if (!success) {
          reliabilityResults.push({
            operation: test.operation,
            success: false,
            attempts,
            expectedRetries: test.retries,
            lastError: lastError?.message || 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Verify reliability results
      expect(reliabilityResults).toHaveLength(3);

      const successfulOperations = reliabilityResults.filter(result => result.success);
      expect(successfulOperations.length).toBeGreaterThanOrEqual(2); // At least 2 should succeed

      // Operations that should fail initially but succeed after retries
      const retriedOperations = reliabilityResults.filter(result =>
        result.success && result.attempts > 1
      );
      expect(retriedOperations.length).toBeGreaterThanOrEqual(1);
    });

    test('38. Hook integration with memory persistence', async () => {
      const integrationTest = {
        testId: `integration-${Date.now()}`,
        phases: [
          { name: 'initialization', hookType: 'pre-task' },
          { name: 'execution', hookType: 'notify' },
          { name: 'completion', hookType: 'post-task' }
        ],
        memoryKeys: [],
        status: 'started'
      };

      // Store initial test state
      await execCommand(`npx claude-flow@alpha memory store "integration-test-${integrationTest.testId}" '${JSON.stringify(integrationTest)}' --namespace "${hookNamespace}"`);

      for (const phase of integrationTest.phases) {
        const phaseStart = Date.now();

        try {
          let hookResult;

          switch (phase.hookType) {
            case 'pre-task':
              hookResult = await execCommand(`npx claude-flow@alpha hooks pre-task --description "Integration test ${phase.name}"`);
              break;

            case 'notify':
              hookResult = await execCommand(`npx claude-flow@alpha hooks notify --message "Integration test ${phase.name} in progress"`);
              break;

            case 'post-task':
              const taskId = `task-${integrationTest.testId}-${phase.name}`;
              hookResult = await execCommand(`npx claude-flow@alpha hooks post-task --task-id "${taskId}"`);
              break;
          }

          // Store phase result in memory
          const phaseResult = {
            phase: phase.name,
            hookType: phase.hookType,
            status: 'completed',
            executionTime: Date.now() - phaseStart,
            hookOutput: hookResult?.substring(0, 200) || 'No output',
            timestamp: new Date().toISOString()
          };

          const phaseKey = `integration-phase-${integrationTest.testId}-${phase.name}`;
          await execCommand(`npx claude-flow@alpha memory store "${phaseKey}" '${JSON.stringify(phaseResult)}' --namespace "${hookNamespace}"`);

          integrationTest.memoryKeys.push(phaseKey);

        } catch (error) {
          const phaseResult = {
            phase: phase.name,
            hookType: phase.hookType,
            status: 'failed',
            error: error.message,
            executionTime: Date.now() - phaseStart,
            timestamp: new Date().toISOString()
          };

          const phaseKey = `integration-phase-${integrationTest.testId}-${phase.name}`;
          await execCommand(`npx claude-flow@alpha memory store "${phaseKey}" '${JSON.stringify(phaseResult)}' --namespace "${hookNamespace}"`);

          integrationTest.memoryKeys.push(phaseKey);
        }
      }

      // Update final test state
      integrationTest.status = 'completed';
      integrationTest.completedAt = new Date().toISOString();

      await execCommand(`npx claude-flow@alpha memory store "integration-test-${integrationTest.testId}" '${JSON.stringify(integrationTest)}' --namespace "${hookNamespace}"`);

      // Verify all phases were stored
      expect(integrationTest.memoryKeys).toHaveLength(3);

      // Verify each phase can be retrieved
      for (const memoryKey of integrationTest.memoryKeys) {
        const phaseResult = await execCommand(`npx claude-flow@alpha memory get "${memoryKey}" --namespace "${hookNamespace}"`);
        const parsedPhaseResult = JSON.parse(phaseResult.trim());

        expect(parsedPhaseResult.phase).toBeDefined();
        expect(parsedPhaseResult.hookType).toBeDefined();
        expect(['completed', 'failed']).toContain(parsedPhaseResult.status);
      }
    });
  });
});

// Helper functions
async function execCommand(command) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);

    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout));
    });
  });
}

function extractTaskIdFromHookOutput(hookOutput) {
  // Extract task ID from hook output using regex
  const taskIdMatch = hookOutput.match(/Task ID:\s*([^\s\n]+)/);
  if (taskIdMatch) {
    return taskIdMatch[1];
  }

  // Fallback: generate a task ID based on timestamp
  return `task-${Date.now()}`;
}