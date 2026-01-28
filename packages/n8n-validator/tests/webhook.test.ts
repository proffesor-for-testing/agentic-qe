import { describe, it, expect } from 'vitest';
import {
  extractWebhooks,
  buildWebhookUrl,
  generateTestPayload,
  testWebhook,
  testWorkflowWebhooks,
  formatWebhookTestResults,
  webhookTestResultsToJson,
  type WebhookNode,
  type WebhookTestConfig,
} from '../src/testers/webhook.js';

describe('Webhook Tester', () => {
  describe('extractWebhooks', () => {
    it('should extract webhook nodes from workflow', () => {
      const workflow = {
        nodes: [
          {
            name: 'My Webhook',
            type: 'n8n-nodes-base.webhook',
            parameters: {
              path: 'test-path',
              httpMethod: 'POST',
              authentication: 'headerAuth',
            },
          },
          {
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            parameters: {},
          },
        ],
      };

      const webhooks = extractWebhooks(workflow);
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].name).toBe('My Webhook');
      expect(webhooks[0].path).toBe('test-path');
      expect(webhooks[0].httpMethod).toBe('POST');
      expect(webhooks[0].authentication).toBe('headerAuth');
    });

    it('should extract webhooks with @n8n prefix', () => {
      const workflow = {
        nodes: [
          {
            name: 'Webhook',
            type: '@n8n/n8n-nodes-base.webhook',
            parameters: {
              path: 'api/v1/data',
              httpMethod: 'GET',
              authentication: 'none',
            },
          },
        ],
      };

      const webhooks = extractWebhooks(workflow);
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].path).toBe('api/v1/data');
    });

    it('should return empty array when no webhooks', () => {
      const workflow = {
        nodes: [
          { name: 'Start', type: 'n8n-nodes-base.start', parameters: {} },
        ],
      };

      const webhooks = extractWebhooks(workflow);
      expect(webhooks).toHaveLength(0);
    });

    it('should handle missing nodes array', () => {
      const workflow = {};
      const webhooks = extractWebhooks(workflow);
      expect(webhooks).toHaveLength(0);
    });
  });

  describe('buildWebhookUrl', () => {
    const webhook: WebhookNode = {
      name: 'Test',
      path: 'my-endpoint',
      httpMethod: 'POST',
      authentication: 'none',
    };

    it('should build test webhook URL', () => {
      const url = buildWebhookUrl('http://localhost:5678', webhook, false);
      expect(url).toBe('http://localhost:5678/webhook-test/my-endpoint');
    });

    it('should build production webhook URL', () => {
      const url = buildWebhookUrl('http://localhost:5678', webhook, true);
      expect(url).toBe('http://localhost:5678/webhook/my-endpoint');
    });

    it('should handle trailing slash in base URL', () => {
      const url = buildWebhookUrl('http://localhost:5678/', webhook, false);
      expect(url).toBe('http://localhost:5678/webhook-test/my-endpoint');
    });

    it('should handle leading slash in path', () => {
      const webhookWithSlash: WebhookNode = {
        ...webhook,
        path: '/my-endpoint',
      };
      const url = buildWebhookUrl('http://localhost:5678', webhookWithSlash, false);
      expect(url).toBe('http://localhost:5678/webhook-test/my-endpoint');
    });

    it('should include webhookId if available', () => {
      const webhookWithId: WebhookNode = {
        ...webhook,
        webhookId: 'abc123',
      };
      const url = buildWebhookUrl('http://localhost:5678', webhookWithId, false);
      expect(url).toBe('http://localhost:5678/webhook-test/abc123/my-endpoint');
    });
  });

  describe('generateTestPayload', () => {
    it('should generate marketing payload for marketing paths', () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'marketing-report',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const payload = generateTestPayload(webhook) as Record<string, unknown>;
      expect(payload.test).toBe(true);
      expect(payload.source).toBe('n8n-validator');
      expect(payload.data).toBeDefined();
    });

    it('should generate order payload for order paths', () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'new-order',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const payload = generateTestPayload(webhook) as Record<string, unknown>;
      expect(payload.test).toBe(true);
      expect(payload.orderId).toBeDefined();
    });

    it('should generate user payload for user paths', () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'user-signup',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const payload = generateTestPayload(webhook) as Record<string, unknown>;
      expect(payload.test).toBe(true);
      expect(payload.userId).toBeDefined();
    });

    it('should generate generic payload for other paths', () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'generic',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const payload = generateTestPayload(webhook) as Record<string, unknown>;
      expect(payload.test).toBe(true);
      expect(payload.source).toBe('n8n-validator');
      expect(payload.message).toBeDefined();
    });
  });

  describe('testWebhook (dry run)', () => {
    it('should return success in dry run mode', async () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'test',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const config: WebhookTestConfig = {
        n8nUrl: 'http://localhost:5678',
        dryRun: true,
      };

      const result = await testWebhook(webhook, config);
      expect(result.success).toBe(true);
      expect(result.response).toEqual({ dryRun: true, message: 'Request not sent (dry run mode)' });
    });

    it('should add warning for unauthenticated webhooks', async () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'test',
        httpMethod: 'POST',
        authentication: 'none',
      };

      const config: WebhookTestConfig = {
        n8nUrl: 'http://localhost:5678',
        dryRun: true,
      };

      const result = await testWebhook(webhook, config);
      expect(result.warnings).toContain('Webhook has no authentication configured');
      expect(result.recommendations).toContain('Enable headerAuth or basicAuth for production webhooks');
    });

    it('should detect unconfigured credentials', async () => {
      const webhook: WebhookNode = {
        name: 'Test',
        path: 'test',
        httpMethod: 'POST',
        authentication: 'headerAuth',
        credentials: {
          httpHeaderAuth: {
            id: 'CREATE_NEW_CREDENTIAL',
            name: 'My API Key',
          },
        },
      };

      const config: WebhookTestConfig = {
        n8nUrl: 'http://localhost:5678',
        dryRun: true,
      };

      const result = await testWebhook(webhook, config);
      expect(result.warnings.some(w => w.includes('not configured'))).toBe(true);
    });
  });

  describe('testWorkflowWebhooks', () => {
    it('should return empty summary for workflow without webhooks', async () => {
      const workflow = {
        nodes: [
          { name: 'Start', type: 'n8n-nodes-base.start', parameters: {} },
        ],
      };

      const config: WebhookTestConfig = {
        n8nUrl: 'http://localhost:5678',
        dryRun: true,
      };

      const summary = await testWorkflowWebhooks(workflow, config);
      expect(summary.total).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.results).toHaveLength(0);
    });

    it('should test multiple webhooks', async () => {
      const workflow = {
        nodes: [
          {
            name: 'Webhook 1',
            type: 'n8n-nodes-base.webhook',
            parameters: { path: 'test1', httpMethod: 'GET', authentication: 'none' },
          },
          {
            name: 'Webhook 2',
            type: 'n8n-nodes-base.webhook',
            parameters: { path: 'test2', httpMethod: 'POST', authentication: 'none' },
          },
        ],
      };

      const config: WebhookTestConfig = {
        n8nUrl: 'http://localhost:5678',
        dryRun: true,
      };

      const summary = await testWorkflowWebhooks(workflow, config);
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.results).toHaveLength(2);
    });
  });

  describe('formatWebhookTestResults', () => {
    it('should format results for CLI output', () => {
      const summary = {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        results: [
          {
            webhook: {
              name: 'Test Webhook',
              path: 'test',
              httpMethod: 'POST',
              authentication: 'none',
            },
            success: true,
            statusCode: 200,
            responseTime: 50,
            url: 'http://localhost:5678/webhook-test/test',
            method: 'POST',
            warnings: [],
            recommendations: [],
          },
        ],
      };

      const output = formatWebhookTestResults(summary);
      expect(output).toContain('Webhook Test Results');
      expect(output).toContain('Test Webhook');
      expect(output).toContain('Total: 1');
      expect(output).toContain('Passed: 1');
    });

    it('should show message when no webhooks found', () => {
      const summary = {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        results: [],
      };

      const output = formatWebhookTestResults(summary);
      expect(output).toContain('No webhooks found');
    });
  });

  describe('webhookTestResultsToJson', () => {
    it('should export results as valid JSON', () => {
      const summary = {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: 100,
        results: [
          {
            webhook: {
              name: 'Test',
              path: 'test',
              httpMethod: 'POST',
              authentication: 'none',
            },
            success: true,
            statusCode: 200,
            responseTime: 50,
            url: 'http://localhost:5678/webhook-test/test',
            method: 'POST',
            warnings: [],
            recommendations: [],
          },
        ],
      };

      const json = webhookTestResultsToJson(summary);
      const parsed = JSON.parse(json);

      expect(parsed.$schema).toBeDefined();
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.summary.total).toBe(1);
      expect(parsed.results).toHaveLength(1);
    });
  });
});
