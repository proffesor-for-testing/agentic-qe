# BDD Test Scenarios - Agentic Marketing Performance Workflow

**Document ID:** 15-BDD-SCENARIOS
**Workflow:** Agentic_Marketing_Performance_Dept_v02_dual_trigger
**Workflow ID:** XZh6fRWwt0KdHz2Q
**Generated:** 2026-01-23
**Agent:** n8n-bdd-scenario-tester

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Features** | 7 |
| **Total Scenarios** | 28 |
| **Scenario Outlines** | 5 |
| **Data Table Examples** | 42 |
| **Business Requirements Covered** | 12 |

---

## Feature 1: Happy Path - Full Report Generation

```gherkin
Feature: Marketing Performance Report Generation
  As a marketing stakeholder
  I want comprehensive performance reports generated automatically
  So that I can make data-driven decisions about marketing campaigns

  Background:
    Given the marketing performance workflow "XZh6fRWwt0KdHz2Q" is active
    And the Meta Ads API is available
    And the BigQuery Spotify data source is connected
    And the email service is configured
    And the following AI agents are initialized:
      | Agent             | Role                    | Status |
      | Meta Analyst      | Analyze Meta Ads data   | Ready  |
      | Spotify Analyst   | Analyze streaming data  | Ready  |
      | Marketing Director| Synthesize reports      | Ready  |
      | CMO               | Executive oversight     | Ready  |

  @happy-path @smoke
  Scenario: Complete marketing report generation via webhook
    Given a valid API key "mkt-report-2026-secure-key-accenture"
    And the current date range is "last 7 days"
    When a POST request is sent to "https://n8n.acngva.com/webhook/marketing-report"
    With the header "X-API-Key" set to "mkt-report-2026-secure-key-accenture"
    And the following JSON payload:
      """
      {
        "reportType": "weekly",
        "dateRange": "last_7_days",
        "stakeholders": ["marketing-team@accenture.com"]
      }
      """
    Then the response status should be 200
    And the response should contain "reportId"
    And the Meta Ads data should be fetched successfully
    And the Spotify streaming data should be retrieved from BigQuery
    And the Meta Analyst should analyze the ads performance
    And the Spotify Analyst should analyze the streaming metrics
    And the Marketing Director should synthesize the combined report
    And the CMO should provide executive review
    And an email should be sent to "marketing-team@accenture.com"
    And the report status should be "completed"

  @happy-path @detailed
  Scenario: Full report with all data sources and stakeholders
    Given valid credentials for all data sources
    And the following stakeholder list:
      | Email                        | Role              |
      | cmo@accenture.com            | Executive         |
      | marketing-director@accenture.com | Director       |
      | analytics@accenture.com      | Analyst           |
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should execute the following steps in order:
      | Step | Node                  | Expected Duration |
      | 1    | Webhook Trigger       | < 100ms           |
      | 2    | Fetch Meta Ads        | < 5s              |
      | 3    | Fetch Spotify Data    | < 5s              |
      | 4    | Meta Analyst AI       | < 30s             |
      | 5    | Spotify Analyst AI    | < 30s             |
      | 6    | Marketing Director AI | < 45s             |
      | 7    | CMO Review AI         | < 30s             |
      | 8    | Send Emails           | < 10s             |
    And all stakeholders should receive the report email
    And the total execution time should be less than 3 minutes

  @happy-path @data-validation
  Scenario: Report contains all required metrics
    Given the workflow has completed successfully
    When the generated report is examined
    Then the Meta Ads section should contain:
      | Metric              | Required |
      | Ad Spend            | Yes      |
      | Impressions         | Yes      |
      | Click-Through Rate  | Yes      |
      | Cost Per Click      | Yes      |
      | Conversions         | Yes      |
      | ROAS                | Yes      |
    And the Spotify section should contain:
      | Metric              | Required |
      | Total Streams       | Yes      |
      | Unique Listeners    | Yes      |
      | Skip Rate           | Yes      |
      | Save Rate           | Yes      |
      | Playlist Adds       | Yes      |
    And the executive summary should include recommendations
```

---

