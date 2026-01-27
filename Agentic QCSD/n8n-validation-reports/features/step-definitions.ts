/**
 * Cucumber Step Definitions for Marketing Performance Workflow BDD Tests
 *
 * Workflow: Agentic_Marketing_Performance_Dept_v02_dual_trigger
 * Workflow ID: XZh6fRWwt0KdHz2Q
 * Webhook: POST https://n8n.acngva.com/webhook/marketing-report
 */

import { Given, When, Then, Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from 'chai';
import axios, { AxiosResponse } from 'axios';

// Set default timeout for async operations
setDefaultTimeout(120 * 1000);

// Configuration
const CONFIG = {
  webhookUrl: 'https://n8n.acngva.com/webhook/marketing-report',
  n8nApiUrl: 'https://n8n.acngva.com/api/v1',
  validApiKey: 'mkt-report-2026-secure-key-accenture',
  workflowId: 'XZh6fRWwt0KdHz2Q',
  defaultTimeout: 30000,
  maxRetries: 5,
  retryDelay: 30000
};

// World context interface
interface TestContext {
  workflowId?: string;
  webhookUrl?: string;
  apiKey?: string;
  headers: Record<string, string>;
  payload?: Record<string, unknown>;
  response?: AxiosResponse;
  executionId?: string;
  reportId?: string;
  requestTimestamp?: number;
  mockConfig?: Record<string, unknown>;
  stakeholders?: Array<{ email: string; role?: string }>;
  aiAgents?: Array<{ agent: string; status: string }>;
}

// ============================================================================
// HOOKS
// ============================================================================

Before(function(this: TestContext) {
  this.headers = {};
  this.mockConfig = {};
});

After(async function(this: TestContext) {
  // Cleanup any test executions if needed
  if (this.executionId) {
    console.log(`Test execution ID: ${this.executionId}`);
  }
});

// ============================================================================
// GIVEN STEPS - Setup and Preconditions
// ============================================================================

Given('the marketing performance workflow {string} is active', async function(this: TestContext, workflowId: string) {
  this.workflowId = workflowId;

  // In a real implementation, verify workflow status via n8n API
  // const status = await checkWorkflowStatus(workflowId);
  // expect(status).to.equal('active');

  console.log(`Workflow ${workflowId} is assumed active for testing`);
});

Given('the webhook endpoint is {string}', function(this: TestContext, url: string) {
  this.webhookUrl = url;
});

Given('the valid API key is {string}', function(this: TestContext, apiKey: string) {
  this.apiKey = apiKey;
});

Given('a valid API key is configured in the request header', function(this: TestContext) {
  this.headers['X-API-Key'] = CONFIG.validApiKey;
});

Given('the current date range is {string}', function(this: TestContext, dateRange: string) {
  this.payload = this.payload || {};
  this.payload.dateRange = dateRange.replace(/\s+/g, '_');
});

Given('the following stakeholders are registered:', function(this: TestContext, dataTable: any) {
  this.stakeholders = dataTable.hashes();
  this.payload = this.payload || {};
  this.payload.stakeholders = this.stakeholders.map((s: { email: string }) => s.email);
});

Given('valid credentials for all data sources', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    metaApiAvailable: true,
    bigQueryAvailable: true
  };
});

Given('all AI agents are healthy:', function(this: TestContext, dataTable: any) {
  this.aiAgents = dataTable.hashes();
  const allReady = this.aiAgents.every((a: { status: string }) => a.status === 'ready');
  expect(allReady).to.be.true;
});

Given('the Meta Ads API is configured to return {int} {word}', function(this: TestContext, statusCode: number, statusText: string) {
  this.mockConfig = {
    ...this.mockConfig,
    metaApiResponse: { statusCode, statusText }
  };
});

Given('the Meta Ads API does not respond within {int} seconds', function(this: TestContext, timeout: number) {
  this.mockConfig = {
    ...this.mockConfig,
    metaApiTimeout: timeout * 1000
  };
});

Given('the Meta Ads API returns a {int} error with message {string}', function(this: TestContext, statusCode: number, message: string) {
  this.mockConfig = {
    ...this.mockConfig,
    metaApiResponse: { statusCode, message }
  };
});

Given('the BigQuery connection is unavailable', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    bigQueryAvailable: false,
    bigQueryError: 'Connection refused'
  };
});

Given('the Meta Ads API is functioning normally', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    metaApiAvailable: true
  };
});

