@workflow @marketing-performance
Feature: Agentic Marketing Performance Report Generation
  As a marketing stakeholder at Accenture
  I want comprehensive performance reports generated automatically
  So that I can make data-driven decisions about marketing campaigns

  Background:
    Given the marketing performance workflow "XZh6fRWwt0KdHz2Q" is active
    And the webhook endpoint is "https://n8n.acngva.com/webhook/marketing-report"
    And the valid API key is "mkt-report-2026-secure-key-accenture"

  # =============================================================================
  # HAPPY PATH SCENARIOS
  # =============================================================================

  @happy-path @smoke @P0
  Scenario: Complete marketing report generation via webhook
    Given a valid API key is configured in the request header
    And the current date range is "last 7 days"
    And the following stakeholders are registered:
      | email                        | role     |
      | marketing-team@accenture.com | analyst  |
    When a POST request is sent to the marketing report webhook
    With the following JSON payload:
      """
      {
        "reportType": "weekly",
        "dateRange": "last_7_days",
        "stakeholders": ["marketing-team@accenture.com"]
      }
      """
    Then the response status should be 200
    And the response should contain a "reportId"
    And the workflow execution should complete within 180 seconds
    And an email should be sent to "marketing-team@accenture.com"
    And the report status should be "completed"

  @happy-path @full-pipeline @P0
  Scenario: Full report with all data sources and AI analysis
    Given valid credentials for all data sources
    And all AI agents are healthy:
      | agent              | status |
      | Meta Analyst       | ready  |
      | Spotify Analyst    | ready  |
      | Marketing Director | ready  |
      | CMO                | ready  |
    When the marketing report webhook is triggered with valid authentication
    Then the Meta Ads data should be fetched from Facebook API
    And the Spotify data should be retrieved from BigQuery
    And the Meta Analyst should analyze the ads performance
    And the Spotify Analyst should analyze the streaming metrics
    And the Marketing Director should synthesize the combined report
    And the CMO should provide executive review
    And the final report should contain all sections:
      | section              |
      | Executive Summary    |
      | Meta Ads Analysis    |
      | Spotify Analysis     |
      | Recommendations      |
      | CMO Commentary       |

  # =============================================================================
  # META API FAILURE SCENARIOS
  # =============================================================================

  @error-handling @meta-api @graceful-degradation @P1
  Scenario: Meta API returns 401 Unauthorized
    Given the Meta Ads API is configured to return 401 Unauthorized
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should log the Meta API authentication failure
    And the workflow should continue with Spotify data only
    And a partial report should be generated
    And the report should contain a disclaimer:
      """
      Notice: Meta Ads data unavailable for this report period.
      Reason: Authentication failure with Meta Ads API
      Impact: Report contains Spotify streaming data only.
      """
    And an alert should be sent to the operations team

  @error-handling @meta-api @timeout @P1
  Scenario: Meta API timeout after 30 seconds
    Given the Meta Ads API does not respond within 30 seconds
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should timeout the Meta API call
    And the error should be logged with type "TIMEOUT" and service "Meta Ads API"
    And the Spotify Analyst should still receive streaming data
    And the Marketing Director should note the missing Meta data

  @error-handling @meta-api @scenario-outline @P1
  Scenario Outline: Meta API various HTTP error responses
    Given the Meta Ads API returns a <status_code> error with message "<error_message>"
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should handle the error with action "<action>"
    And the meta_data_status in the report should be "<data_status>"

    Examples:
      | status_code | error_message           | action             | data_status  |
      | 400         | Bad Request             | log and skip       | missing      |
      | 401         | Unauthorized            | alert ops and skip | auth_failed  |
      | 403         | Forbidden               | alert ops and skip | forbidden    |
      | 429         | Too Many Requests       | retry with backoff | rate_limited |
      | 500         | Internal Server Error   | retry 3 times      | server_error |
      | 503         | Service Unavailable     | retry with backoff | unavailable  |

  # =============================================================================
  # SPOTIFY DATA SCENARIOS
  # =============================================================================

  @partial-report @spotify @bigquery @P1
  Scenario: BigQuery connection failure
    Given the BigQuery connection is unavailable
    And the Meta Ads API is functioning normally
    When the marketing report webhook is triggered with valid authentication
    Then the workflow should log the BigQuery connection failure
    And the Spotify Analyst should receive a "no data" notification
    And the Meta Analyst should process Meta Ads data normally
    And the report should clearly indicate Spotify data is unavailable

  @partial-report @spotify @empty-data @P2
  Scenario: Spotify data returns empty result set
    Given the BigQuery query returns 0 rows for Spotify data
    When the marketing report webhook is triggered
    Then the Spotify Analyst should report "No streaming data found for period"
    And the report should indicate no Spotify activity
    And no error should be raised
    And the workflow status should be "completed"

  @partial-report @spotify @stale-data @P2
  Scenario: Spotify data is stale (older than 24 hours)
    Given the most recent Spotify data timestamp is 48 hours old
    When the marketing report webhook is triggered
    Then the report should include a data freshness warning
    And the warning should include:
      | field             | value                              |
      | dataAge           | 48 hours                           |
      | expectedFreshness | 24 hours                           |
      | recommendation    | Verify BigQuery sync pipeline      |

  # =============================================================================
  # AI AGENT TIMEOUT SCENARIOS
  # =============================================================================

  @ai-timeout @meta-analyst @P1
  Scenario: Meta Analyst AI agent times out
    Given the Meta Analyst AI agent timeout is set to 60 seconds
    And the Meta Analyst AI agent does not respond within 60 seconds
    When the workflow reaches the Meta Analyst node
    Then the workflow should timeout the Meta Analyst
    And raw Meta Ads data should be included in the report
    And a fallback summary should be generated
    And the Spotify Analyst should continue processing normally

  @ai-timeout @marketing-director @P1
  Scenario: Marketing Director AI agent times out
    Given the Meta Analyst has completed analysis
    And the Spotify Analyst has completed analysis
    And the Marketing Director AI agent does not respond within 90 seconds
    When the workflow reaches the Marketing Director node
    Then the workflow should timeout the Marketing Director
    And individual analyst reports should be concatenated
    And the combined report should note synthesis is pending
    And the CMO review should still proceed

  @ai-timeout @all-agents @critical @P0
  Scenario: All AI agents timeout
    Given all AI agents are experiencing delays
    And none respond within their respective timeout windows
    When the marketing report webhook is triggered
    Then a basic data report should be generated with raw metrics only
    And stakeholders should receive an email with subject containing "Data Only"
    And a critical alert should be raised for AI service investigation

  # =============================================================================
  # EMAIL DELIVERY SCENARIOS
  # =============================================================================

  @email-retry @transient-failure @P1
  Scenario: Email service returns temporary failure then succeeds
    Given the report has been successfully generated
    And the email service returns 503 on first attempt
    And the email service succeeds on second attempt
    When the workflow attempts to send the report email
    Then the first email attempt should fail
    And the workflow should retry after 30 seconds
    And the second attempt should succeed
    And no ops alert should be raised

  @email-retry @permanent-failure @P1
  Scenario: Email delivery fails after all retries
    Given the report has been successfully generated
    And the email service consistently returns 500 errors
    When all 5 retry attempts fail
    Then an alert should be sent to the operations team
    And the alert should contain workflow ID "XZh6fRWwt0KdHz2Q"
    And the report should be saved to backup storage
    And manual intervention should be flagged

  @email-retry @partial-delivery @P2
  Scenario: Partial email delivery with mixed results
    Given the following stakeholders:
      | email                    | expected_result |
      | cmo@accenture.com        | success         |
      | marketing@accenture.com  | fail_then_retry |
      | analytics@accenture.com  | success         |
    When the workflow processes email delivery
    Then "cmo@accenture.com" should receive the email on first attempt
    Then "analytics@accenture.com" should receive the email on first attempt
    And "marketing@accenture.com" should be retried
    And eventually all stakeholders should receive the report

  # =============================================================================
  # AUTHENTICATION SCENARIOS
  # =============================================================================

  @security @authentication @valid @P0
  Scenario: Valid API key in X-API-Key header
    Given a request with header "X-API-Key" set to "mkt-report-2026-secure-key-accenture"
    When a POST request is sent to the marketing report webhook
    Then the response status should be 200
    And the workflow should execute

  @security @authentication @invalid @P0
  Scenario: Invalid API key rejected with 401
    Given a request with header "X-API-Key" set to "invalid-key-12345"
    When a POST request is sent to the marketing report webhook
    Then the response status should be 401
    And the response error code should be "AUTH_INVALID_KEY"
    And the workflow should not execute
    And the failed authentication attempt should be logged

  @security @authentication @missing @P0
  Scenario: Missing API key rejected with 401
    Given a request without the "X-API-Key" header
    When a POST request is sent to the marketing report webhook
    Then the response status should be 401
    And the response error code should be "AUTH_MISSING_KEY"
    And the workflow should not execute

  @security @rate-limiting @P1
  Scenario Outline: Rate limiting enforcement
    Given the API key has made <previous_requests> requests in the last hour
    And the rate limit is 100 requests per hour
    When another request is made with the same API key
    Then the response status should be <expected_status>

    Examples:
      | previous_requests | expected_status |
      | 10                | 200             |
      | 50                | 200             |
      | 99                | 200             |
      | 100               | 429             |
      | 150               | 429             |

  @security @brute-force @P1
  Scenario: Brute force protection blocks repeated failures
    Given 10 consecutive failed authentication attempts from the same IP
    When another authentication attempt is made from that IP
    Then the response status should be 429
    And the IP should be temporarily blocked
    And a security alert should be raised

  # =============================================================================
  # CONCURRENT EXECUTION SCENARIOS
  # =============================================================================

  @concurrency @isolation @P1
  Scenario: Two concurrent webhook triggers are isolated
    Given two valid requests are received within 1 second of each other
    When both requests trigger the workflow
    Then two separate workflow executions should start
    And each execution should have a unique execution ID
    And each execution should generate a separate report
    And no data should be shared between executions

  @concurrency @max-limit @P1
  Scenario: Maximum concurrent executions queues additional requests
    Given 5 workflow executions are already running
    And the maximum concurrent executions is 5
    When a 6th request is received
    Then the 6th request should be queued
    And the response status should be 202
    And the response should indicate queue position 1
    And when an execution completes the queued request should start

  @concurrency @deduplication @P2
  Scenario: Duplicate request within 5 minutes returns existing execution
    Given a request with identical parameters is already processing
    And the identical request was received 2 minutes ago
    When the same request is received again
    Then the response should return status "already_processing"
    And the response should include the existing execution ID
    And no duplicate execution should be created

  @concurrency @timeout @P1
  Scenario: Long-running execution is terminated after timeout
    Given an execution has been running for 10 minutes
    And the maximum execution time is 5 minutes
    When the timeout threshold is exceeded
    Then the execution should be terminated
    And partial results should be saved if available
    And an error notification should be sent
    And resources should be released for other executions