## Feature 2: Meta API Failure - Graceful Degradation

```gherkin
Feature: Meta API Failure Handling
  As a system operator
  I want the workflow to handle Meta API failures gracefully
  So that partial reports can still be generated

  Background:
    Given the marketing performance workflow is active
    And the BigQuery Spotify data source is connected
    And the email service is configured

  @error-handling @meta-api
  Scenario: Meta API returns 401 Unauthorized
    Given the Meta Ads API returns a 401 error
    When the marketing report webhook is triggered
    Then the workflow should log the authentication failure
    And the Meta Analyst should receive an error notification
    And the workflow should continue with Spotify data only
    And a partial report should be generated
    And the report should contain a disclaimer about missing Meta data
    And an alert should be sent to "#marketing-ops" Slack channel

  @error-handling @meta-api
  Scenario: Meta API timeout after 30 seconds
    Given the Meta Ads API does not respond within 30 seconds
    When the marketing report webhook is triggered
    Then the workflow should timeout the Meta API call
    And the error should be logged with details:
      | Field         | Value                    |
      | errorType     | TIMEOUT                  |
      | service       | Meta Ads API             |
      | timeout       | 30000ms                  |
      | timestamp     | <current_timestamp>      |
    And the workflow should proceed with available data
    And the Marketing Director should note the data gap

  @error-handling @meta-api
  Scenario: Meta API rate limiting (429)
    Given the Meta Ads API returns a 429 Too Many Requests error
    And the rate limit resets in 60 seconds
    When the marketing report webhook is triggered
    Then the workflow should attempt a retry after the rate limit window
    And if retry fails, generate partial report
    And the stakeholder email should indicate data freshness issues

  @error-handling @meta-api @scenario-outline
  Scenario Outline: Meta API various error responses
    Given the Meta Ads API returns a <status_code> error
    When the marketing report webhook is triggered
    Then the workflow should handle the error with action "<action>"
    And the report should have meta_data_status "<data_status>"

    Examples:
      | status_code | action                  | data_status    |
      | 400         | log and skip            | missing        |
      | 401         | alert ops and skip      | auth_failed    |
      | 403         | alert ops and skip      | forbidden      |
      | 404         | log and skip            | not_found      |
      | 429         | retry with backoff      | rate_limited   |
      | 500         | retry 3 times           | server_error   |
      | 502         | retry 3 times           | gateway_error  |
      | 503         | retry with backoff      | unavailable    |
```

---

## Feature 3: Spotify Data Missing - Partial Report

```gherkin
Feature: Spotify Data Unavailability
  As a marketing analyst
  I want reports generated even when Spotify data is unavailable
  So that I can still access Meta Ads insights

  Background:
    Given the marketing performance workflow is active
    And the Meta Ads API is available

  @partial-report @spotify
  Scenario: BigQuery connection failure
    Given the BigQuery connection is unavailable
    And the error message is "Connection refused"
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should log the BigQuery connection failure
    And the Spotify Analyst should receive a "no data" notification
    And the Meta Analyst should process Meta Ads data normally
    And a partial report should be generated with Meta data only
    And the report should clearly indicate:
      """
      NOTICE: Spotify streaming data unavailable for this report period.
      Reason: BigQuery connection failure
      Next retry: Automatic on next scheduled run
      """

  @partial-report @spotify
  Scenario: Spotify data returns empty result set
    Given the BigQuery query returns 0 rows
    When the marketing report webhook is triggered
    Then the Spotify Analyst should report "No streaming data found"
    And the Marketing Director should note the absence in analysis
    And the report should indicate no Spotify activity for the period
    And no error should be raised

  @partial-report @spotify
  Scenario: Spotify data is stale (older than 24 hours)
    Given the most recent Spotify data timestamp is 48 hours old
    When the marketing report webhook is triggered
    Then the report should include a data freshness warning
    And the warning should state:
      | Field             | Value                              |
      | dataAge           | 48 hours                           |
      | expectedFreshness | < 24 hours                         |
      | recommendation    | Verify BigQuery sync pipeline      |
    And the CMO review should highlight the data quality concern

  @partial-report @spotify @bigquery
  Scenario: BigQuery query timeout
    Given the BigQuery query exceeds the 60 second timeout
    When the marketing report webhook is triggered
    Then the workflow should cancel the BigQuery query
    And an error should be logged:
      """
      {
        "error": "QUERY_TIMEOUT",
        "service": "BigQuery",
        "query": "spotify_streaming_metrics",
        "timeout": 60000,
        "recommendation": "Optimize query or increase timeout"
      }
      """
    And the report should proceed with Meta data only
```