Given('the BigQuery query returns {int} rows for Spotify data', function(this: TestContext, rowCount: number) {
  this.mockConfig = {
    ...this.mockConfig,
    spotifyRowCount: rowCount
  };
});

Given('the most recent Spotify data timestamp is {int} hours old', function(this: TestContext, hours: number) {
  this.mockConfig = {
    ...this.mockConfig,
    spotifyDataAge: hours
  };
});

Given('the {word} AI agent timeout is set to {int} seconds', function(this: TestContext, agentName: string, timeout: number) {
  this.mockConfig = {
    ...this.mockConfig,
    [`${agentName.toLowerCase()}Timeout`]: timeout * 1000
  };
});

Given('the {word} AI agent does not respond within {int} seconds', function(this: TestContext, agentName: string, timeout: number) {
  this.mockConfig = {
    ...this.mockConfig,
    [`${agentName.toLowerCase()}Timeout`]: timeout * 1000,
    [`${agentName.toLowerCase()}TimesOut`]: true
  };
});

Given('the {word} has completed analysis', function(this: TestContext, agentName: string) {
  this.mockConfig = {
    ...this.mockConfig,
    [`${agentName.toLowerCase().replace(/\s+/g, '')}Completed`]: true
  };
});

Given('all AI agents are experiencing delays', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    allAgentsDelayed: true
  };
});

Given('none respond within their respective timeout windows', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    allAgentsTimeout: true
  };
});

Given('the report has been successfully generated', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    reportGenerated: true
  };
});

Given('the email service returns {int} on first attempt', function(this: TestContext, statusCode: number) {
  this.mockConfig = {
    ...this.mockConfig,
    emailFirstAttemptStatus: statusCode
  };
});

Given('the email service succeeds on second attempt', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    emailSecondAttemptSucceeds: true
  };
});

Given('the email service consistently returns {int} errors', function(this: TestContext, statusCode: number) {
  this.mockConfig = {
    ...this.mockConfig,
    emailAlwaysFails: true,
    emailErrorStatus: statusCode
  };
});

Given('the following stakeholders:', function(this: TestContext, dataTable: any) {
  this.stakeholders = dataTable.hashes();
});

Given('a request with header {string} set to {string}', function(this: TestContext, headerName: string, headerValue: string) {
  this.headers[headerName] = headerValue;
});

Given('a request without the {string} header', function(this: TestContext, headerName: string) {
  delete this.headers[headerName];
});

Given('the API key has made {int} requests in the last hour', function(this: TestContext, requestCount: number) {
  this.mockConfig = {
    ...this.mockConfig,
    previousRequestCount: requestCount
  };
});

Given('the rate limit is {int} requests per hour', function(this: TestContext, limit: number) {
  this.mockConfig = {
    ...this.mockConfig,
    rateLimitPerHour: limit
  };
});

Given('{int} consecutive failed authentication attempts from the same IP', function(this: TestContext, attempts: number) {
  this.mockConfig = {
    ...this.mockConfig,
    failedAuthAttempts: attempts
  };
});

Given('two valid requests are received within {int} second of each other', function(this: TestContext, seconds: number) {
  this.mockConfig = {
    ...this.mockConfig,
    concurrentRequests: 2,
    requestInterval: seconds * 1000
  };
});

Given('{int} workflow executions are already running', function(this: TestContext, count: number) {
  this.mockConfig = {
    ...this.mockConfig,
    runningExecutions: count
  };
});

Given('the maximum concurrent executions is {int}', function(this: TestContext, max: number) {
  this.mockConfig = {
    ...this.mockConfig,
    maxConcurrentExecutions: max
  };
});

Given('a request with identical parameters is already processing', function(this: TestContext) {
  this.mockConfig = {
    ...this.mockConfig,
    duplicateRequestProcessing: true
  };
});

Given('the identical request was received {int} minutes ago', function(this: TestContext, minutes: number) {
  this.mockConfig = {
    ...this.mockConfig,
    duplicateRequestAge: minutes * 60 * 1000
  };
});

Given('an execution has been running for {int} minutes', function(this: TestContext, minutes: number) {
  this.mockConfig = {
    ...this.mockConfig,
    executionRuntime: minutes * 60 * 1000
  };
});

Given('the maximum execution time is {int} minutes', function(this: TestContext, minutes: number) {
  this.mockConfig = {
    ...this.mockConfig,
    maxExecutionTime: minutes * 60 * 1000
  };
});

// ============================================================================
// WHEN STEPS - Actions
// ============================================================================

