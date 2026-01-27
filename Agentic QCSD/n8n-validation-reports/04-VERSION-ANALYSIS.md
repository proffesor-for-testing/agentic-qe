# n8n Workflow Version Analysis Report

## Summary
| Field | Value |
|-------|-------|
| **Workflow ID** | wFp8WszRSWcKuhGA |
| **Workflow Name** | Agentic_Marketing_Performance_Dept_v02 |
| **Current Version** | 6 (versionId: ed8408f6-346c-4b40-be97-f110499e36e6) |
| **Created** | 2026-01-21 08:15:15 UTC |
| **Last Updated** | 2026-01-23 09:54:22 UTC |
| **Status** | Inactive (active: false) |
| **Execution Order** | v1 |
| **Owner** | Dominic Veit (dominic.veit@accenture.com) |

---

## Workflow Structure Analysis

### Node Inventory (27 Nodes Total)

| Category | Count | Nodes |
|----------|-------|-------|
| **Triggers** | 1 | Manual Trigger |
| **Data Sources** | 5 | HTTP Request (Meta Ads), BigQuery x4 |
| **AI Agents** | 4 | Meta Ads Agent, AI Agent (Spotify), Marketing Director, Marketing Director1 (CMO) |
| **LLM Models** | 4 | Google Vertex Chat Model x4 |
| **Data Processing** | 8 | Code nodes x6, Merge nodes x5 |
| **Output** | 4 | Gmail nodes x4 |

### Node Type Versions

| Node Type | Type Version | Count | Migration Risk |
|-----------|-------------|-------|----------------|
| `n8n-nodes-base.manualTrigger` | 1 | 1 | LOW |
| `n8n-nodes-base.merge` | 3.2 | 5 | LOW |
| `n8n-nodes-base.code` | 2 | 6 | LOW |
| `n8n-nodes-base.httpRequest` | 4.3 | 1 | **MEDIUM** |
| `n8n-nodes-base.googleBigQuery` | 2.1 | 4 | LOW |
| `n8n-nodes-base.gmail` | 2.1 | 4 | LOW |
| `@n8n/n8n-nodes-langchain.agent` | 3 | 4 | **MEDIUM** |
| `@n8n/n8n-nodes-langchain.lmChatGoogleVertex` | 1 | 4 | **MEDIUM** |

---

## Execution History Analysis

| Execution ID | Status | Started | Duration | Mode |
|-------------|--------|---------|----------|------|
| 133786 | SUCCESS | 2026-01-23 09:54:23 | 3m 3s | manual |
| 133784 | SUCCESS | 2026-01-23 09:53:40 | <1s | manual |
| 133783 | SUCCESS | 2026-01-23 09:53:30 | <1s | manual |
| 133778 | SUCCESS | 2026-01-23 09:32:55 | 2m 27s | manual |
| 133777 | SUCCESS | 2026-01-23 09:32:23 | <1s | manual |

**Observation:** Recent executions show a pattern of quick partial executions (<1s) interspersed with full workflow runs (2-3 minutes). This suggests active development/testing with manual pinned data runs.

---

## Potential Regression Risks

### HIGH RISK Areas

#### 1. Hardcoded API Credentials in Workflow
**Risk Level:** HIGH - SECURITY
**Location:** Node "Get Meta Ads Data" (line 97)
```javascript
"access_token": "EAAJSWttgAsoBQ..."  // Facebook Graph API token embedded
```
**Impact:**
- Token expiration will break workflow silently
- Security exposure if workflow exported
- No rotation mechanism

**Recommendation:**
- Move to n8n credential store
- Implement token refresh workflow

#### 2. JSON Parsing Fragility in Code Nodes
**Risk Level:** HIGH - RELIABILITY
**Locations:**
- "Cleanup Output to JSON" (line 63)
- "Cleanup Output to JSON1" (line 367)
- "Cleanup Output to JSON2" (line 420)
- "Code Cleanup CMO" (line 521)

**Issue:** Multiple similar JSON cleaning implementations with different robustness levels.

**Impact:** Inconsistent error handling across paths - some branches will fail on edge cases that others handle.

**Recommendation:**
- Standardize JSON cleanup into reusable Code node
- Add comprehensive error handling to all paths

#### 3. AI Agent Output Format Dependencies
**Risk Level:** HIGH - REGRESSION
**Issue:** All 4 AI agents depend on specific JSON output formats with HTML embedded:
```javascript
{
  "email_body": "HTML with SINGLE QUOTES",
  "key_insight": "text",
  "action_required": bool
}
```

**Impact:** Any LLM model update or prompt change could break downstream processing.

**Recommendation:**
- Add schema validation after each AI agent
- Implement fallback templates for malformed outputs

### MEDIUM RISK Areas