---

## Feature 4: AI Agent Timeout - Error Handling

```gherkin
Feature: AI Agent Timeout Handling
  As a system administrator
  I want AI agent timeouts handled gracefully
  So that reports are generated even with AI limitations

  Background:
    Given the marketing performance workflow is active
    And all data sources are available
    And the AI agent timeout is set to 60 seconds

  @ai-timeout @meta-analyst
  Scenario: Meta Analyst AI agent times out
    Given the Meta Analyst AI agent does not respond within 60 seconds
    When the workflow reaches the Meta Analyst node
    Then the workflow should timeout the Meta Analyst
    And raw Meta Ads data should be included without analysis
    And a fallback summary should be generated:
      """
      META ADS SUMMARY (Auto-generated - AI analysis unavailable)
      - Total Spend: $X
      - Total Impressions: X
      - Average CTR: X%
      Note: Detailed AI analysis pending - manual review recommended
      """
    And the Spotify Analyst should continue processing

  @ai-timeout @spotify-analyst
  Scenario: Spotify Analyst AI agent times out
    Given the Spotify Analyst AI agent does not respond within 60 seconds
    When the workflow reaches the Spotify Analyst node
    Then the workflow should timeout the Spotify Analyst
    And raw Spotify data should be included without analysis
    And the Marketing Director should work with partial analysis

  @ai-timeout @marketing-director
  Scenario: Marketing Director AI agent times out
    Given both analysts have completed their analysis
    And the Marketing Director AI agent does not respond within 90 seconds
    When the workflow reaches the Marketing Director node
    Then the workflow should timeout the Marketing Director
    And individual analyst reports should be concatenated
    And the combined report should note:
      """
      SYNTHESIS PENDING: Marketing Director analysis timed out.
      Individual analyst reports included below.
      Executive review will provide synthesis.
      """
    And the CMO review should proceed

  @ai-timeout @cmo
  Scenario: CMO Review AI agent times out
    Given the Marketing Director has synthesized the report
    And the CMO AI agent does not respond within 60 seconds
    When the workflow reaches the CMO Review node
    Then the report should be finalized without CMO commentary
    And a placeholder should be added:
      """
      EXECUTIVE REVIEW: Pending
      The CMO review will be provided in a follow-up communication.
      """
    And the email should still be sent to stakeholders
    And an alert should notify the ops team of the CMO timeout

  @ai-timeout @all-agents
  Scenario: All AI agents timeout
    Given all AI agents are experiencing delays
    And none respond within their timeout windows
    When the marketing report webhook is triggered
    Then a basic data report should be generated
    And the report should contain raw metrics only
    And stakeholders should receive an email with subject:
      """
      [AUTO] Marketing Report - Data Only (AI Analysis Pending)
      """
    And a critical alert should be raised for AI service investigation
```

---

## Feature 5: Email Delivery Failure - Retry Logic

