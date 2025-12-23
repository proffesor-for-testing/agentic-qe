/**
 * N8nTriggerTestAgent
 *
 * Tests n8n workflow triggers including:
 * - Webhook triggers (authentication, payload validation)
 * - Schedule/cron triggers
 * - Polling triggers
 * - Event-driven activation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  TriggerTestResult,
  TriggerInfo,
  TriggerTestCase,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface TriggerTestTask extends QETask {
  type: 'trigger-test';
  target: string; // workflowId
  options?: {
    testPayloads?: Record<string, unknown>[];
    testAuthentication?: boolean;
    simulateTriggers?: boolean;
  };
}

const TRIGGER_TYPES = {
  webhook: ['n8n-nodes-base.webhook', 'n8n-nodes-base.webhookTest'],
  schedule: ['n8n-nodes-base.cron', 'n8n-nodes-base.schedule', 'n8n-nodes-base.scheduleTrigger'],
  email: ['n8n-nodes-base.emailTrigger', 'n8n-nodes-base.emailReadImap'],
  database: ['n8n-nodes-base.postgresTrigger', 'n8n-nodes-base.mysqlTrigger'],
  messaging: [
    'n8n-nodes-base.slackTrigger',
    'n8n-nodes-base.telegramTrigger',
    'n8n-nodes-base.discordTrigger',
  ],
  file: ['n8n-nodes-base.localFileTrigger', 'n8n-nodes-base.s3Trigger'],
  api: ['n8n-nodes-base.httpPollTrigger'],
};

export class N8nTriggerTestAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'trigger-identification',
        version: '1.0.0',
        description: 'Identify and classify workflow triggers',
        parameters: {},
      },
      {
        name: 'webhook-testing',
        version: '1.0.0',
        description: 'Test webhook trigger configurations',
        parameters: {},
      },
      {
        name: 'authentication-validation',
        version: '1.0.0',
        description: 'Validate trigger authentication settings',
        parameters: {},
      },
      {
        name: 'trigger-simulation',
        version: '1.0.0',
        description: 'Simulate trigger activation',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-trigger-test' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<TriggerTestResult> {
    const triggerTask = task as TriggerTestTask;

    if (triggerTask.type !== 'trigger-test') {
      throw new Error(`Unsupported task type: ${triggerTask.type}`);
    }

    return this.testTriggers(triggerTask.target, triggerTask.options);
  }

  /**
   * Test all triggers in a workflow
   */
  async testTriggers(
    workflowId: string,
    options?: TriggerTestTask['options']
  ): Promise<TriggerTestResult> {
    const workflow = await this.getWorkflow(workflowId);

    // Identify triggers
    const triggers = this.identifyTriggers(workflow);

    // Run tests on each trigger
    const testResults: TriggerTestCase[] = [];

    for (const trigger of triggers) {
      // Configuration tests
      testResults.push(...this.testTriggerConfiguration(trigger, workflow));

      // Authentication tests
      if (options?.testAuthentication) {
        testResults.push(...this.testTriggerAuthentication(trigger));
      }

      // Payload tests (for webhooks)
      if (trigger.type.includes('webhook') && options?.testPayloads) {
        for (const payload of options.testPayloads) {
          testResults.push(await this.testWebhookPayload(trigger, payload, workflowId));
        }
      }

      // Simulate trigger if requested
      if (options?.simulateTriggers) {
        testResults.push(await this.simulateTrigger(trigger, workflowId));
      }
    }

    const result: TriggerTestResult = {
      workflowId,
      triggers,
      testResults,
      summary: {
        total: testResults.length,
        passed: testResults.filter(r => r.actualResult === 'pass').length,
        failed: testResults.filter(r => r.actualResult === 'fail').length,
      },
    };

    // Store result
    await this.storeTestResult(`trigger-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('trigger.test.completed', {
      workflowId,
      triggersFound: triggers.length,
      testsPassed: result.summary.passed,
      testsFailed: result.summary.failed,
    });

    return result;
  }

  /**
   * Identify all triggers in workflow
   */
  private identifyTriggers(workflow: N8nWorkflow): TriggerInfo[] {
    const triggers: TriggerInfo[] = [];

    for (const node of workflow.nodes) {
      if (this.isTriggerNode(node)) {
        triggers.push({
          nodeId: node.id,
          nodeName: node.name,
          type: node.type,
          configuration: node.parameters,
          authentication: this.getAuthenticationType(node),
          isSecure: this.isSecureTrigger(node),
        });
      }
    }

    return triggers;
  }

  /**
   * Check if node is a trigger
   */
  private isTriggerNode(node: N8nNode): boolean {
    const allTriggerTypes = Object.values(TRIGGER_TYPES).flat();
    return (
      allTriggerTypes.some(t => node.type.includes(t)) ||
      node.type.toLowerCase().includes('trigger')
    );
  }

  /**
   * Get trigger authentication type
   */
  private getAuthenticationType(node: N8nNode): string | null {
    const params = node.parameters;

    if (params.authentication) {
      return params.authentication as string;
    }

    if (params.headerAuth) {
      return 'headerAuth';
    }

    if (params.basicAuth) {
      return 'basicAuth';
    }

    return null;
  }

  /**
   * Check if trigger is secure
   */
  private isSecureTrigger(node: N8nNode): boolean {
    const auth = this.getAuthenticationType(node);

    // Webhook without auth is insecure
    if (node.type.includes('webhook') && (!auth || auth === 'none')) {
      return false;
    }

    return true;
  }

  /**
   * Test trigger configuration
   */
  private testTriggerConfiguration(trigger: TriggerInfo, workflow: N8nWorkflow): TriggerTestCase[] {
    const tests: TriggerTestCase[] = [];
    const startTime = Date.now();

    // Test: Trigger has required configuration
    const hasRequiredConfig = this.hasRequiredTriggerConfig(trigger);
    tests.push({
      triggerId: trigger.nodeId,
      testName: 'Required configuration present',
      input: null,
      expectedBehavior: 'All required parameters configured',
      actualResult: hasRequiredConfig ? 'pass' : 'fail',
      duration: Date.now() - startTime,
      errorMessage: hasRequiredConfig ? undefined : 'Missing required configuration',
    });

    // Test: Trigger is connected to downstream nodes
    const isConnected = this.isTriggerConnected(trigger, workflow);
    tests.push({
      triggerId: trigger.nodeId,
      testName: 'Trigger connected to workflow',
      input: null,
      expectedBehavior: 'Trigger has downstream connections',
      actualResult: isConnected ? 'pass' : 'fail',
      duration: Date.now() - startTime,
      errorMessage: isConnected ? undefined : 'Trigger not connected to any nodes',
    });

    // Test: Security check
    tests.push({
      triggerId: trigger.nodeId,
      testName: 'Security configuration',
      input: null,
      expectedBehavior: 'Trigger is securely configured',
      actualResult: trigger.isSecure ? 'pass' : 'fail',
      duration: Date.now() - startTime,
      errorMessage: trigger.isSecure ? undefined : 'Trigger lacks authentication',
    });

    return tests;
  }

  /**
   * Test trigger authentication
   */
  private testTriggerAuthentication(trigger: TriggerInfo): TriggerTestCase[] {
    const tests: TriggerTestCase[] = [];
    const startTime = Date.now();

    // Only test webhooks for authentication
    if (!trigger.type.includes('webhook')) {
      return tests;
    }

    // Test: Has authentication configured
    tests.push({
      triggerId: trigger.nodeId,
      testName: 'Authentication enabled',
      input: null,
      expectedBehavior: 'Webhook has authentication',
      actualResult: trigger.authentication && trigger.authentication !== 'none' ? 'pass' : 'fail',
      duration: Date.now() - startTime,
    });

    // Test: Authentication type is secure
    const secureAuthTypes = ['headerAuth', 'basicAuth', 'jwtAuth', 'oauth2'];
    const isSecureAuth = trigger.authentication
      ? secureAuthTypes.includes(trigger.authentication)
      : false;

    tests.push({
      triggerId: trigger.nodeId,
      testName: 'Secure authentication type',
      input: null,
      expectedBehavior: 'Uses secure authentication method',
      actualResult: isSecureAuth ? 'pass' : 'fail',
      duration: Date.now() - startTime,
      errorMessage: isSecureAuth ? undefined : `Authentication type "${trigger.authentication}" may not be secure`,
    });

    return tests;
  }

  /**
   * Test webhook with payload via ACTUAL HTTP invocation
   *
   * PRODUCTION TESTING: Tries both test-mode and production URLs
   * - Test URL: /webhook-test/<workflowId>/<path> (doesn't require active workflow)
   * - Production URL: /webhook/<path> (requires active workflow)
   */
  private async testWebhookPayload(
    trigger: TriggerInfo,
    payload: Record<string, unknown>,
    workflowId: string
  ): Promise<TriggerTestCase> {
    const startTime = Date.now();

    // Get both webhook URLs
    const urls = this.getAllWebhookUrls(trigger, workflowId);

    // Try test webhook URL first (doesn't require active workflow)
    if (urls.test) {
      try {
        const result = await this.invokeWebhookHttp(trigger, urls.test, payload, startTime);
        // If test webhook succeeds, return that result
        if (result.actualResult === 'pass') {
          return {
            ...result,
            testName: `Webhook test (test-mode): ${JSON.stringify(payload).substring(0, 50)}...`,
            metadata: { ...result.metadata as Record<string, unknown>, urlType: 'test' },
          };
        }
      } catch {
        // Test webhook failed, try production webhook
      }
    }

    // Try production webhook URL (requires workflow to be active)
    if (urls.production) {
      try {
        const result = await this.invokeWebhookHttp(trigger, urls.production, payload, startTime);
        return {
          ...result,
          metadata: { ...result.metadata as Record<string, unknown>, urlType: 'production' },
        };
      } catch {
        // Production webhook also failed, fall through to direct execution
      }
    }

    // Fallback: Execute workflow directly with test data
    try {
      const execution = await this.executeWorkflow(workflowId, payload, {
        waitForCompletion: true,
        timeout: 10000,
      });

      return {
        triggerId: trigger.nodeId,
        testName: `Payload test (direct execution): ${JSON.stringify(payload).substring(0, 50)}...`,
        input: payload,
        expectedBehavior: 'Workflow executes successfully with payload',
        actualResult: execution.status === 'success' ? 'pass' : 'fail',
        executionId: execution.id,
        duration: Date.now() - startTime,
        errorMessage: execution.status !== 'success'
          ? execution.data?.resultData?.error?.message
          : undefined,
        metadata: { urlType: 'direct-execution' },
      };
    } catch (error) {
      return {
        triggerId: trigger.nodeId,
        testName: `Payload test (direct execution): ${JSON.stringify(payload).substring(0, 50)}...`,
        input: payload,
        expectedBehavior: 'Workflow executes successfully with payload',
        actualResult: 'error',
        duration: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Execution failed',
        metadata: { urlType: 'direct-execution', triedUrls: urls },
      };
    }
  }

  /**
   * Invoke webhook via REAL HTTP request
   * This tests the actual webhook endpoint, authentication, and payload handling
   */
  private async invokeWebhookHttp(
    trigger: TriggerInfo,
    webhookUrl: string,
    payload: Record<string, unknown>,
    startTime: number
  ): Promise<TriggerTestCase> {
    const httpMethod = (trigger.configuration.httpMethod as string) || 'POST';

    try {
      // Build headers with authentication if configured
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add authentication headers based on trigger config
      if (trigger.authentication === 'headerAuth' && trigger.configuration.headerAuthName) {
        headers[trigger.configuration.headerAuthName as string] =
          trigger.configuration.headerAuthValue as string || 'test-value';
      }
      if (trigger.authentication === 'basicAuth') {
        const username = trigger.configuration.basicAuthUser as string || '';
        const password = trigger.configuration.basicAuthPassword as string || '';
        headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      }

      // Make the actual HTTP request
      const response = await fetch(webhookUrl, {
        method: httpMethod,
        headers,
        body: httpMethod !== 'GET' ? JSON.stringify(payload) : undefined,
      });

      const responseData = await response.text();
      let responseJson: unknown;
      try {
        responseJson = JSON.parse(responseData);
      } catch {
        responseJson = responseData;
      }

      // Success is 2xx status code
      const isSuccess = response.status >= 200 && response.status < 300;

      return {
        triggerId: trigger.nodeId,
        testName: `HTTP ${httpMethod} webhook: ${webhookUrl}`,
        input: { payload, headers: Object.keys(headers) },
        expectedBehavior: 'Webhook responds successfully to HTTP request',
        actualResult: isSuccess ? 'pass' : 'fail',
        duration: Date.now() - startTime,
        errorMessage: !isSuccess ? `HTTP ${response.status}: ${responseData.substring(0, 200)}` : undefined,
        metadata: {
          httpStatus: response.status,
          responseData: responseJson,
          method: httpMethod,
          url: webhookUrl,
        },
      };
    } catch (error) {
      return {
        triggerId: trigger.nodeId,
        testName: `HTTP ${httpMethod} webhook: ${webhookUrl}`,
        input: payload,
        expectedBehavior: 'Webhook endpoint is reachable',
        actualResult: 'error',
        duration: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'HTTP request failed',
        metadata: {
          method: httpMethod,
          url: webhookUrl,
          error: error instanceof Error ? error.name : 'Unknown',
        },
      };
    }
  }

  /**
   * Test webhook without authentication (security test)
   * Verifies that protected webhooks reject unauthenticated requests
   */
  async testWebhookWithoutAuth(
    trigger: TriggerInfo,
    payload: Record<string, unknown>
  ): Promise<TriggerTestCase> {
    const startTime = Date.now();
    const webhookUrl = this.getWebhookUrl(trigger);

    if (!webhookUrl) {
      return {
        triggerId: trigger.nodeId,
        testName: 'Unauthenticated access test',
        input: payload,
        expectedBehavior: 'Cannot determine webhook URL',
        actualResult: 'error',
        duration: Date.now() - startTime,
        errorMessage: 'Webhook URL not available',
      };
    }

    try {
      // Make request WITHOUT authentication headers
      const response = await fetch(webhookUrl, {
        method: (trigger.configuration.httpMethod as string) || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // If webhook requires auth, it should reject (4xx status)
      const hasAuth = trigger.authentication && trigger.authentication !== 'none';

      if (hasAuth) {
        // Protected webhook should reject unauthenticated requests
        const rejectedCorrectly = response.status === 401 || response.status === 403;
        return {
          triggerId: trigger.nodeId,
          testName: 'Unauthenticated access blocked',
          input: payload,
          expectedBehavior: 'Protected webhook rejects request without credentials',
          actualResult: rejectedCorrectly ? 'pass' : 'fail',
          duration: Date.now() - startTime,
          errorMessage: !rejectedCorrectly
            ? `Expected 401/403 but got ${response.status} - webhook may be vulnerable`
            : undefined,
        };
      } else {
        // Unprotected webhook - just check it responds
        return {
          triggerId: trigger.nodeId,
          testName: 'Public webhook accessible',
          input: payload,
          expectedBehavior: 'Public webhook accepts request',
          actualResult: response.status < 500 ? 'pass' : 'fail',
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        triggerId: trigger.nodeId,
        testName: 'Unauthenticated access test',
        input: payload,
        expectedBehavior: 'Webhook endpoint responds',
        actualResult: 'error',
        duration: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  /**
   * Test webhook with malformed payloads (robustness test)
   */
  async testWebhookPayloadValidation(
    trigger: TriggerInfo
  ): Promise<TriggerTestCase[]> {
    const webhookUrl = this.getWebhookUrl(trigger);
    if (!webhookUrl) return [];

    const malformedPayloads = [
      { name: 'Empty body', payload: null },
      { name: 'Invalid JSON string', payload: 'not-json' },
      { name: 'Array instead of object', payload: [1, 2, 3] },
      { name: 'Nested nulls', payload: { a: { b: null, c: undefined } } },
      { name: 'Very large payload', payload: { data: 'x'.repeat(10000) } },
    ];

    const results: TriggerTestCase[] = [];

    for (const test of malformedPayloads) {
      const startTime = Date.now();
      try {
        const response = await fetch(webhookUrl, {
          method: (trigger.configuration.httpMethod as string) || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: typeof test.payload === 'string' ? test.payload : JSON.stringify(test.payload),
        });

        // Should not crash (5xx) on bad input - graceful handling expected
        results.push({
          triggerId: trigger.nodeId,
          testName: `Payload validation: ${test.name}`,
          input: test.payload as Record<string, unknown>,
          expectedBehavior: 'Webhook handles malformed payload gracefully',
          actualResult: response.status < 500 ? 'pass' : 'fail',
          duration: Date.now() - startTime,
          errorMessage: response.status >= 500 ? `Server error ${response.status}` : undefined,
        });
      } catch (error) {
        results.push({
          triggerId: trigger.nodeId,
          testName: `Payload validation: ${test.name}`,
          input: test.payload as Record<string, unknown>,
          expectedBehavior: 'Webhook handles malformed payload gracefully',
          actualResult: 'error',
          duration: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Request failed',
        });
      }
    }

    return results;
  }

  /**
   * Simulate trigger activation
   */
  private async simulateTrigger(
    trigger: TriggerInfo,
    workflowId: string
  ): Promise<TriggerTestCase> {
    const startTime = Date.now();

    // Generate test data based on trigger type
    const testData = this.generateTriggerTestData(trigger);

    try {
      const execution = await this.executeWorkflow(workflowId, testData, {
        waitForCompletion: true,
        timeout: 15000,
      });

      return {
        triggerId: trigger.nodeId,
        testName: `Simulate ${trigger.type} trigger`,
        input: testData,
        expectedBehavior: 'Trigger activates workflow successfully',
        actualResult: execution.status === 'success' ? 'pass' : 'fail',
        executionId: execution.id,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        triggerId: trigger.nodeId,
        testName: `Simulate ${trigger.type} trigger`,
        input: testData,
        expectedBehavior: 'Trigger activates workflow successfully',
        actualResult: 'error',
        duration: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Simulation failed',
      };
    }
  }

  /**
   * Check if trigger has required configuration
   */
  private hasRequiredTriggerConfig(trigger: TriggerInfo): boolean {
    if (trigger.type.includes('webhook')) {
      return !!(trigger.configuration.httpMethod && trigger.configuration.path);
    }

    if (trigger.type.includes('cron') || trigger.type.includes('schedule')) {
      return !!(trigger.configuration.rule || trigger.configuration.interval);
    }

    // Default to true for other trigger types
    return true;
  }

  /**
   * Check if trigger is connected to downstream nodes
   */
  private isTriggerConnected(trigger: TriggerInfo, workflow: N8nWorkflow): boolean {
    return !!workflow.connections[trigger.nodeName];
  }

  /**
   * Generate test data for trigger type
   */
  private generateTriggerTestData(trigger: TriggerInfo): Record<string, unknown> {
    if (trigger.type.includes('webhook')) {
      return {
        headers: { 'Content-Type': 'application/json' },
        body: { test: true, timestamp: Date.now() },
        query: {},
      };
    }

    if (trigger.type.includes('email')) {
      return {
        from: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
        date: new Date().toISOString(),
      };
    }

    if (trigger.type.includes('slack')) {
      return {
        type: 'message',
        channel: '#test',
        user: 'U123456',
        text: 'Test message',
        ts: Date.now().toString(),
      };
    }

    // Default test data
    return {
      triggered: true,
      timestamp: Date.now(),
      source: 'test',
    };
  }

  /**
   * Get webhook URL for a trigger
   *
   * n8n webhook URL patterns:
   * - Production (workflow active): /webhook/<path>
   * - Test mode: /webhook-test/<workflowId>/<path>
   * - With UUID path: /webhook/<uuid>
   *
   * Returns both production and test URLs for comprehensive testing
   */
  getWebhookUrl(trigger: TriggerInfo, workflowId?: string): string | null {
    if (!trigger.type.includes('webhook')) {
      return null;
    }

    const path = trigger.configuration.path as string;
    if (!path) return null;

    // Remove leading slash if present
    const cleanPath = path.replace(/^\//, '');

    // Return production webhook URL
    // For test mode, use getWebhookTestUrl()
    return `${this.n8nConfig.baseUrl}/webhook/${cleanPath}`;
  }

  /**
   * Get webhook TEST URL for a trigger
   * Test mode webhooks don't require the workflow to be active
   */
  getWebhookTestUrl(trigger: TriggerInfo, workflowId: string): string | null {
    if (!trigger.type.includes('webhook')) {
      return null;
    }

    const path = trigger.configuration.path as string;
    if (!path) return null;

    // Remove leading slash if present
    const cleanPath = path.replace(/^\//, '');

    // n8n test webhook format: /webhook-test/<workflowId>/<path>
    return `${this.n8nConfig.baseUrl}/webhook-test/${workflowId}/${cleanPath}`;
  }

  /**
   * Get all possible webhook URLs for comprehensive testing
   */
  getAllWebhookUrls(trigger: TriggerInfo, workflowId: string): {
    production: string | null;
    test: string | null;
  } {
    return {
      production: this.getWebhookUrl(trigger, workflowId),
      test: this.getWebhookTestUrl(trigger, workflowId),
    };
  }

  /**
   * Get trigger type category
   */
  getTriggerCategory(trigger: TriggerInfo): string {
    for (const [category, types] of Object.entries(TRIGGER_TYPES)) {
      if (types.some(t => trigger.type.includes(t))) {
        return category;
      }
    }
    return 'other';
  }
}
