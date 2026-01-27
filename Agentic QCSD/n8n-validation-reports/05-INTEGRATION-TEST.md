# n8n Integration Test Report - Agentic_Marketing_Performance_Dept_v02

## Summary

| Metric | Value |
|--------|-------|
| **Workflow ID** | wFp8WszRSWcKuhGA |
| **Integrations Tested** | 4 |
| **Overall Health** | **WARNING (76%)** |
| **Execution Success Rate** | 85% (17/20 recent) |

---

## Integration Health Overview

| Integration | Nodes | Auth Type | Status |
|-------------|-------|-----------|--------|
| Google BigQuery | 4 | Service Account | **PASS** |
| Google Vertex AI | 4 | Service Account | **PASS** |
| Gmail OAuth2 | 4 | OAuth2 | **WARNING** |
| Meta/Facebook Graph API | 1 | Hardcoded Token | **CRITICAL** |

---

## Key Findings

### CRITICAL: Security Vulnerability in Meta Graph API

The Facebook/Meta access token is **hardcoded directly in the workflow JSON**:

```
Node: "Get Meta Ads Data"
URL: https://graph.facebook.com/v19.0/act_2144618699332578/insights
Token: EAAJSWttgAsoBQ...[REDACTED] (exposed)
```

**Risks:**
- Token exposed in any workflow export
- Visible via API responses
- No automatic refresh (expires in 60 days)
- Provides access to ad account spending data

**Immediate Action Required:**
1. Revoke the current token in Facebook Business Manager
2. Create a new Facebook/Meta credential in n8n using OAuth2
3. Update the node to use the credential instead of query parameter

---

### WARNING: Gmail Error Handling

Three recent executions failed due to Gmail nodes receiving `undefined` email_body:

```
Error: Cannot read properties of undefined (reading 'trim')
Node: Send Marketing Director Email
Root Cause: Upstream JSON parsing failure
```

**Fix:** Add null-safety to email expressions:
```javascript
{{ $json.email_body || '<p>Report generation failed</p>' }}
```

---

### PASS: Google Cloud Integrations

Both **BigQuery** and **Vertex AI** integrations are healthy:
- Using service account authentication (stable, no expiry)
- 100% success rate across all recent executions
- Rate limit usage is minimal (4 queries + 4 LLM calls per execution)

---

## Rate Limit Analysis

| Integration | Limit | Usage/Execution | Risk |
|-------------|-------|-----------------|------|
| BigQuery | 100 concurrent | 4 queries | LOW |
| Vertex AI | 60 req/min | 4 requests | LOW |
| Gmail | 500/day | 4 emails | MEDIUM |
| Meta Graph | 200/hour | 1 request | LOW |

---

## Error Handling Assessment

| Component | Error Handling | Status |
|-----------|----------------|--------|
| BigQuery nodes | None (throws) | POOR |
| Vertex AI nodes | None (throws) | POOR |
| Gmail nodes | None (throws) | POOR |
| Code (JSON cleanup) | Try-catch with fallback | GOOD |
| Meta Graph node | None | POOR |

---

## Integration Details

### 1. Google BigQuery (4 nodes)

| Node | SQL Query | Status |
|------|-----------|--------|
| Get Meta Ads Analyst Instructions | `SELECT system_instruction FROM agent_instructions WHERE agent_name = 'ads_analyst'` | PASS |
| Get Spotify Analyst Instructions | `SELECT system_instruction FROM agent_instructions WHERE agent_name = 'spotify_analyst'` | PASS |
| Get Spotify Overall Stats | `SELECT * FROM spotify_overall_daily WHERE report_date = MAX(report_date)` | PASS |
| Get Spotify Track Data | `SELECT TOP 15 tracks by streams` | PASS |

**Authentication:** Service Account (stable)
**Credential ID:** l48ebvDqv9DgY1ti
**Project:** bmsg-analytics-agents

### 2. Google Vertex AI (4 nodes)

| Node | Model | Purpose |
|------|-------|---------|
| Google Vertex Chat Model | Gemini | Meta Ads analysis |
| Google Vertex Chat Model1 | Gemini | Spotify analysis |
| Google Vertex Chat Model2 | Gemini | Marketing Director synthesis |
| Google Vertex Chat Model3 | Gemini | CMO review |

**Authentication:** Service Account (shared with BigQuery)
**Typical Response Time:** 30-45 seconds per agent

### 3. Gmail OAuth2 (4 nodes)

| Node | Recipient | Purpose |
|------|-----------|---------|
| Send Meta Ads Report | dominic.veit@accenture.com | Meta Ads analysis |
| Send Spotify Report | dominic.veit@accenture.com | Spotify analysis |
| Send Marketing Director Email | dominic.veit@accenture.com | Director synthesis |
| Send Spotify Report2 | dominic.veit@accenture.com | CMO audit |

**Authentication:** OAuth2
**Credential ID:** 8MDLDMIukkjltkOW
**Issue:** All emails go to same recipient (hardcoded)

### 4. Meta/Facebook Graph API (1 node)

| Parameter | Value |
|-----------|-------|
| API Version | v19.0 |
| Account ID | act_2144618699332578 |
| Endpoint | /insights |
| Fields | ad_name, spend, cpm, cpc, ctr, impressions, clicks, actions |
| Date Preset | last_30d |

**Authentication:** HARDCODED TOKEN (CRITICAL ISSUE)

---

## Recommendations

### Immediate (CRITICAL)
1. **Migrate Facebook token to n8n credentials system** - Security vulnerability
2. **Add null checks to Gmail message expressions** - Prevents execution failures

### Short-term (HIGH)
3. Add retry logic with exponential backoff for all HTTP nodes
4. Implement error workflow for monitoring failures
5. Add validation before each email send

### Long-term (MEDIUM)
6. Refactor JSON cleanup nodes (currently fragile)
7. Consider using Vertex AI structured output mode
8. Add execution monitoring and alerting

---

## Test Results Summary

| Test Category | Passed | Failed | Total |
|---------------|--------|--------|-------|
| Connection Tests | 12 | 1 | 13 |
| Authentication Tests | 3 | 1 | 4 |
| Rate Limit Tests | 4 | 0 | 4 |
| Error Handling Tests | 1 | 5 | 6 |

**Overall Score: 76% (20/27 tests passed)**