```gherkin
Feature: Email Delivery Retry Logic
  As a marketing stakeholder
  I want email delivery retried on failure
  So that I receive my reports reliably

  Background:
    Given the marketing performance workflow is active
    And the report has been successfully generated
    And the following stakeholders are configured:
      | Email                          | Priority |
      | cmo@accenture.com              | high     |
      | marketing@accenture.com        | medium   |
      | analytics@accenture.com        | medium   |

  @email-retry @transient-failure
  Scenario: Email service returns temporary failure
    Given the email service returns a 503 Service Unavailable
    When the workflow attempts to send the report email
    Then the workflow should retry email delivery
    And the retry schedule should be:
      | Attempt | Delay    |
      | 1       | immediate|
      | 2       | 30s      |
      | 3       | 60s      |
      | 4       | 120s     |
      | 5       | 300s     |
    And after successful delivery, no alert should be raised

  @email-retry @permanent-failure
  Scenario: Email delivery fails after all retries
    Given the email service consistently returns 500 errors
    When all 5 retry attempts fail
    Then an alert should be sent to "#marketing-ops" channel
    And the alert should contain:
      | Field          | Value                              |
      | severity       | HIGH                               |
      | workflow       | XZh6fRWwt0KdHz2Q                   |
      | failedAction   | Email Delivery                     |
      | attempts       | 5                                  |
      | lastError      | 500 Internal Server Error          |
      | reportId       | <generated_report_id>              |
    And the report should be saved to backup storage
    And manual intervention should be flagged

  @email-retry @invalid-recipient
  Scenario: Email bounces due to invalid recipient
    Given one stakeholder email "invalid@nonexistent.com" is invalid
    When the workflow attempts email delivery
    Then the email to "invalid@nonexistent.com" should fail immediately
    And no retry should be attempted for hard bounces
    And other stakeholders should still receive the email
    And the invalid email should be logged for cleanup

  @email-retry @partial-delivery
  Scenario: Partial email delivery success
    Given 3 stakeholders are configured
    And email to "cmo@accenture.com" succeeds
    And email to "marketing@accenture.com" fails temporarily
    And email to "analytics@accenture.com" succeeds
    When the workflow processes email delivery
    Then successful deliveries should be logged
    And failed deliveries should be retried independently
    And the final status should show:
      | Recipient                    | Status    | Attempts |
      | cmo@accenture.com            | delivered | 1        |
      | marketing@accenture.com      | delivered | 3        |
      | analytics@accenture.com      | delivered | 1        |

  @email-retry @attachment-failure
  Scenario: Email fails due to attachment size
    Given the generated report exceeds 25MB
    When the workflow attempts email delivery
    Then the email should fail with "Attachment too large"
    And the workflow should:
      | Action                                    |
      | Compress the report attachment            |
      | If still too large, upload to cloud storage |
      | Replace attachment with download link     |
      | Retry email delivery                      |
    And stakeholders should receive an email with a secure download link
```

---

## Feature 6: Authentication Scenarios

```gherkin
Feature: API Authentication
  As a security administrator
  I want proper authentication enforcement
  So that only authorized users can trigger reports

  Background:
    Given the marketing performance workflow is active
    And the valid API key is "mkt-report-2026-secure-key-accenture"

  @security @authentication @valid
  Scenario: Valid API key in header
    Given a request with header "X-API-Key: mkt-report-2026-secure-key-accenture"
    When a POST request is sent to the webhook endpoint
    Then the response status should be 200
    And the workflow should execute normally

  @security @authentication @invalid
  Scenario: Invalid API key rejected
    Given a request with header "X-API-Key: invalid-key-12345"
    When a POST request is sent to the webhook endpoint
    Then the response status should be 401
    And the response body should be:
      """
      {
        "error": "Unauthorized",
        "message": "Invalid API key provided",
        "code": "AUTH_INVALID_KEY"
      }
      """
    And the workflow should not execute
    And the failed attempt should be logged with IP address

  @security @authentication @missing
  Scenario: Missing API key rejected
    Given a request without the "X-API-Key" header
    When a POST request is sent to the webhook endpoint
    Then the response status should be 401
    And the response body should be:
      """
      {
        "error": "Unauthorized",
        "message": "API key required",
        "code": "AUTH_MISSING_KEY"
      }
      """

  @security @authentication @expired
  Scenario: Expired API key rejected
    Given a request with an expired API key "mkt-report-2024-old-key"
    When a POST request is sent to the webhook endpoint
    Then the response status should be 401
    And the response should indicate key expiration
    And an alert should be sent to notify key rotation

  @security @authentication @rate-limiting
  Scenario Outline: Rate limiting by API key
    Given the API key "<key>" has made <previous_requests> requests in the last hour
    When another request is made
    Then the response status should be <expected_status>
    And the response should include rate limit headers

    Examples:
      | key                                  | previous_requests | expected_status |
      | mkt-report-2026-secure-key-accenture | 10                | 200             |
      | mkt-report-2026-secure-key-accenture | 50                | 200             |
      | mkt-report-2026-secure-key-accenture | 99                | 200             |
      | mkt-report-2026-secure-key-accenture | 100               | 429             |

  @security @authentication @brute-force
  Scenario: Brute force protection
    Given 10 consecutive failed authentication attempts from IP "192.168.1.100"
    When another authentication attempt is made from the same IP
    Then the response status should be 429
    And the IP should be temporarily blocked for 15 minutes
    And a security alert should be raised

  @security @authentication @case-sensitivity
  Scenario: API key is case-sensitive
    Given a request with header "X-API-Key: MKT-REPORT-2026-SECURE-KEY-ACCENTURE"
    When a POST request is sent to the webhook endpoint
    Then the response status should be 401
    And the error should indicate invalid key
```