#### 4. External API Dependencies
| API | Node | Failure Impact |
|-----|------|----------------|
| Meta Graph API v19.0 | Get Meta Ads Data | Breaks Meta reporting branch |
| Google BigQuery | 4 nodes | Breaks all branches |
| Google Vertex AI | 4 nodes | Breaks all AI analysis |
| Gmail API | 4 nodes | Prevents email delivery |

**Mitigation:** Add error handling branches for each external call.

#### 5. Data Synchronization Issues (Known)
**Location:** "AI Agent" (Spotify) prompt explicitly warns:
```
Data Health - CRITICAL: Does the 'Track Data' date match the 'Overall Stats' date?
```

**Issue:** The workflow acknowledges that Spotify track data may be 48h behind overall stats. This is a known data quality issue that should be monitored.

### LOW RISK Areas

#### 6. Workflow Execution Order
**Setting:** `executionOrder: "v1"`

This is the explicit v1 execution order (introduced in n8n 1.0). No migration needed for current n8n versions.

---

## Migration Validation Needs

### LangChain Node Updates
The workflow uses `@n8n/n8n-nodes-langchain` nodes:
- `lmChatGoogleVertex` (typeVersion: 1)
- `agent` (typeVersion: 3)

**Check Required:** Verify if n8n instance has been updated. LangChain nodes have seen significant updates.

### Google BigQuery Node
**Current:** typeVersion 2.1

**Note:** BigQuery nodes use `serviceAccount` authentication which is stable.

### HTTP Request Node
**Current:** typeVersion 4.3

This is a recent version. Check if any parameters have changed in newer n8n releases.

---

## Rollback Considerations

### Pre-Rollback Checklist
- [ ] Export current workflow state (version 6)
- [ ] Note current credential bindings
- [ ] Document pinned data state
- [ ] Check for in-flight executions

### Rollback Command
```bash
# Export current state
curl -X GET "https://n8n.acngva.com/api/v1/workflows/wFp8WszRSWcKuhGA" \
  -H "X-N8N-API-KEY: [KEY]" > backup-v6.json

# If rollback needed, import previous version:
curl -X PUT "https://n8n.acngva.com/api/v1/workflows/wFp8WszRSWcKuhGA" \
  -H "X-N8N-API-KEY: [KEY]" \
  -H "Content-Type: application/json" \
  -d @backup-v5.json
```

### Rollback Considerations by Change Type
| Change Type | Rollback Complexity | Notes |
|------------|---------------------|-------|
| Prompt changes | Easy | Revert text only |
| Node additions | Easy | Remove node and connections |
| Node removals | Medium | Re-add node with original config |
| Credential changes | Hard | May require re-authorization |
| API endpoint changes | Hard | External system may have changed |

---

## Regression Test Recommendations

### Critical Path Tests
1. **Meta Ads Data Flow**
   - Trigger workflow
   - Verify Meta Graph API response handling
   - Check JSON cleanup produces valid output
   - Confirm email delivery

2. **Spotify Data Flow**
   - Verify BigQuery queries return data
   - Check data merge logic handles mismatched dates
   - Validate JSON cleanup handles all edge cases

3. **Director Aggregation**
   - Test merge of Meta + Spotify reports
   - Verify context construction for Director agent
   - Check email output format

4. **CMO Synthesis**
   - Test full context assembly
   - Verify CMO agent produces valid JSON
   - Confirm final email delivery

### Edge Case Tests
| Test Case | Expected Behavior |
|-----------|-------------------|
| Meta API returns empty data | Graceful degradation with "No Data" message |
| BigQuery returns 0 streams | Agent acknowledges broken metrics |
| AI agent returns malformed JSON | Error is caught and reported |
| Gmail quota exceeded | Workflow fails at send step |

---

## Change Impact Summary

```
Workflow: Agentic_Marketing_Performance_Dept_v02
Version: 6
Risk Assessment: MEDIUM-HIGH

Critical Areas:
[!] Hardcoded API token - Security risk
[!] Inconsistent JSON parsing - Reliability risk
[!] AI output format dependency - Regression risk

Recommended Actions:
1. Move Meta API token to credential store
2. Standardize JSON cleanup code across all paths
3. Add schema validation after AI agents
4. Implement error handling branches for external APIs
5. Add monitoring for execution failures

Rollback Status: READY
- Version 6 can be exported/restored via API
- No breaking infrastructure changes detected
```

---

## Version History Note

This analysis is based on **version 6** of the workflow. The n8n API does not expose a full version history diff, but the `versionCounter: 6` indicates 5 previous versions exist. To compare with specific previous versions, you would need:
1. Git version control of workflow exports
2. n8n Enterprise edition with version history feature
3. Manual backup snapshots

**Recommendation:** Implement automated workflow export to Git on each save to enable proper version comparison in the future.