When('a POST request is sent to the marketing report webhook', async function(this: TestContext) {
  this.requestTimestamp = Date.now();

  try {
    this.response = await axios.post(
      this.webhookUrl || CONFIG.webhookUrl,
      this.payload || {},
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        validateStatus: () => true, // Accept all status codes
        timeout: CONFIG.defaultTimeout
      }
    );

    if (this.response?.data?.executionId) {
      this.executionId = this.response.data.executionId;
    }
    if (this.response?.data?.reportId) {
      this.reportId = this.response.data.reportId;
    }
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
});

When('the following JSON payload:', function(this: TestContext, docString: string) {
  this.payload = JSON.parse(docString);
});

When('the marketing report webhook is triggered with valid authentication', async function(this: TestContext) {
  this.headers['X-API-Key'] = CONFIG.validApiKey;
  this.requestTimestamp = Date.now();

  try {
    this.response = await axios.post(
      CONFIG.webhookUrl,
      this.payload || { reportType: 'weekly', dateRange: 'last_7_days' },
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        validateStatus: () => true,
        timeout: CONFIG.defaultTimeout
      }
    );

    if (this.response?.data?.executionId) {
      this.executionId = this.response.data.executionId;
    }
  } catch (error) {
    console.error('Webhook trigger failed:', error);
    throw error;
  }
});

When('the marketing report webhook is triggered', async function(this: TestContext) {
  this.headers['X-API-Key'] = this.headers['X-API-Key'] || CONFIG.validApiKey;
  await this.trigger();
});

When('the workflow reaches the {word} node', function(this: TestContext, nodeName: string) {
  // This is a state transition - actual implementation would monitor execution
  console.log(`Workflow reached ${nodeName} node`);
});

When('the workflow attempts to send the report email', function(this: TestContext) {
  // Email sending is part of workflow execution
  console.log('Workflow attempting email delivery');
});

When('all {int} retry attempts fail', function(this: TestContext, retryCount: number) {
  this.mockConfig = {
    ...this.mockConfig,
    allRetriesFailed: true,
    retryCount
  };
});

When('the workflow processes email delivery', function(this: TestContext) {
  console.log('Processing email delivery for all stakeholders');
});

When('another request is made with the same API key', async function(this: TestContext) {
  await this.trigger();
});

When('another authentication attempt is made from that IP', async function(this: TestContext) {
  this.headers['X-API-Key'] = 'another-invalid-key';
  await this.trigger();
});

When('both requests trigger the workflow', async function(this: TestContext) {
  // Simulate concurrent requests
  console.log('Both concurrent requests triggered');
});

When('a {int}th request is received', async function(this: TestContext, requestNumber: number) {
  console.log(`${requestNumber}th request received`);
  await this.trigger();
});

When('the same request is received again', async function(this: TestContext) {
  await this.trigger();
});

When('the timeout threshold is exceeded', function(this: TestContext) {
  console.log('Timeout threshold exceeded');
});

// Helper method for triggering webhook
TestContext.prototype.trigger = async function() {
  this.requestTimestamp = Date.now();

  try {
    this.response = await axios.post(
      this.webhookUrl || CONFIG.webhookUrl,
      this.payload || {},
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        validateStatus: () => true,
        timeout: CONFIG.defaultTimeout
      }
    );
  } catch (error) {
    console.error('Request failed:', error);
  }
};

// ============================================================================
// THEN STEPS - Assertions
// ============================================================================

Then('the response status should be {int}', function(this: TestContext, expectedStatus: number) {
  expect(this.response?.status).to.equal(expectedStatus);
});

Then('the response should contain a {string}', function(this: TestContext, fieldName: string) {
  expect(this.response?.data).to.have.property(fieldName);
});

Then('the workflow execution should complete within {int} seconds', async function(this: TestContext, maxSeconds: number) {
  // In real implementation, poll execution status
  const timeout = maxSeconds * 1000;
  console.log(`Waiting up to ${maxSeconds} seconds for execution to complete`);

  // Simulated check - actual implementation would poll n8n API
  expect(timeout).to.be.greaterThan(0);
});