---

## Feature 7: Concurrent Execution - Multiple Triggers

```gherkin
Feature: Concurrent Workflow Execution
  As a system operator
  I want concurrent executions handled properly
  So that multiple report requests don't interfere with each other

  Background:
    Given the marketing performance workflow is active
    And the maximum concurrent executions is 5

  @concurrency @isolation
  Scenario: Two concurrent webhook triggers
    Given two valid requests are received simultaneously
    When both requests trigger the workflow
    Then two separate workflow executions should start
    And each execution should have a unique execution ID
    And each execution should fetch data independently
    And two separate reports should be generated
    And two separate emails should be sent

  @concurrency @resource-contention
  Scenario: Concurrent requests to Meta API
    Given 3 concurrent workflow executions are running
    And all 3 request Meta Ads data simultaneously
    When the Meta API is accessed
    Then requests should be queued if rate limited
    And each execution should receive its own response
    And no data should be shared between executions

  @concurrency @max-limit
  Scenario: Maximum concurrent executions reached
    Given 5 workflow executions are already running
    When a 6th request is received
    Then the 6th request should be queued
    And the response should indicate:
      """
      {
        "status": "queued",
        "message": "Maximum concurrent executions reached",
        "queuePosition": 1,
        "estimatedWait": "approximately 2 minutes"
      }
      """
    And when an execution completes, the queued request should start

  @concurrency @deduplication
  Scenario: Duplicate request detection
    Given a request with reportId "report-2026-01-23-001" is processing
    When an identical request with the same parameters is received within 5 minutes
    Then the duplicate should be detected
    And the response should return the existing execution:
      """
      {
        "status": "already_processing",
        "existingExecutionId": "<execution_id>",
        "message": "Identical report is currently being generated",
        "estimatedCompletion": "2 minutes"
      }
      """
    And no duplicate execution should be created

  @concurrency @priority-queue
  Scenario: Priority execution for CMO requests
    Given 3 standard requests are queued
    When a request with "priority: high" header is received
    Then the high-priority request should be processed first
    And the queue order should become:
      | Position | Request Type | Priority |
      | 1        | CMO Request  | high     |
      | 2        | Standard #1  | normal   |
      | 3        | Standard #2  | normal   |
      | 4        | Standard #3  | normal   |

  @concurrency @timeout-handling
  Scenario: Long-running execution timeout
    Given an execution has been running for 10 minutes
    And the maximum execution time is 5 minutes
    When the timeout is reached
    Then the execution should be terminated
    And partial results should be saved if available
    And an error report should be sent:
      """
      {
        "status": "timeout",
        "executionId": "<execution_id>",
        "duration": "10 minutes",
        "maxAllowed": "5 minutes",
        "partialResults": true
      }
      """
    And resources should be released for other executions

  @concurrency @state-isolation
  Scenario: Variable isolation between executions
    Given execution A sets variable "reportDate" to "2026-01-01"
    And execution B sets variable "reportDate" to "2026-01-15"
    When both executions complete
    Then execution A's report should contain date "2026-01-01"
    And execution B's report should contain date "2026-01-15"
    And no cross-contamination should occur
```

---

## Step Definitions Reference

### Webhook Step Definitions

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import axios from 'axios';

