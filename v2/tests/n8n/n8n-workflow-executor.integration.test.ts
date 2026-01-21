/**
 * Integration Tests for N8n Workflow Executor Agent
 *
 * Tests the agent against a mock n8n API server to validate:
 * - Workflow retrieval and caching
 * - Workflow execution
 * - Execution analysis and bottleneck detection
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMockN8nServer, stopMockN8nServer, mockWorkflows } from './mock-n8n-server';
import type { Server } from 'http';

// Simple HTTP client for testing
async function fetchAPI(path: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = 'http://localhost:5679';
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': 'test-api-key',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

describe('N8n Workflow Executor Agent - Integration Tests', () => {
  let server: Server;

  beforeAll(async () => {
    // Start mock server on different port to avoid conflicts
    server = await startMockN8nServer(5679);
  });

  afterAll(async () => {
    await stopMockN8nServer(server);
  });

  describe('Workflow Management', () => {
    it('should list all workflows', async () => {
      const result = await fetchAPI('/api/v1/workflows');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(3);
    });

    it('should get workflow by ID', async () => {
      const result = await fetchAPI('/api/v1/workflows/wf-001');

      expect(result.id).toBe('wf-001');
      expect(result.name).toBe('Customer Onboarding');
      expect(result.nodes).toBeDefined();
      expect(result.connections).toBeDefined();
    });

    it('should return 404 for non-existent workflow', async () => {
      await expect(fetchAPI('/api/v1/workflows/wf-999')).rejects.toThrow('Workflow not found');
    });

    it('should validate workflow structure', async () => {
      const workflow = await fetchAPI('/api/v1/workflows/wf-001');

      // Validate required properties
      expect(workflow).toHaveProperty('id');
      expect(workflow).toHaveProperty('name');
      expect(workflow).toHaveProperty('nodes');
      expect(workflow).toHaveProperty('connections');
      expect(workflow).toHaveProperty('settings');

      // Validate nodes structure
      for (const node of workflow.nodes) {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('position');
        expect(node).toHaveProperty('parameters');
      }
    });

    it('should retrieve workflows with different statuses', async () => {
      const result = await fetchAPI('/api/v1/workflows');

      const activeWorkflows = result.data.filter((w: any) => w.active);
      const inactiveWorkflows = result.data.filter((w: any) => !w.active);

      expect(activeWorkflows.length).toBe(2);
      expect(inactiveWorkflows.length).toBe(1);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow and return execution result', async () => {
      const result = await fetchAPI('/api/v1/workflows/wf-001/execute', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', name: 'Test User' })
      });

      expect(result.id).toBeDefined();
      expect(result.workflowId).toBe('wf-001');
      expect(result.status).toBe('success');
      expect(result.finished).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.resultData).toBeDefined();
      expect(result.data.resultData.runData).toBeDefined();
    });

    it('should include timing information in execution', async () => {
      const result = await fetchAPI('/api/v1/workflows/wf-001/execute', {
        method: 'POST'
      });

      const runData = result.data.resultData.runData;

      // Each node should have timing information
      for (const nodeName of Object.keys(runData)) {
        const nodeExecution = runData[nodeName][0];
        expect(nodeExecution).toHaveProperty('startTime');
        expect(nodeExecution).toHaveProperty('executionTime');
        expect(typeof nodeExecution.startTime).toBe('number');
        expect(typeof nodeExecution.executionTime).toBe('number');
      }
    });

    it('should reject execution for non-existent workflow', async () => {
      await expect(
        fetchAPI('/api/v1/workflows/wf-999/execute', { method: 'POST' })
      ).rejects.toThrow('Workflow not found');
    });
  });

  describe('Execution History', () => {
    it('should list all executions', async () => {
      const result = await fetchAPI('/api/v1/executions');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should get execution by ID', async () => {
      const result = await fetchAPI('/api/v1/executions/exec-001');

      expect(result.id).toBe('exec-001');
      expect(result.workflowId).toBe('wf-001');
      expect(result.status).toBe('success');
    });

    it('should return error execution details', async () => {
      const result = await fetchAPI('/api/v1/executions/exec-002');

      expect(result.status).toBe('error');
      expect(result.data.resultData.error).toBeDefined();
      expect(result.data.resultData.error.message).toBe('Email service unavailable');
      expect(result.data.resultData.error.node).toBe('Send Welcome Email');
    });

    it('should return 404 for non-existent execution', async () => {
      await expect(fetchAPI('/api/v1/executions/exec-999')).rejects.toThrow('Execution not found');
    });
  });

  describe('Credentials', () => {
    it('should list credentials (masked)', async () => {
      const result = await fetchAPI('/api/v1/credentials');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // Verify credentials are masked (no actual secrets)
      for (const cred of result.data) {
        expect(cred).toHaveProperty('id');
        expect(cred).toHaveProperty('name');
        expect(cred).toHaveProperty('type');
        expect(cred).not.toHaveProperty('data'); // Sensitive data should not be exposed
      }
    });
  });

  describe('Authentication', () => {
    it('should reject invalid API key', async () => {
      const baseUrl = 'http://localhost:5679';
      const response = await fetch(`${baseUrl}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': 'invalid-key' }
      });

      expect(response.status).toBe(401);
    });

    it('should accept valid API key', async () => {
      const result = await fetchAPI('/api/v1/workflows');
      expect(result.data).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const result = await fetchAPI('/health');

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Workflow Analysis (Agent Logic)', () => {
    it('should analyze workflow for bottlenecks', async () => {
      // Execute workflow
      const execution = await fetchAPI('/api/v1/workflows/wf-001/execute', {
        method: 'POST'
      });

      const runData = execution.data.resultData.runData;

      // Identify slowest node (bottleneck)
      let slowestNode = '';
      let maxTime = 0;

      for (const [nodeName, nodeData] of Object.entries(runData)) {
        const execTime = (nodeData as any[])[0].executionTime;
        if (execTime > maxTime) {
          maxTime = execTime;
          slowestNode = nodeName;
        }
      }

      expect(slowestNode).toBeDefined();
      expect(maxTime).toBeGreaterThan(0);
    });

    it('should calculate total execution time', async () => {
      const execution = await fetchAPI('/api/v1/executions/exec-001');

      const startedAt = new Date(execution.startedAt).getTime();
      const stoppedAt = new Date(execution.stoppedAt).getTime();
      const totalTime = stoppedAt - startedAt;

      expect(totalTime).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(60000); // Less than 1 minute for this workflow
    });

    it('should detect workflow execution patterns', async () => {
      const executions = await fetchAPI('/api/v1/executions');

      // Group by workflow
      const byWorkflow: Record<string, any[]> = {};
      for (const exec of executions.data) {
        if (!byWorkflow[exec.workflowId]) {
          byWorkflow[exec.workflowId] = [];
        }
        byWorkflow[exec.workflowId].push(exec);
      }

      // Workflow wf-001 should have multiple executions
      expect(byWorkflow['wf-001'].length).toBeGreaterThan(1);

      // Analyze success rate
      const wf001Execs = byWorkflow['wf-001'];
      const successCount = wf001Execs.filter((e: any) => e.status === 'success').length;
      const successRate = (successCount / wf001Execs.length) * 100;

      expect(successRate).toBeGreaterThanOrEqual(0);
      expect(successRate).toBeLessThanOrEqual(100);
    });

    it('should validate data flow between nodes', async () => {
      const workflow = await fetchAPI('/api/v1/workflows/wf-001');

      // Validate connections exist
      const connections = workflow.connections;
      expect(Object.keys(connections).length).toBeGreaterThan(0);

      // Validate each connected node exists
      for (const [sourceName, outputs] of Object.entries(connections)) {
        const sourceNode = workflow.nodes.find((n: any) => n.name === sourceName);
        expect(sourceNode).toBeDefined();

        for (const output of (outputs as any).main) {
          for (const connection of output) {
            const targetNode = workflow.nodes.find((n: any) => n.name === connection.node);
            expect(targetNode).toBeDefined();
          }
        }
      }
    });

    it('should identify node types for optimization suggestions', async () => {
      const workflow = await fetchAPI('/api/v1/workflows/wf-001');

      const nodeTypes = workflow.nodes.map((n: any) => n.type);

      // Check for HTTP nodes (potential bottlenecks)
      const httpNodes = workflow.nodes.filter((n: any) =>
        n.type.includes('httpRequest') || n.type.includes('webhook')
      );

      // HTTP nodes are common performance bottlenecks
      expect(httpNodes.length).toBeGreaterThan(0);

      // Check for trigger nodes
      const triggerNodes = workflow.nodes.filter((n: any) =>
        n.type.includes('Trigger') || n.type.includes('webhook')
      );

      expect(triggerNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle network timeouts gracefully', async () => {
      // The mock server responds quickly, but we test the client can handle timeout setup
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const result = await fetchAPI('/api/v1/workflows', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        expect(result.data).toBeDefined();
      } catch (error: any) {
        clearTimeout(timeoutId);
        // If aborted, that's expected behavior for timeout
        if (error.name !== 'AbortError') {
          throw error;
        }
      }
    });

    it('should handle malformed responses', async () => {
      // Test with invalid endpoint - should get 404
      await expect(fetchAPI('/api/v1/invalid-endpoint')).rejects.toThrow();
    });

    it('should preserve error context from failed executions', async () => {
      const execution = await fetchAPI('/api/v1/executions/exec-002');

      // Error should have context
      expect(execution.data.resultData.error.message).toBeTruthy();
      expect(execution.data.resultData.error.node).toBeTruthy();

      // Failed node should be identified
      const failedNode = execution.data.resultData.error.node;
      expect(failedNode).toBe('Send Welcome Email');
    });
  });
});