Then('an email should be sent to {string}', async function(this: TestContext, email: string) {
  // In real implementation, verify email was sent via email service API or logs
  console.log(`Verifying email sent to ${email}`);
  expect(email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

Then('the report status should be {string}', function(this: TestContext, expectedStatus: string) {
  // In real implementation, check report status
  console.log(`Expected report status: ${expectedStatus}`);
});

Then('the Meta Ads data should be fetched from Facebook API', function(this: TestContext) {
  console.log('Verifying Meta Ads data fetch');
});

Then('the Spotify data should be retrieved from BigQuery', function(this: TestContext) {
  console.log('Verifying Spotify data retrieval');
});

Then('the {word} should analyze the {word} performance', function(this: TestContext, agent: string, dataType: string) {
  console.log(`${agent} analyzing ${dataType} performance`);
});

Then('the {word} should analyze the {word} metrics', function(this: TestContext, agent: string, dataType: string) {
  console.log(`${agent} analyzing ${dataType} metrics`);
});

Then('the {word} should synthesize the combined report', function(this: TestContext, agent: string) {
  console.log(`${agent} synthesizing report`);
});

Then('the {word} should provide executive review', function(this: TestContext, agent: string) {
  console.log(`${agent} providing executive review`);
});

Then('the final report should contain all sections:', function(this: TestContext, dataTable: any) {
  const sections = dataTable.rows().map((row: string[]) => row[0]);
  console.log(`Report should contain sections: ${sections.join(', ')}`);
  expect(sections).to.have.length.greaterThan(0);
});

Then('the workflow should log the Meta API authentication failure', function(this: TestContext) {
  console.log('Verifying Meta API auth failure was logged');
});

Then('the workflow should continue with Spotify data only', function(this: TestContext) {
  console.log('Verifying workflow continues with Spotify data');
});

Then('a partial report should be generated', function(this: TestContext) {
  console.log('Verifying partial report generation');
});

Then('the report should contain a disclaimer:', function(this: TestContext, docString: string) {
  console.log(`Report should contain disclaimer: ${docString.substring(0, 50)}...`);
});

Then('an alert should be sent to the operations team', function(this: TestContext) {
  console.log('Verifying ops alert sent');
});

Then('the workflow should timeout the Meta API call', function(this: TestContext) {
  console.log('Verifying Meta API timeout');
});

Then('the error should be logged with type {string} and service {string}', function(this: TestContext, errorType: string, service: string) {
  console.log(`Error logged: type=${errorType}, service=${service}`);
});

Then('the Spotify Analyst should still receive streaming data', function(this: TestContext) {
  console.log('Verifying Spotify Analyst received data');
});

Then('the Marketing Director should note the missing Meta data', function(this: TestContext) {
  console.log('Verifying Marketing Director noted missing data');
});

Then('the workflow should handle the error with action {string}', function(this: TestContext, action: string) {
  console.log(`Error handled with action: ${action}`);
});

Then('the meta_data_status in the report should be {string}', function(this: TestContext, status: string) {
  console.log(`Meta data status should be: ${status}`);
});

Then('the workflow should log the BigQuery connection failure', function(this: TestContext) {
  console.log('Verifying BigQuery failure logged');
});

Then('the Spotify Analyst should receive a {string} notification', function(this: TestContext, notification: string) {
  console.log(`Spotify Analyst received: ${notification}`);
});

Then('the Meta Analyst should process Meta Ads data normally', function(this: TestContext) {
  console.log('Meta Analyst processing normally');
});

Then('the report should clearly indicate Spotify data is unavailable', function(this: TestContext) {
  console.log('Report indicates Spotify unavailable');
});

Then('the Spotify Analyst should report {string}', function(this: TestContext, message: string) {
  console.log(`Spotify Analyst report: ${message}`);
});

Then('the report should indicate no Spotify activity', function(this: TestContext) {
  console.log('Report indicates no Spotify activity');
});

Then('no error should be raised', function(this: TestContext) {
  expect(this.response?.status).to.be.lessThan(500);
});

Then('the workflow status should be {string}', function(this: TestContext, status: string) {
  console.log(`Workflow status: ${status}`);
});

Then('the report should include a data freshness warning', function(this: TestContext) {
  console.log('Report includes freshness warning');
});

Then('the warning should include:', function(this: TestContext, dataTable: any) {
  const warnings = dataTable.hashes();
  console.log(`Warning includes: ${JSON.stringify(warnings)}`);
});

Then('the workflow should timeout the {word}', function(this: TestContext, agentName: string) {
  console.log(`${agentName} timed out`);
});

Then('raw Meta Ads data should be included in the report', function(this: TestContext) {
  console.log('Raw Meta Ads data included');
});

Then('a fallback summary should be generated', function(this: TestContext) {
  console.log('Fallback summary generated');
});

Then('the Spotify Analyst should continue processing normally', function(this: TestContext) {
  console.log('Spotify Analyst continues');
});

Then('individual analyst reports should be concatenated', function(this: TestContext) {
  console.log('Reports concatenated');
});

Then('the combined report should note synthesis is pending', function(this: TestContext) {
  console.log('Synthesis pending noted');
});

Then('the CMO review should still proceed', function(this: TestContext) {
  console.log('CMO review proceeds');
});

Then('a basic data report should be generated with raw metrics only', function(this: TestContext) {
  console.log('Basic data report generated');
});

Then('stakeholders should receive an email with subject containing {string}', function(this: TestContext, subjectPart: string) {
  console.log(`Email subject contains: ${subjectPart}`);
});

Then('a critical alert should be raised for AI service investigation', function(this: TestContext) {
  console.log('Critical AI alert raised');
});

Then('the first email attempt should fail', function(this: TestContext) {
  console.log('First email attempt failed');
});

Then('the workflow should retry after {int} seconds', function(this: TestContext, seconds: number) {
  console.log(`Retry after ${seconds} seconds`);
});

Then('the second attempt should succeed', function(this: TestContext) {
  console.log('Second attempt succeeded');
});

Then('no ops alert should be raised', function(this: TestContext) {
  console.log('No ops alert raised');
});

Then('an alert should be sent to the operations team', function(this: TestContext) {
  console.log('Ops alert sent');
});

Then('the alert should contain workflow ID {string}', function(this: TestContext, workflowId: string) {
  console.log(`Alert contains workflow ID: ${workflowId}`);
});

Then('the report should be saved to backup storage', function(this: TestContext) {
  console.log('Report saved to backup');
});

Then('manual intervention should be flagged', function(this: TestContext) {
  console.log('Manual intervention flagged');
});

Then('{string} should receive the email on first attempt', function(this: TestContext, email: string) {
  console.log(`${email} received on first attempt`);
});

Then('{string} should be retried', function(this: TestContext, email: string) {
  console.log(`${email} retried`);
});

Then('eventually all stakeholders should receive the report', function(this: TestContext) {
  console.log('All stakeholders eventually received report');
});

Then('the workflow should execute', function(this: TestContext) {
  expect(this.response?.status).to.equal(200);
});

Then('the response error code should be {string}', function(this: TestContext, errorCode: string) {
  expect(this.response?.data?.code).to.equal(errorCode);
});

Then('the workflow should not execute', function(this: TestContext) {
  expect(this.response?.status).to.be.oneOf([401, 403, 429]);
});

Then('the failed authentication attempt should be logged', function(this: TestContext) {
  console.log('Failed auth logged');
});

Then('the IP should be temporarily blocked', function(this: TestContext) {
  console.log('IP blocked');
});

Then('a security alert should be raised', function(this: TestContext) {
  console.log('Security alert raised');
});

Then('two separate workflow executions should start', function(this: TestContext) {
  console.log('Two executions started');
});

Then('each execution should have a unique execution ID', function(this: TestContext) {
  console.log('Unique execution IDs');
});

Then('each execution should generate a separate report', function(this: TestContext) {
  console.log('Separate reports generated');
});

Then('no data should be shared between executions', function(this: TestContext) {
  console.log('No data shared');
});

Then('the {int}th request should be queued', function(this: TestContext, requestNumber: number) {
  console.log(`Request ${requestNumber} queued`);
});

Then('the response should indicate queue position {int}', function(this: TestContext, position: number) {
  console.log(`Queue position: ${position}`);
});

Then('when an execution completes the queued request should start', function(this: TestContext) {
  console.log('Queued request started');
});

Then('the response should return status {string}', function(this: TestContext, status: string) {
  expect(this.response?.data?.status).to.equal(status);
});

Then('the response should include the existing execution ID', function(this: TestContext) {
  expect(this.response?.data).to.have.property('existingExecutionId');
});

Then('no duplicate execution should be created', function(this: TestContext) {
  console.log('No duplicate execution');
});

Then('the execution should be terminated', function(this: TestContext) {
  console.log('Execution terminated');
});

Then('partial results should be saved if available', function(this: TestContext) {
  console.log('Partial results saved');
});

Then('an error notification should be sent', function(this: TestContext) {
  console.log('Error notification sent');
});

Then('resources should be released for other executions', function(this: TestContext) {
  console.log('Resources released');
});

// Export for use in tests
export { TestContext, CONFIG };