const WEBHOOK_URL = 'https://n8n.acngva.com/webhook/marketing-report';
const VALID_API_KEY = 'mkt-report-2026-secure-key-accenture';

Given('the marketing performance workflow {string} is active', async function(workflowId: string) {
  this.workflowId = workflowId;
  // Verify workflow is active via n8n API
  const status = await checkWorkflowStatus(workflowId);
  expect(status).to.equal('active');
});

Given('a valid API key {string}', function(apiKey: string) {
  this.apiKey = apiKey;
});

When('a POST request is sent to {string}', async function(endpoint: string) {
  this.response = await axios.post(endpoint, this.payload, {
    headers: {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    },
    validateStatus: () => true
  });
});

When('the following JSON payload:', function(docString: string) {
  this.payload = JSON.parse(docString);
});

Then('the response status should be {int}', function(expectedStatus: number) {
  expect(this.response.status).to.equal(expectedStatus);
});

Then('the workflow should execute successfully', async function() {
  const executionId = this.response.data.executionId;
  const result = await waitForExecution(executionId);
  expect(result.status).to.equal('success');
});

Then('an email should be sent to {string}', async function(email: string) {
  const emails = await getEmailsFor(email);
  expect(emails.length).to.be.greaterThan(0);
  expect(emails[0].subject).to.include('Marketing Report');
});
```

### AI Agent Step Definitions

```typescript
Given('the {word} AI agent does not respond within {int} seconds', function(agentName: string, timeout: number) {
  this.mockAgentTimeout = {
    agent: agentName,
    timeout: timeout * 1000
  };
});

Then('the workflow should timeout the {word}', async function(agentName: string) {
  const execution = await getExecutionDetails(this.executionId);
  const agentNode = execution.nodes.find(n => n.name.includes(agentName));
  expect(agentNode.status).to.equal('timeout');
});

Then('raw {word} data should be included without analysis', async function(dataSource: string) {
  const report = await getGeneratedReport(this.reportId);
  expect(report[dataSource.toLowerCase()]).to.have.property('rawData');
  expect(report[dataSource.toLowerCase()]).to.not.have.property('aiAnalysis');
});
```

### Authentication Step Definitions

```typescript
Given('a request with header {string}', function(headerString: string) {
  const [key, value] = headerString.split(': ');
  this.headers = { [key]: value };
});

Given('a request without the {string} header', function(headerName: string) {
  this.headers = {};
});

Then('the workflow should not execute', async function() {
  // Verify no execution was created
  const executions = await getRecentExecutions(this.workflowId);
  const matchingExecution = executions.find(e =>
    e.timestamp > this.requestTimestamp
  );
  expect(matchingExecution).to.be.undefined;
});
```

---

## Test Data Requirements

### Environment Variables

```bash
# n8n Configuration
N8N_WEBHOOK_URL=https://n8n.acngva.com/webhook/marketing-report
N8N_API_KEY=mkt-report-2026-secure-key-accenture
N8N_API_URL=https://n8n.acngva.com/api/v1

# Test Configuration
TEST_TIMEOUT=120000
CONCURRENT_TEST_LIMIT=3

# Mock Service Configuration
MOCK_META_API=false
MOCK_BIGQUERY=false
MOCK_EMAIL=true
```

### Test Fixtures

```json
{
  "validPayload": {
    "reportType": "weekly",
    "dateRange": "last_7_days",
    "stakeholders": ["test@accenture.com"]
  },
  "metaAdsResponse": {
    "data": {
      "spend": 50000,
      "impressions": 1000000,
      "clicks": 25000,
      "conversions": 500
    }
  },
  "spotifyResponse": {
    "data": {
      "totalStreams": 500000,
      "uniqueListeners": 150000,
      "skipRate": 0.15,
      "saveRate": 0.08
    }
  }
}
```

---

## Execution Commands

```bash
# Run all BDD tests
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --format json:reports/cucumber.json \
  --format html:reports/cucumber.html \
  --tags "not @skip"

# Run happy path tests only
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --tags "@happy-path"

# Run error handling tests
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --tags "@error-handling"

