/**
 * n8n Workflow Executor Agent Test
 *
 * This test validates the N8nWorkflowExecutorAgent capabilities using
 * mock n8n API responses. It demonstrates how the agent would work
 * against a real n8n instance.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock n8n API responses
const mockWorkflow = {
  id: 'wf-test-001',
  name: 'Slack to Jira Integration',
  active: true,
  nodes: [
    {
      id: 'node-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        path: 'slack-events',
        httpMethod: 'POST'
      },
      webhookId: 'test-webhook-123'
    },
    {
      id: 'node-2',
      name: 'Set Data',
      type: 'n8n-nodes-base.set',
      typeVersion: 1,
      position: [450, 300],
      parameters: {
        values: {
          string: [
            { name: 'title', value: '={{ $json.text }}' },
            { name: 'priority', value: '={{ $json.priority || "medium" }}' }
          ]
        }
      }
    },
    {
      id: 'node-3',
      name: 'Check Priority',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [650, 300],
      parameters: {
        conditions: {
          string: [
            {
              value1: '={{ $json.priority }}',
              operation: 'equals',
              value2: 'high'
            }
          ]
        }
      }
    },
    {
      id: 'node-4',
      name: 'Create Jira Issue',
      type: 'n8n-nodes-base.jira',
      typeVersion: 1,
      position: [850, 200],
      parameters: {
        resource: 'issue',
        operation: 'create',
        project: 'TEST',
        issueType: 'Bug',
        summary: '={{ $json.title }}'
      },
      credentials: {
        jiraApi: { id: 'cred-jira-1', name: 'Jira Cloud' }
      }
    },
    {
      id: 'node-5',
      name: 'Send Slack Notification',
      type: 'n8n-nodes-base.slack',
      typeVersion: 1,
      position: [1050, 200],
      parameters: {
        resource: 'message',
        operation: 'post',
        channel: '#alerts',
        text: '={{ "Issue created: " + $json.issueKey }}'
      },
      credentials: {
        slackApi: { id: 'cred-slack-1', name: 'Slack Bot' }
      }
    }
  ],
  connections: {
    'Webhook': {
      main: [[{ node: 'Set Data', type: 'main', index: 0 }]]
    },
    'Set Data': {
      main: [[{ node: 'Check Priority', type: 'main', index: 0 }]]
    },
    'Check Priority': {
      main: [
        [{ node: 'Create Jira Issue', type: 'main', index: 0 }], // true branch
        [] // false branch - no action
      ]
    },
    'Create Jira Issue': {
      main: [[{ node: 'Send Slack Notification', type: 'main', index: 0 }]]
    }
  },
  settings: {
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    saveManualExecutions: true
  },
  createdAt: '2025-12-15T10:00:00.000Z',
  updatedAt: '2025-12-15T11:00:00.000Z'
};

const mockExecution = {
  id: 'exec-001',
  finished: true,
  mode: 'manual',
  startedAt: '2025-12-15T12:00:00.000Z',
  stoppedAt: '2025-12-15T12:00:02.300Z',
  workflowId: 'wf-test-001',
  status: 'success',
  data: {
    resultData: {
      runData: {
        'Webhook': [{
          startTime: 1734264000000,
          executionTime: 45,
          executionStatus: 'success',
          data: {
            main: [[{
              json: {
                text: 'Deploy failed on production',
                priority: 'high',
                channel: '#deployments'
              }
            }]]
          },
          source: []
        }],
        'Set Data': [{
          startTime: 1734264000045,
          executionTime: 12,
          executionStatus: 'success',
          data: {
            main: [[{
              json: {
                title: 'Deploy failed on production',
                priority: 'high'
              }
            }]]
          },
          source: [{ previousNode: 'Webhook' }]
        }],
        'Check Priority': [{
          startTime: 1734264000057,
          executionTime: 8,
          executionStatus: 'success',
          data: {
            main: [[{
              json: {
                title: 'Deploy failed on production',
                priority: 'high'
              }
            }]]
          },
          source: [{ previousNode: 'Set Data' }]
        }],
        'Create Jira Issue': [{
          startTime: 1734264000065,
          executionTime: 1800,
          executionStatus: 'success',
          data: {
            main: [[{
              json: {
                issueKey: 'TEST-123',
                issueId: '10001',
                self: 'https://example.atlassian.net/rest/api/2/issue/10001'
              }
            }]]
          },
          source: [{ previousNode: 'Check Priority', previousNodeOutput: 0 }]
        }],
        'Send Slack Notification': [{
          startTime: 1734264001865,
          executionTime: 420,
          executionStatus: 'success',
          data: {
            main: [[{
              json: {
                ok: true,
                channel: 'C123456',
                ts: '1734264002.000100'
              }
            }]]
          },
          source: [{ previousNode: 'Create Jira Issue' }]
        }]
      },
      lastNodeExecuted: 'Send Slack Notification'
    }
  }
};

// N8n Workflow Executor Agent Implementation
class N8nWorkflowExecutorAgent {
  private baseUrl: string;
  private apiKey: string;
  private workflowCache: Map<string, any> = new Map();

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async getWorkflow(workflowId: string): Promise<any> {
    if (this.workflowCache.has(workflowId)) {
      return this.workflowCache.get(workflowId);
    }

    // In real implementation, this would call the n8n API
    // const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
    //   headers: { 'X-N8N-API-KEY': this.apiKey }
    // });
    // return response.json();

    // Mock response
    if (workflowId === 'wf-test-001') {
      this.workflowCache.set(workflowId, mockWorkflow);
      return mockWorkflow;
    }
    throw new Error(`Workflow ${workflowId} not found`);
  }

  async executeWorkflow(workflowId: string, inputData?: any): Promise<any> {
    const workflow = await this.getWorkflow(workflowId);

    // In real implementation:
    // const response = await fetch(`${this.baseUrl}/api/v1/workflows/${workflowId}/execute`, {
    //   method: 'POST',
    //   headers: {
    //     'X-N8N-API-KEY': this.apiKey,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({ data: inputData })
    // });

    // Mock execution
    return {
      executionId: mockExecution.id,
      status: 'running'
    };
  }

  async getExecution(executionId: string): Promise<any> {
    // In real implementation:
    // const response = await fetch(`${this.baseUrl}/api/v1/executions/${executionId}`, {
    //   headers: { 'X-N8N-API-KEY': this.apiKey }
    // });

    // Mock response
    if (executionId === 'exec-001') {
      return mockExecution;
    }
    throw new Error(`Execution ${executionId} not found`);
  }

  async waitForCompletion(executionId: string, timeout: number = 30000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await this.getExecution(executionId);

      if (execution.finished || execution.stoppedAt) {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Execution ${executionId} timed out after ${timeout}ms`);
  }

  analyzeExecution(execution: any): ExecutionAnalysis {
    const nodes = execution.data?.resultData?.runData || {};
    const nodeResults: NodeResult[] = [];

    for (const [nodeName, runs] of Object.entries(nodes)) {
      const runsArray = runs as any[];
      nodeResults.push({
        nodeName,
        runs: runsArray.length,
        success: runsArray.every((run: any) => run.executionStatus === 'success'),
        executionTime: runsArray.reduce((sum: number, run: any) => sum + (run.executionTime || 0), 0),
        outputData: runsArray[0]?.data?.main?.[0]?.[0]?.json
      });
    }

    const totalTime = nodeResults.reduce((sum, n) => sum + n.executionTime, 0);

    return {
      totalNodes: nodeResults.length,
      successfulNodes: nodeResults.filter(n => n.success).length,
      failedNodes: nodeResults.filter(n => !n.success).length,
      totalExecutionTime: totalTime,
      nodeResults,
      bottleneck: nodeResults.reduce((max, n) =>
        n.executionTime > max.executionTime ? n : max, nodeResults[0])
    };
  }

  validateDataFlow(execution: any): DataFlowValidation {
    const runData = execution.data?.resultData?.runData || {};
    const issues: string[] = [];
    const dataFlow: DataFlowStep[] = [];

    // Get execution order from sources
    const nodeOrder = this.getExecutionOrder(runData);

    for (let i = 0; i < nodeOrder.length; i++) {
      const nodeName = nodeOrder[i];
      const nodeData = runData[nodeName]?.[0];

      if (!nodeData) {
        issues.push(`No data for node: ${nodeName}`);
        continue;
      }

      const outputData = nodeData.data?.main?.[0]?.[0]?.json || {};

      dataFlow.push({
        node: nodeName,
        input: nodeData.source?.[0]?.previousNode || 'trigger',
        output: outputData,
        executionTime: nodeData.executionTime
      });

      // Check for data loss
      if (i > 0 && Object.keys(outputData).length === 0) {
        issues.push(`Possible data loss at node: ${nodeName}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      dataFlow
    };
  }

  private getExecutionOrder(runData: Record<string, any[]>): string[] {
    // Simple ordering based on start times
    return Object.entries(runData)
      .sort((a, b) => (a[1][0]?.startTime || 0) - (b[1][0]?.startTime || 0))
      .map(([name]) => name);
  }

  assertOutputs(execution: any, assertions: Assertion[]): AssertionResult[] {
    const results: AssertionResult[] = [];
    const runData = execution.data?.resultData?.runData || {};

    for (const assertion of assertions) {
      const nodeData = runData[assertion.node]?.[0]?.data?.main?.[0]?.[0]?.json;

      let passed = false;
      let actualValue: any;

      if (nodeData) {
        actualValue = assertion.path
          ? this.getNestedValue(nodeData, assertion.path)
          : nodeData;

        switch (assertion.operator) {
          case 'equals':
            passed = actualValue === assertion.expected;
            break;
          case 'contains':
            passed = String(actualValue).includes(String(assertion.expected));
            break;
          case 'matches':
            passed = new RegExp(assertion.expected).test(String(actualValue));
            break;
          case 'exists':
            passed = actualValue !== undefined && actualValue !== null;
            break;
          case 'type':
            passed = typeof actualValue === assertion.expected;
            break;
        }
      }

      results.push({
        assertion: assertion.description || `${assertion.node}.${assertion.path}`,
        passed,
        expected: assertion.expected,
        actual: actualValue
      });
    }

    return results;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }
}

// Type definitions
interface NodeResult {
  nodeName: string;
  runs: number;
  success: boolean;
  executionTime: number;
  outputData?: any;
}

interface ExecutionAnalysis {
  totalNodes: number;
  successfulNodes: number;
  failedNodes: number;
  totalExecutionTime: number;
  nodeResults: NodeResult[];
  bottleneck: NodeResult;
}

interface DataFlowStep {
  node: string;
  input: string;
  output: any;
  executionTime: number;
}

interface DataFlowValidation {
  valid: boolean;
  issues: string[];
  dataFlow: DataFlowStep[];
}

interface Assertion {
  node: string;
  path?: string;
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'type';
  expected: any;
  description?: string;
}

interface AssertionResult {
  assertion: string;
  passed: boolean;
  expected: any;
  actual: any;
}

// Tests
describe('N8nWorkflowExecutorAgent', () => {
  let agent: N8nWorkflowExecutorAgent;

  beforeAll(() => {
    agent = new N8nWorkflowExecutorAgent({
      baseUrl: 'http://localhost:5678',
      apiKey: 'test-api-key'
    });
  });

  describe('Workflow Retrieval', () => {
    it('should retrieve workflow by ID', async () => {
      const workflow = await agent.getWorkflow('wf-test-001');

      expect(workflow).toBeDefined();
      expect(workflow.id).toBe('wf-test-001');
      expect(workflow.name).toBe('Slack to Jira Integration');
      expect(workflow.nodes).toHaveLength(5);
    });

    it('should cache workflow for subsequent calls', async () => {
      const workflow1 = await agent.getWorkflow('wf-test-001');
      const workflow2 = await agent.getWorkflow('wf-test-001');

      expect(workflow1).toBe(workflow2); // Same reference (cached)
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(agent.getWorkflow('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow and return execution ID', async () => {
      const result = await agent.executeWorkflow('wf-test-001', {
        text: 'Test message',
        priority: 'high'
      });

      expect(result).toBeDefined();
      expect(result.executionId).toBe('exec-001');
      expect(result.status).toBe('running');
    });

    it('should retrieve execution details', async () => {
      const execution = await agent.getExecution('exec-001');

      expect(execution).toBeDefined();
      expect(execution.id).toBe('exec-001');
      expect(execution.finished).toBe(true);
      expect(execution.status).toBe('success');
    });

    it('should wait for execution completion', async () => {
      const execution = await agent.waitForCompletion('exec-001', 5000);

      expect(execution.finished).toBe(true);
      expect(execution.stoppedAt).toBeDefined();
    });
  });

  describe('Execution Analysis', () => {
    it('should analyze execution and provide metrics', async () => {
      const execution = await agent.getExecution('exec-001');
      const analysis = agent.analyzeExecution(execution);

      expect(analysis.totalNodes).toBe(5);
      expect(analysis.successfulNodes).toBe(5);
      expect(analysis.failedNodes).toBe(0);
      expect(analysis.totalExecutionTime).toBeGreaterThan(0);
    });

    it('should identify bottleneck node', async () => {
      const execution = await agent.getExecution('exec-001');
      const analysis = agent.analyzeExecution(execution);

      expect(analysis.bottleneck).toBeDefined();
      expect(analysis.bottleneck.nodeName).toBe('Create Jira Issue');
      expect(analysis.bottleneck.executionTime).toBe(1800); // 1.8 seconds
    });

    it('should provide per-node execution times', async () => {
      const execution = await agent.getExecution('exec-001');
      const analysis = agent.analyzeExecution(execution);

      const webhookNode = analysis.nodeResults.find(n => n.nodeName === 'Webhook');
      expect(webhookNode?.executionTime).toBe(45);

      const jiraNode = analysis.nodeResults.find(n => n.nodeName === 'Create Jira Issue');
      expect(jiraNode?.executionTime).toBe(1800);
    });
  });

  describe('Data Flow Validation', () => {
    it('should validate data flow through nodes', async () => {
      const execution = await agent.getExecution('exec-001');
      const validation = agent.validateDataFlow(execution);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.dataFlow.length).toBe(5);
    });

    it('should track data transformation at each node', async () => {
      const execution = await agent.getExecution('exec-001');
      const validation = agent.validateDataFlow(execution);

      // Webhook output
      const webhookStep = validation.dataFlow.find(s => s.node === 'Webhook');
      expect(webhookStep?.output.text).toBe('Deploy failed on production');

      // Jira output
      const jiraStep = validation.dataFlow.find(s => s.node === 'Create Jira Issue');
      expect(jiraStep?.output.issueKey).toBe('TEST-123');
    });
  });

  describe('Output Assertions', () => {
    it('should validate expected outputs with assertions', async () => {
      const execution = await agent.getExecution('exec-001');

      const assertions: Assertion[] = [
        {
          node: 'Create Jira Issue',
          path: 'issueKey',
          operator: 'matches',
          expected: '^TEST-\\d+$',
          description: 'Jira issue key format'
        },
        {
          node: 'Send Slack Notification',
          path: 'ok',
          operator: 'equals',
          expected: true,
          description: 'Slack message sent successfully'
        },
        {
          node: 'Set Data',
          path: 'priority',
          operator: 'equals',
          expected: 'high',
          description: 'Priority is high'
        }
      ];

      const results = agent.assertOutputs(execution, assertions);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('should detect assertion failures', async () => {
      const execution = await agent.getExecution('exec-001');

      const assertions: Assertion[] = [
        {
          node: 'Set Data',
          path: 'priority',
          operator: 'equals',
          expected: 'low', // Wrong expectation
          description: 'Priority should be low'
        }
      ];

      const results = agent.assertOutputs(execution, assertions);

      expect(results[0].passed).toBe(false);
      expect(results[0].expected).toBe('low');
      expect(results[0].actual).toBe('high');
    });

    it('should check if field exists', async () => {
      const execution = await agent.getExecution('exec-001');

      const assertions: Assertion[] = [
        {
          node: 'Create Jira Issue',
          path: 'issueKey',
          operator: 'exists',
          expected: true,
          description: 'Issue key exists'
        },
        {
          node: 'Create Jira Issue',
          path: 'nonExistentField',
          operator: 'exists',
          expected: true,
          description: 'Non-existent field'
        }
      ];

      const results = agent.assertOutputs(execution, assertions);

      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
    });
  });

  describe('Full Workflow Test', () => {
    it('should execute complete workflow test cycle', async () => {
      // 1. Get workflow
      const workflow = await agent.getWorkflow('wf-test-001');
      expect(workflow.active).toBe(true);

      // 2. Execute workflow
      const { executionId } = await agent.executeWorkflow('wf-test-001', {
        text: 'Deploy failed on production',
        priority: 'high'
      });

      // 3. Wait for completion
      const execution = await agent.waitForCompletion(executionId);
      expect(execution.status).toBe('success');

      // 4. Analyze execution
      const analysis = agent.analyzeExecution(execution);
      expect(analysis.failedNodes).toBe(0);

      // 5. Validate data flow
      const dataFlow = agent.validateDataFlow(execution);
      expect(dataFlow.valid).toBe(true);

      // 6. Assert outputs
      const assertions: Assertion[] = [
        { node: 'Create Jira Issue', path: 'issueKey', operator: 'exists', expected: true },
        { node: 'Send Slack Notification', path: 'ok', operator: 'equals', expected: true }
      ];
      const assertionResults = agent.assertOutputs(execution, assertions);
      expect(assertionResults.every(r => r.passed)).toBe(true);

      // Generate report
      console.log('\n📊 Workflow Execution Report');
      console.log('================================');
      console.log(`Workflow: ${workflow.name}`);
      console.log(`Execution ID: ${execution.id}`);
      console.log(`Status: ${execution.status}`);
      console.log(`Duration: ${analysis.totalExecutionTime}ms`);
      console.log(`\nNodes Executed: ${analysis.successfulNodes}/${analysis.totalNodes}`);
      console.log(`Bottleneck: ${analysis.bottleneck.nodeName} (${analysis.bottleneck.executionTime}ms)`);
      console.log('\nNode Performance:');
      analysis.nodeResults.forEach(n => {
        console.log(`  - ${n.nodeName}: ${n.executionTime}ms ${n.success ? '✅' : '❌'}`);
      });
      console.log('\nAssertions:');
      assertionResults.forEach(r => {
        console.log(`  - ${r.assertion}: ${r.passed ? '✅ PASS' : '❌ FAIL'}`);
      });
    });
  });
});
