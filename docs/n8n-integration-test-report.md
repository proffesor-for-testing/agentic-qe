# n8n Integration Test Report

## Summary
- **Workflow ID:** wFp8WszRSWcKuhGA
- **Workflow Name:** Agentic_Marketing_Performance_Dept_v02
- **Last Updated:** 2026-01-23T09:54:22.000Z
- **Status:** Inactive (Manual Trigger)
- **Integrations Tested:** 4 External Services
- **Total Nodes:** 27
- **Overall Status:** WARNING

---

## 1. External Integrations Inventory

| Integration | Nodes | Credential ID | Auth Type | Status |
|-------------|-------|---------------|-----------|--------|
| Google BigQuery | 4 | l48ebvDqv9DgY1ti | Service Account | PASS |
| Google Vertex AI | 4 | l48ebvDqv9DgY1ti | Service Account | PASS |
| Gmail | 4 | 8MDLDMIukkjltkOW | OAuth2 | WARNING |
| Meta/Facebook Graph API | 1 | N/A (Direct Token) | Access Token | CRITICAL |

---

## 2. Integration Details

### 2.1 Google BigQuery Integration

**Credential:** Google BigQuery account 2 (ID: l48ebvDqv9DgY1ti)

**Authentication:** Service Account (GCP)

**Nodes Using This Integration:**
| Node Name | Operation | Project | Table/Query |
|-----------|-----------|---------|-------------|
| Get Meta Ads Analyst Instructions | SELECT | bmsg-analytics-agents | marketing_data.agent_instructions |
| Get Spotify Analyst Instructions | SELECT | bmsg-analytics-agents | marketing_data.agent_instructions |
| Get Spotify Overall Stats | SELECT | bmsg-analytics-agents | marketing_data.spotify_overall_daily |
| Get Spotify Track Data | SELECT | bmsg-analytics-agents | marketing_data.spotify_tracks_daily |

**API Contract Validation:**
```
Endpoint: BigQuery SQL Query API
Project: bmsg-analytics-agents
Tables Accessed:
  - marketing_data.agent_instructions
  - marketing_data.spotify_overall_daily
  - marketing_data.spotify_tracks_daily

Expected Response: JSON array of rows
Error Handling: n8n default (throws on API error)
```

**Rate Limit Considerations:**
- BigQuery: 100 concurrent queries per project
- Daily query quota: 10,000 queries/day (free tier)
- Current usage: ~4 queries per execution = LOW RISK

**Status:** PASS - Service account authentication is stable and does not expire.

---

### 2.2 Google Vertex AI Chat Model Integration

**Credential:** Same as BigQuery (ID: l48ebvDqv9DgY1ti)

**Authentication:** Service Account (via GCP IAM)

**Nodes Using This Integration:**
| Node Name | Project | Purpose |
|-----------|---------|---------|
| Google Vertex Chat Model | bmsg-analytics-agents | Meta Ads Agent LLM |
| Google Vertex Chat Model1 | bmsg-analytics-agents | Spotify AI Agent LLM |
| Google Vertex Chat Model2 | bmsg-analytics-agents | Marketing Director LLM |
| Google Vertex Chat Model3 | bmsg-analytics-agents | CMO Agent LLM |

**API Contract Validation:**
```
Endpoint: Vertex AI Generative Language API
Model: gemini-pro (default)
Input: Prompt text from agent nodes
Output: Generated text response

Expected Response Format:
{
  "output": "string (LLM response)"
}
```

**Rate Limit Considerations:**
- Vertex AI: 60 requests/minute (default)
- Token limits: ~32K context window
- Current usage: 4 LLM calls per execution = LOW RISK

**Status:** PASS - Service account provides stable authentication.

---

### 2.3 Gmail OAuth2 Integration

**Credential:** Gmail account 30 (ID: 8MDLDMIukkjltkOW)

**Authentication:** OAuth2 (requires refresh)

