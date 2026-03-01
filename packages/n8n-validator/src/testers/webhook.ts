/**
 * Runtime Webhook Tester
 * Tests n8n webhooks by making actual HTTP requests
 * No AI/LLM required - pure HTTP testing
 */

export interface WebhookNode {
  name: string;
  id?: string;
  path: string;
  httpMethod: string;
  authentication: string;
  responseMode?: string;
  webhookId?: string;
  credentials?: Record<string, unknown>;
}

export interface WebhookTestConfig {
  n8nUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  authToken?: string;
  testPayload?: unknown;
  validateResponse?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface WebhookTestResult {
  webhook: WebhookNode;
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  response?: unknown;
  error?: string;
  url: string;
  method: string;
  warnings: string[];
  recommendations: string[];
}

export interface WebhookTestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: WebhookTestResult[];
  duration: number;
}

/**
 * Extract webhook nodes from n8n workflow
 */
export function extractWebhooks(workflow: Record<string, unknown>): WebhookNode[] {
  const nodes = workflow.nodes as Array<Record<string, unknown>> || [];
  const webhooks: WebhookNode[] = [];

  for (const node of nodes) {
    const type = node.type as string;

    // Check for webhook node types
    if (type === 'n8n-nodes-base.webhook' ||
        type === '@n8n/n8n-nodes-base.webhook' ||
        type?.includes('webhook')) {

      const params = node.parameters as Record<string, unknown> || {};

      webhooks.push({
        name: node.name as string,
        id: node.id as string,
        path: params.path as string || '',
        httpMethod: (params.httpMethod as string || 'GET').toUpperCase(),
        authentication: params.authentication as string || 'none',
        responseMode: params.responseMode as string,
        webhookId: node.webhookId as string,
        credentials: node.credentials as Record<string, unknown>,
      });
    }
  }

  return webhooks;
}

/**
 * Build the full webhook URL
 */
export function buildWebhookUrl(
  baseUrl: string,
  webhook: WebhookNode,
  isProduction: boolean = false
): string {
  // Remove trailing slash from base URL
  const base = baseUrl.replace(/\/$/, '');

  // n8n webhook URL patterns:
  // Test: /webhook-test/<path>
  // Production: /webhook/<path>
  const prefix = isProduction ? 'webhook' : 'webhook-test';

  // Clean up path (remove leading slash if present)
  const path = webhook.path.replace(/^\//, '');

  // If webhookId is available, use it for more reliable URL
  if (webhook.webhookId) {
    return `${base}/${prefix}/${webhook.webhookId}/${path}`;
  }

  return `${base}/${prefix}/${path}`;
}

/**
 * Generate test payload based on webhook config
 */
export function generateTestPayload(webhook: WebhookNode): unknown {
  // Default test payloads based on common patterns
  const pathLower = webhook.path.toLowerCase();

  if (pathLower.includes('marketing') || pathLower.includes('report')) {
    return {
      test: true,
      source: 'n8n-validator',
      timestamp: new Date().toISOString(),
      data: {
        campaign: 'test-campaign',
        metrics: { impressions: 1000, clicks: 50 }
      }
    };
  }

  if (pathLower.includes('order') || pathLower.includes('purchase')) {
    return {
      test: true,
      source: 'n8n-validator',
      orderId: 'TEST-001',
      amount: 0,
      currency: 'USD'
    };
  }

  if (pathLower.includes('user') || pathLower.includes('customer')) {
    return {
      test: true,
      source: 'n8n-validator',
      userId: 'test-user',
      email: 'test@example.com'
    };
  }

  // Generic test payload
  return {
    test: true,
    source: 'n8n-validator',
    timestamp: new Date().toISOString(),
    message: 'Webhook test from n8n-validator'
  };
}

/**
 * Test a single webhook
 */
export async function testWebhook(
  webhook: WebhookNode,
  config: WebhookTestConfig
): Promise<WebhookTestResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Build URLs for both test and production
  const testUrl = buildWebhookUrl(config.n8nUrl, webhook, false);
  const prodUrl = buildWebhookUrl(config.n8nUrl, webhook, true);

  // Check authentication
  if (webhook.authentication === 'none') {
    warnings.push('Webhook has no authentication configured');
    recommendations.push('Enable headerAuth or basicAuth for production webhooks');
  }

  // Check credentials placeholder
  if (webhook.credentials) {
    const creds = Object.values(webhook.credentials);
    for (const cred of creds) {
      if (typeof cred === 'object' && cred !== null) {
        const credObj = cred as Record<string, unknown>;
        if (credObj.id === 'CREATE_NEW_CREDENTIAL') {
          warnings.push(`Credential "${credObj.name}" is not configured`);
          recommendations.push('Configure credentials in n8n before testing');
        }
      }
    }
  }

  // Dry run mode - don't make actual request
  if (config.dryRun) {
    return {
      webhook,
      success: true,
      url: testUrl,
      method: webhook.httpMethod,
      warnings,
      recommendations,
      response: { dryRun: true, message: 'Request not sent (dry run mode)' }
    };
  }

  // Prepare request
  const method = webhook.httpMethod;
  const payload = config.testPayload || generateTestPayload(webhook);
  const timeout = config.timeout || 30000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'n8n-validator/1.0.0',
    'X-Test-Source': 'n8n-validator',
    ...config.headers
  };

  // Add auth header if provided
  if (config.authToken) {
    headers['Authorization'] = config.authToken.startsWith('Bearer ')
      ? config.authToken
      : `Bearer ${config.authToken}`;
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    // Add body for non-GET requests
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(testUrl, fetchOptions);
    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;

    let responseBody: unknown;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    // Determine success based on status code
    const success = response.status >= 200 && response.status < 400;

    // Add warnings for non-ideal responses
    if (response.status === 404) {
      warnings.push('Webhook endpoint not found - workflow may not be active');
      recommendations.push('Activate the workflow in n8n before testing');
    } else if (response.status === 401 || response.status === 403) {
      warnings.push('Authentication failed');
      recommendations.push('Provide valid auth token with --auth-token option');
    } else if (response.status >= 500) {
      warnings.push('Server error - check n8n logs');
    }

    if (responseTime > 5000) {
      warnings.push(`Slow response time: ${responseTime}ms`);
      recommendations.push('Consider optimizing webhook processing');
    }

    return {
      webhook,
      success,
      statusCode: response.status,
      responseTime,
      response: responseBody,
      url: testUrl,
      method,
      warnings,
      recommendations
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('abort')) {
      warnings.push(`Request timed out after ${timeout}ms`);
      recommendations.push('Increase timeout with --timeout option or check n8n availability');
    } else if (errorMessage.includes('ECONNREFUSED')) {
      warnings.push('Connection refused - n8n may not be running');
      recommendations.push('Verify n8n is running and accessible at the specified URL');
    } else if (errorMessage.includes('ENOTFOUND')) {
      warnings.push('Host not found - check n8n URL');
      recommendations.push('Verify the --n8n-url is correct');
    }

    return {
      webhook,
      success: false,
      responseTime,
      error: errorMessage,
      url: testUrl,
      method,
      warnings,
      recommendations
    };
  }
}