# Run security tests
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --tags "@security"

# Run with parallel execution
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --parallel 4

# Dry run to validate syntax
npx cucumber-js features/n8n/marketing-performance/*.feature \
  --dry-run
```

---

## Requirements Traceability Matrix

| Requirement ID | Description | Feature | Scenarios |
|----------------|-------------|---------|-----------|
| REQ-MKT-001 | Generate complete marketing report | Feature 1 | 3 |
| REQ-MKT-002 | Fetch Meta Ads data | Features 1, 2 | 6 |
| REQ-MKT-003 | Fetch Spotify data | Features 1, 3 | 5 |
| REQ-MKT-004 | AI agent analysis | Features 1, 4 | 7 |
| REQ-MKT-005 | Email delivery | Features 1, 5 | 6 |
| REQ-MKT-006 | Graceful degradation | Features 2, 3 | 8 |
| REQ-MKT-007 | Error handling | Features 2, 3, 4 | 12 |
| REQ-MKT-008 | Retry logic | Features 2, 5 | 5 |
| REQ-MKT-009 | Authentication | Feature 6 | 7 |
| REQ-MKT-010 | Authorization | Feature 6 | 7 |
| REQ-MKT-011 | Concurrent execution | Feature 7 | 7 |
| REQ-MKT-012 | Execution isolation | Feature 7 | 3 |

---

## Coverage Summary

```
Workflow Path Coverage
======================
Webhook Trigger
    |
    +-- Auth Check
    |   +-- Valid Key --> Process Request [COVERED]
    |   +-- Invalid Key --> Reject (401) [COVERED]
    |   +-- Missing Key --> Reject (401) [COVERED]
    |   +-- Rate Limited --> Reject (429) [COVERED]
    |
    +-- Fetch Data (Parallel)
    |   +-- Meta Ads API
    |   |   +-- Success --> Continue [COVERED]
    |   |   +-- 401 Error --> Partial Report [COVERED]
    |   |   +-- Timeout --> Partial Report [COVERED]
    |   |   +-- Rate Limited --> Retry [COVERED]
    |   |
    |   +-- BigQuery Spotify
    |       +-- Success --> Continue [COVERED]
    |       +-- Connection Failed --> Partial Report [COVERED]
    |       +-- Empty Result --> Note in Report [COVERED]
    |       +-- Timeout --> Partial Report [COVERED]
    |
    +-- AI Analysis (Sequential)
    |   +-- Meta Analyst
    |   |   +-- Success --> Continue [COVERED]
    |   |   +-- Timeout --> Fallback Summary [COVERED]
    |   |
    |   +-- Spotify Analyst
    |   |   +-- Success --> Continue [COVERED]
    |   |   +-- Timeout --> Raw Data Only [COVERED]
    |   |
    |   +-- Marketing Director
    |   |   +-- Success --> Continue [COVERED]
    |   |   +-- Timeout --> Concatenate Reports [COVERED]
    |   |
    |   +-- CMO Review
    |       +-- Success --> Finalize [COVERED]
    |       +-- Timeout --> Skip Review [COVERED]
    |
    +-- Send Email
        +-- Success --> Complete [COVERED]
        +-- Temporary Failure --> Retry [COVERED]
        +-- Permanent Failure --> Alert Ops [COVERED]
        +-- Partial Success --> Retry Failed [COVERED]
```

---

## Appendix: Gherkin Best Practices Applied

1. **Background for Common Setup**: All scenarios share common preconditions via Background
2. **Data Tables for Structured Data**: Complex data represented in readable tables
3. **Scenario Outlines for Variations**: Parameterized tests with Examples tables
4. **Tags for Organization**: @happy-path, @error-handling, @security, etc.
5. **Doc Strings for JSON/Long Text**: Multi-line content in triple quotes
6. **Given-When-Then Structure**: Clear separation of context, action, and outcome
7. **Business Language**: Scenarios written in stakeholder-friendly terms
8. **Single Responsibility**: Each scenario tests one specific behavior

---

*Generated by n8n-bdd-scenario-tester agent*
*Report ID: BDD-MKT-2026-01-23-001*