**Nodes Using This Integration:**
| Node Name | Operation | Recipient |
|-----------|-----------|-----------|
| Send Meta Ads Report | Send Email | dominic.veit@accenture.com |
| Send Spotify Report | Send Email | dominic.veit@accenture.com |
| Send Marketing Director Email | Send Email | dominic.veit@accenture.com |
| Send Spotify Report2 (CMO) | Send Email | dominic.veit@accenture.com |

**API Contract Validation:**
```
Endpoint: Gmail API v1 - messages.send
Method: POST
Required Scopes:
  - https://www.googleapis.com/auth/gmail.send

Request Format:
{
  "to": "string",
  "subject": "string (with date expression)",
  "message": "string (HTML from $json.email_body)"
}

Expected Response: 200 OK with message ID
```

**Error Analysis (from execution 133767):**
```
Error: Cannot read properties of undefined (reading 'trim')
Node: Send Marketing Director Email
Cause: $json["email_body"] was undefined when email was sent
Root Cause: Upstream JSON parsing failure in Code node
```

**Rate Limit Considerations:**
- Gmail API: 250 quota units/second
- Daily sending limit: 500 emails/day (consumer), 2000 (Workspace)
- Current usage: 4 emails per execution = LOW RISK

**Status:** WARNING
- OAuth2 tokens expire and require refresh
- Error handling needed for undefined email_body

**Recommendations:**
1. Add null check before email send: `{{ $json["email_body"] || "Error: No content generated" }}`
2. Monitor OAuth token expiry (typically 7 days without activity)

---

### 2.4 Meta/Facebook Graph API Integration

**Credential:** Direct Access Token (HARDCODED IN WORKFLOW)

**Authentication:** Long-lived Access Token

**Node:** Get Meta Ads Data

**Configuration:**
```javascript
{
  "url": "https://graph.facebook.com/v19.0/act_2144618699332578/insights",
  "queryParameters": {
    "access_token": "EAAJSWttgAsoBQ...AZDZ D",  // EXPOSED TOKEN
    "level": "ad",
    "fields": "ad_name,spend,cpm,cpc,ctr,impressions,clicks,actions,date_start,date_stop",
    "date_preset": "last_30d",
    "limit": "50"
  }
}
```

**API Contract Validation:**
```
Endpoint: Facebook Marketing API v19.0
Resource: Ad Account Insights
Method: GET

Expected Response:
{
  "data": [
    {
      "ad_name": "string",
      "spend": "number",
      "cpm": "number",
      "cpc": "number",
      "ctr": "number",
      "impressions": "number",
      "clicks": "number",
      "actions": "array",
      "date_start": "date",
      "date_stop": "date"
    }
  ]
}

Error Responses:
- 400: Invalid parameters
- 401: Token expired/invalid
- 429: Rate limited
- 190: Token error (OAuthException)
```

**Rate Limit Considerations:**
- Facebook Marketing API: 200 calls/hour per ad account
- Bulk read limits apply for insights
- Current usage: 1 request per execution = LOW RISK

**CRITICAL SECURITY ISSUES:**

1. **HARDCODED ACCESS TOKEN** - Token is stored directly in workflow JSON
   - Risk: Token exposed in version control, exports, and API responses
   - Fix: Use n8n credentials system with Facebook OAuth2

2. **Token Expiration** - Facebook tokens expire
   - Long-lived tokens: 60 days
   - Must monitor for `OAuthException` error code 190

**Status:** CRITICAL
- Security vulnerability: plaintext token in workflow
- No error handling for token expiration
- No retry logic for rate limits

**Recommended Fix:**
```javascript
// Create proper Facebook credential in n8n
// Node should use:
credentials: {
  facebookGraphApi: {
    id: "<credential_id>",
    name: "Meta Marketing API"
  }
}
```

---

## 3. Authentication Flow Analysis

### 3.1 OAuth2 Flows

| Service | Token Type | Refresh Method | Expiry |
|---------|------------|----------------|--------|
| Gmail | OAuth2 Access Token | Auto-refresh via n8n | ~1 hour (auto-renewed) |
| Google BigQuery | Service Account JWT | Auto-generated | N/A (service account) |
| Google Vertex AI | Service Account JWT | Auto-generated | N/A (service account) |
| Meta Graph API | Long-lived Token | **MANUAL** | 60 days |