/**
 * Test all webhooks in a workflow
 */
export async function testWorkflowWebhooks(
  workflow: Record<string, unknown>,
  config: WebhookTestConfig
): Promise<WebhookTestSummary> {
  const startTime = Date.now();
  const webhooks = extractWebhooks(workflow);

  if (webhooks.length === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      duration: Date.now() - startTime
    };
  }

  const results: WebhookTestResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const webhook of webhooks) {
    // Skip webhooks with unconfigured credentials (unless dry run)
    if (!config.dryRun && webhook.credentials) {
      const hasUnconfigured = Object.values(webhook.credentials).some(cred => {
        if (typeof cred === 'object' && cred !== null) {
          return (cred as Record<string, unknown>).id === 'CREATE_NEW_CREDENTIAL';
        }
        return false;
      });

      if (hasUnconfigured && webhook.authentication !== 'none') {
        results.push({
          webhook,
          success: false,
          url: buildWebhookUrl(config.n8nUrl, webhook, false),
          method: webhook.httpMethod,
          warnings: ['Skipped: credentials not configured'],
          recommendations: ['Configure credentials in n8n first'],
          error: 'Credentials not configured'
        });
        skipped++;
        continue;
      }
    }

    const result = await testWebhook(webhook, config);
    results.push(result);

    if (result.success) {
      passed++;
    } else {
      failed++;
    }
  }

  return {
    total: webhooks.length,
    passed,
    failed,
    skipped,
    results,
    duration: Date.now() - startTime
  };
}

/**
 * Format webhook test results for CLI output
 */
export function formatWebhookTestResults(summary: WebhookTestSummary): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('🔗 Webhook Test Results');
  lines.push('══════════════════════════════════════════════════');
  lines.push('');

  if (summary.total === 0) {
    lines.push('No webhooks found in workflow.');
    return lines.join('\n');
  }

  for (const result of summary.results) {
    const icon = result.success ? '✅' : '❌';
    const status = result.statusCode ? `[${result.statusCode}]` : '[ERROR]';
    const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';

    lines.push(`${icon} ${result.webhook.name}`);
    lines.push(`   ${result.method} ${result.url}`);
    lines.push(`   Status: ${status}  Time: ${time}`);

    if (result.error) {
      lines.push(`   Error: ${result.error}`);
    }

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        lines.push(`   ⚠️  ${warning}`);
      }
    }

    if (result.recommendations.length > 0) {
      for (const rec of result.recommendations) {
        lines.push(`   💡 ${rec}`);
      }
    }

    lines.push('');
  }

  lines.push('──────────────────────────────────────────────────');
  lines.push(`Total: ${summary.total}  Passed: ${summary.passed}  Failed: ${summary.failed}  Skipped: ${summary.skipped}`);
  lines.push(`Duration: ${summary.duration}ms`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Export test results as JSON
 */
export function webhookTestResultsToJson(summary: WebhookTestSummary): string {
  return JSON.stringify({
    $schema: 'https://raw.githubusercontent.com/anthropics/agentic-qe/main/packages/n8n-validator/schema/webhook-test.json',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      duration: summary.duration
    },
    results: summary.results.map(r => ({
      webhook: {
        name: r.webhook.name,
        path: r.webhook.path,
        method: r.webhook.httpMethod,
        authentication: r.webhook.authentication
      },
      success: r.success,
      statusCode: r.statusCode,
      responseTime: r.responseTime,
      url: r.url,
      error: r.error,
      warnings: r.warnings,
      recommendations: r.recommendations
    }))
  }, null, 2);
}