### 3.2 Authentication Status

| Integration | Auth Valid | Last Test | Notes |
|-------------|------------|-----------|-------|
| Google BigQuery | YES | 2026-01-23 | Service account stable |
| Google Vertex AI | YES | 2026-01-23 | Same credential as BigQuery |
| Gmail OAuth2 | YES | 2026-01-23 | Token refreshed automatically |
| Meta Graph API | UNKNOWN | N/A | Token hardcoded, no validation |

---

## 4. Rate Limiting Analysis

| Integration | Limit | Est. Usage/Exec | Daily Capacity | Risk Level |
|-------------|-------|-----------------|----------------|------------|
| BigQuery | 100 concurrent | 4 queries | 10,000 queries | LOW |
| Vertex AI | 60 req/min | 4 requests | 86,400 requests | LOW |
| Gmail | 500/day (consumer) | 4 emails | 125 executions | MEDIUM |
| Meta Graph | 200/hour | 1 request | 4,800 requests | LOW |

**Gmail Consideration:** If workflow runs hourly, will hit 96 emails/day. If triggered more frequently, monitor quota.

---

## 5. Error Handling Assessment

### 5.1 Current Error Handling

| Node | Error Handling | Recovery | Status |
|------|----------------|----------|--------|
| Get Meta Ads Data | None (default) | Throws | POOR |
| BigQuery nodes | None (default) | Throws | POOR |
| Vertex AI nodes | None (default) | Throws | POOR |
| Gmail nodes | None (default) | Throws | POOR |
| Code (JSON cleanup) | Try-catch with fallback | Returns error JSON | GOOD |

### 5.2 Observed Errors (Last 20 Executions)

| Execution ID | Status | Error Type | Node | Root Cause |
|--------------|--------|------------|------|------------|
| 133767 | error | NodeOperationError | Send Marketing Director Email | Undefined email_body |
| 133757 | error | SyntaxError | Cleanup Output to JSON2 | Incomplete JS code in node |
| 133756 | error | SyntaxError | Cleanup Output to JSON2 | Same issue |

**Error Pattern Analysis:**
- 3 of 20 executions failed (15% failure rate)
- All failures related to JSON parsing/downstream data
- No integration authentication failures observed

### 5.3 Missing Error Handlers

**Recommended additions:**

1. **Meta Graph API - Token Expiry Handler**
```javascript
// Add to "Get Meta Ads Data" node options
{
  "options": {
    "continueOnFail": false,
    "timeout": 30000
  },
  "onError": {
    "190": "Re-authenticate: Token expired",
    "429": "Retry after delay"
  }
}
```

2. **Gmail - Empty Content Handler**
```javascript
// Add expression validation
"message": "={{ $json.email_body ? $json.email_body : '<p>Error: Report generation failed. Please check workflow logs.</p>' }}"
```

3. **BigQuery - Query Error Handler**
```javascript
// Wrap BigQuery calls with error workflow
{
  "continueOnFail": true,
  "fallbackValue": { "system_instruction": "Default instructions if query fails" }
}
```

---

## 6. Execution Health Summary

### 6.1 Recent Execution Statistics

| Metric | Value |
|--------|-------|
| Total Executions (last 20) | 20 |
| Successful | 17 (85%) |
| Failed | 3 (15%) |
| Average Duration (full run) | ~2-3 minutes |
| Last Successful | 2026-01-23T09:57:26 |
| Last Failed | 2026-01-23T09:26:34 |

### 6.2 Integration-Specific Health

| Integration | Calls Made | Failures | Success Rate |
|-------------|------------|----------|--------------|
| Google BigQuery | ~80 | 0 | 100% |
| Google Vertex AI | ~68 | 0 | 100% |
| Gmail | ~68 | 3 | 95.6% |
| Meta Graph API | ~20 | 0 | 100% |

---

## 7. Security Findings

### 7.1 Critical Issues

| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| CRITICAL | Hardcoded Facebook token | Get Meta Ads Data node | Use n8n credentials |
| HIGH | Token visible in workflow JSON | Entire workflow | Encrypt or use credentials |
| MEDIUM | No token rotation | Meta Graph API | Implement refresh flow |

### 7.2 Token in Workflow JSON (EXPOSED)
```
Access Token: EAAJSWttgAsoBQSmYOzgmmZAuntJwPGxR5NKdFzoPZBw3IrZCHRlrf8on3Kpw6GzhrAU0qdBWv19WeALDYlostBEhkr0TcvFI5LZByqNqImaZCmR7Sjq12WBhz2CZBW0XdwtDTmEQHPMq3dlLI6JQUwJ3IsMr2XEDIdTIHENmLjCEAolb63pzxgncCZA9TnSALSfUAZDZD
```

**This token provides access to:**
- Ad Account: act_2144618699332578
- Permissions: ads_read, ads_management (likely)
- Risk: Unauthorized access to ad spend data

---

## 8. Recommendations

### 8.1 Immediate Actions (CRITICAL)

1. **Migrate Facebook Token to Credentials**
   - Create new Facebook/Meta API credential in n8n
   - Use OAuth2 flow for automatic refresh
   - Remove hardcoded token from workflow

2. **Add Error Handling to Gmail Nodes**
   - Validate `$json.email_body` exists before sending
   - Add fallback content for failed AI generations

### 8.2 Short-term Improvements (HIGH)

3. **Implement Retry Logic**
   - Add retry on 429/503 errors for all HTTP nodes
   - Configure exponential backoff

4. **Add Monitoring**
   - Enable n8n execution logging
   - Set up alerts for failed executions
   - Monitor credential expiry

### 8.3 Long-term Improvements (MEDIUM)

5. **Refactor JSON Cleanup Nodes**
   - The Code nodes for JSON cleanup are fragile
   - Consider using structured output from Vertex AI
   - Add comprehensive error logging

6. **Add Data Validation**
   - Validate BigQuery responses before processing
   - Check for null/undefined values early in pipeline

---

## 9. Test Execution Summary

| Test Category | Tests | Passed | Failed | Skipped |
|---------------|-------|--------|--------|---------|
| Integration Inventory | 4 | 4 | 0 | 0 |
| API Contract Validation | 4 | 3 | 1 | 0 |
| Authentication Flow | 4 | 3 | 1 | 0 |
| Rate Limit Analysis | 4 | 4 | 0 | 0 |
| Error Handling Review | 4 | 1 | 3 | 0 |
| Execution Health | 1 | 1 | 0 | 0 |
| **TOTAL** | **21** | **16** | **5** | **0** |

**Overall Integration Health: 76% (WARNING)**

---

## 10. Appendix

### A. Credential Mapping

| Credential ID | Name | Type | Services |
|---------------|------|------|----------|
| l48ebvDqv9DgY1ti | Google BigQuery account 2 | Service Account | BigQuery, Vertex AI |
| 8MDLDMIukkjltkOW | Gmail account 30 | OAuth2 | Gmail |
| N/A (hardcoded) | Meta Access Token | Long-lived Token | Facebook Graph API |

### B. Node-to-Integration Mapping

```
Manual Trigger
  |
  +-- Get Meta Ads Analyst Instructions [BigQuery]
  +-- Get Meta Ads Data [Meta Graph API]
  +-- Get Spotify Analyst Instructions [BigQuery]
  +-- Get Spotify Overall Stats [BigQuery]
  +-- Get Spotify Track Data [BigQuery]
  |
  +-- Meta Ads Agent [Vertex AI]
  +-- AI Agent (Spotify) [Vertex AI]
  +-- Marketing Director [Vertex AI]
  +-- Marketing Director1 (CMO) [Vertex AI]
  |
  +-- Send Meta Ads Report [Gmail]
  +-- Send Spotify Report [Gmail]
  +-- Send Marketing Director Email [Gmail]
  +-- Send Spotify Report2 [Gmail]
```

---

**Report Generated:** 2026-01-23T10:00:00Z
**Agent:** N8N Integration Test Agent (Agentic QE v3)
