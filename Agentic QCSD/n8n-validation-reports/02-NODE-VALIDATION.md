# n8n Node Validation Report

## Summary
- **Workflow ID:** wFp8WszRSWcKuhGA
- **Workflow Name:** Agentic_Marketing_Performance_Dept_v02
- **Total Nodes:** 31
- **Active:** No (inactive)
- **Created:** 2026-01-21
- **Last Updated:** 2026-01-23

---

## Node Inventory

| # | Node Name | Type | Status |
|---|-----------|------|--------|
| 1 | When clicking 'Execute workflow' | manualTrigger | PASS |
| 2 | Get Meta Ads Analyst Instructions | googleBigQuery | PASS |
| 3 | Get Meta Ads Data | httpRequest | WARNING |
| 4 | Format Output | code | PASS |
| 5 | Merge | merge | PASS |
| 6 | Meta Ads Agent | langchain.agent | PASS |
| 7 | Google Vertex Chat Model | lmChatGoogleVertex | PASS |
| 8 | Cleanup Output to JSON | code | PASS |
| 9 | Send Meta Ads Report | gmail | PASS |
| 10 | Get Spotify Analyst Instructions | googleBigQuery | PASS |
| 11 | Get Spotify Overall Stats | googleBigQuery | PASS |
| 12 | Get Spotify Track Data | googleBigQuery | PASS |
| 13 | Merge1 | merge | WARNING |
| 14 | Merge Spotify Data | code | PASS |
| 15 | Merge2 | merge | PASS |
| 16 | AI Agent | langchain.agent | PASS |
| 17 | Google Vertex Chat Model1 | lmChatGoogleVertex | PASS |
| 18 | Cleanup Output to JSON1 | code | WARNING |
| 19 | Send Spotify Report | gmail | PASS |
| 20 | Merge Reports | merge | WARNING |
| 21 | Cleanup Code | code | PASS |
| 22 | Marketing Director | langchain.agent | PASS |
| 23 | Google Vertex Chat Model2 | lmChatGoogleVertex | PASS |
| 24 | Cleanup Output to JSON2 | code | PASS |
| 25 | Send Marketing Director Email | gmail | PASS |
| 26 | Merge3 | merge | WARNING |
| 27 | CMO Full Context | code | PASS |
| 28 | Marketing Director1 (CMO) | langchain.agent | PASS |
| 29 | Google Vertex Chat Model3 | lmChatGoogleVertex | PASS |
| 30 | Code Cleanup CMO | code | PASS |
| 31 | Send Spotify Report2 (CMO Email) | gmail | PASS |

---

## Critical Issues Detected

### ERROR 1: Hardcoded Facebook Access Token
**Node:** Get Meta Ads Data (HTTP Request)
**Severity:** CRITICAL - SECURITY
**Issue:** Facebook access token is hardcoded in the URL parameters

**Impact:**
- Token exposed in workflow JSON
- Token will expire and break the workflow
- Security risk if workflow is shared/exported

**Recommendation:** Use n8n credentials for Meta/Facebook

---

### WARNING 2: HTTP Request Missing Timeout
**Node:** Get Meta Ads Data
**Issue:** No timeout configured for Facebook Graph API call
**Impact:** Request could hang indefinitely if Facebook API is slow

**Recommendation:** Add timeout: 30000ms

---

### WARNING 3: Merge1 Mode Issue
**Node:** Merge1
**Issue:** Using default `append` mode to merge Overall Stats + Track Data
**Impact:** Items are simply appended, not combined. The downstream "Merge Spotify Data" code node handles this manually, but it's fragile.

**Recommendation:** Consider using `combineByPosition` mode

---

### WARNING 4: Cleanup Output to JSON1 - Fragile JSON Parsing
**Node:** Cleanup Output to JSON1
**Issue:** Uses simple regex replacement without fallback error handling
**Impact:** Will crash if AI output contains unexpected characters

**Recommendation:** Add try-catch like other cleanup nodes

---

### WARNING 5: Merge Reports - Timing Dependency
**Node:** Merge Reports
**Issue:** Uses default append mode to combine Meta and Spotify reports
**Impact:** If one branch completes before the other, merge timing could be inconsistent

---

### WARNING 6: Merge3 - Same Timing Issue
**Node:** Merge3
**Issue:** Merging Marketing Director output with Cleanup Code output using append mode

---

## Connection Validation

### Connection Map
```
Trigger
  |
  +---> Get Meta Ads Analyst Instructions --> Merge (input 0)
  |
  +---> Get Meta Ads Data --> Format Output --> Merge (input 1)
  |     |
  |     Merge --> Meta Ads Agent --> Cleanup Output to JSON
  |                    |                      |
  |               [Google Vertex]        +---> Send Meta Ads Report
  |                                      +---> Merge Reports (input 1)
  |
  +---> Get Spotify Analyst Instructions --> Merge2 (input 0)
  |
  +---> Get Spotify Overall Stats --> Merge1 (input 0)
  |
  +---> Get Spotify Track Data --> Merge1 (input 1)
        |
        Merge1 --> Merge Spotify Data --> Merge2 (input 1)
                                            |
                                       Merge2 --> AI Agent --> Cleanup Output to JSON1
                                                    |                    |
                                               [Google Vertex 1]    +---> Send Spotify Report
                                                                    +---> Merge Reports (input 0)

Merge Reports --> Cleanup Code --> Marketing Director --> Cleanup Output to JSON2
                       |                   |                        |
                       |              [Google Vertex 2]       +---> Send Marketing Director Email
                       |                                      +---> Merge3 (input 1)
                       +---> Merge3 (input 0)

Merge3 --> CMO Full Context --> Marketing Director1 (CMO) --> Code Cleanup CMO --> Send Spotify Report2
                                       |
                                  [Google Vertex 3]
```

### Connection Issues

**PASS:** All 14 declared connections are valid
**PASS:** No circular dependencies detected
**PASS:** No orphan nodes detected (all nodes are connected)
**WARNING:** 3 gmail nodes have empty downstream connections (terminal nodes - acceptable)

---

## Data Mapping Validation

### Meta Ads Flow
| Source | Target | Mapping | Status |
|--------|--------|---------|--------|
| BigQuery | Merge | `system_instruction` | PASS |
| HTTP Request | Format Output | `data` array | PASS |
| Format Output | Merge | `table_text`, `total_spend` | PASS |
| Merge | Meta Ads Agent | Combined fields | PASS |
| Agent | Cleanup | `output` | PASS |
| Cleanup | Gmail | `email_body` | PASS |

### Spotify Flow
| Source | Target | Mapping | Status |
|--------|--------|---------|--------|
| BigQuery (Overall) | Merge1 | Overall stats | PASS |
| BigQuery (Tracks) | Merge1 | Track data | PASS |
| Merge1 | Merge Spotify Data | Combined items | PASS |
| Code | Merge2 | `table_text`, `report_date` | PASS |
| BigQuery (Instructions) | Merge2 | `system_instruction` | PASS |
| Merge2 | AI Agent | Combined fields | PASS |
| Agent | Cleanup | `output` | PASS |
| Cleanup | Gmail | `email_body` | PASS |

### Director Flow
| Source | Target | Mapping | Status |
|--------|--------|---------|--------|
| Meta Cleanup | Merge Reports | JSON object | PASS |
| Spotify Cleanup | Merge Reports | JSON object | PASS |
| Merge Reports | Cleanup Code | Combined items | PASS |
| Cleanup Code | Marketing Director | `director_context` | PASS |
| Director | Cleanup2 | `output` | PASS |
| Cleanup2 | Gmail | `email_body` | PASS |

### CMO Flow
| Source | Target | Mapping | Status |
|--------|--------|---------|--------|
| Cleanup Code | Merge3 | JSON object | PASS |
| Cleanup2 | Merge3 | JSON object | PASS |
| Merge3 | CMO Full Context | Combined items | PASS |
| CMO Context | CMO Agent | `cmo_context` | PASS |
| CMO Agent | Code Cleanup | `output` | PASS |
| Cleanup | Gmail | `email_body`, `email_subject` | PASS |

---

## Conditional Logic Validation

### No IF/Switch Nodes Present
This workflow uses a linear pipeline with parallel branches. No conditional routing nodes detected.

### Agent Prompt Logic Review

**Meta Ads Agent Prompt:**
- Uses expressions: `{{ $json["system_instruction"] }}`, `{{ $json["total_spend"] }}`, `{{ $json["table_text"] }}`
- All referenced fields are properly populated by upstream nodes
- **PASS**

**Spotify AI Agent Prompt:**
- Uses expressions: `{{ $json["system_instruction"] }}`, `{{ $json["report_date"] }}`, `{{ $json["table_text"] }}`
- All referenced fields properly populated
- **PASS**

**Marketing Director Prompt:**
- Uses expression: `{{ $json["director_context"] }}`
- Properly populated by Cleanup Code node
- **PASS**

**CMO (Marketing Director1) Prompt:**
- Uses expression: `{{ $json["cmo_context"] }}`
- Properly populated by CMO Full Context node
- **PASS**

---

## Credential References

| Node | Credential Type | Credential Name | Status |
|------|-----------------|-----------------|--------|
| Get Meta Ads Analyst Instructions | googleApi | Google BigQuery account 2 | PASS |
| Get Meta Ads Data | NONE | Hardcoded token | ERROR |
| Get Spotify Analyst Instructions | googleApi | Google BigQuery account 2 | PASS |
| Get Spotify Overall Stats | googleApi | Google BigQuery account 2 | PASS |
| Get Spotify Track Data | googleApi | Google BigQuery account 2 | PASS |
| Google Vertex Chat Model | googleApi | Google BigQuery account 2 | PASS |
| Google Vertex Chat Model1 | googleApi | Google BigQuery account 2 | PASS |
| Google Vertex Chat Model2 | googleApi | Google BigQuery account 2 | PASS |
| Google Vertex Chat Model3 | googleApi | Google BigQuery account 2 | PASS |
| Send Meta Ads Report | gmailOAuth2 | Gmail account 30 | PASS |
| Send Spotify Report | gmailOAuth2 | Gmail account 30 | PASS |
| Send Marketing Director Email | gmailOAuth2 | Gmail account 30 | PASS |
| Send Spotify Report2 | gmailOAuth2 | Gmail account 30 | PASS |

---

## Overall Validation Score

| Category | Score | Notes |
|----------|-------|-------|
| Configuration | 85/100 | 1 critical (hardcoded token), 1 warning (no timeout) |
| Connections | 100/100 | All connections valid, no circular deps |
| Data Mappings | 95/100 | All mappings correct, some merge modes could be improved |
| Security | 60/100 | Hardcoded Facebook token is critical issue |
| Error Handling | 80/100 | Most code nodes have error handling, 2 missing |
| Best Practices | 85/100 | Good code structure, node naming could be clearer |

## **Overall Score: 84/100**

---

## Recommendations Summary

### Critical (Fix Immediately)
1. **Replace hardcoded Facebook access token** with n8n credentials

### High Priority
2. Add timeout to HTTP Request node (30000ms recommended)
3. Add try-catch to "Cleanup Output to JSON1" node

### Medium Priority
4. Add validation for empty data array in "Format Output" node
5. Consider renaming "Marketing Director1" to "CMO Agent" for clarity
6. Consider renaming "Send Spotify Report2" to "Send CMO Report"

### Low Priority
7. Consider using `combineByPosition` mode on Merge nodes where appropriate
8. Add node descriptions for documentation

---

## Validated Workflow Architecture

```
                         [TRIGGER]
                             |
        +--------------------+--------------------+
        |                    |                    |
   [META ADS FLOW]     [SPOTIFY FLOW]        [SHARED]
        |                    |                    |
   BigQuery x2          BigQuery x3               |
        |                    |                    |
   HTTP Request         Merge Stats               |
        |                    |                    |
   Format Code          Merge Code                |
        |                    |                    |
     Merge              Merge w/Instructions      |
        |                    |                    |
   LangChain Agent      LangChain Agent           |
        |                    |                    |
   JSON Cleanup         JSON Cleanup              |
        |                    |                    |
   Gmail Send           Gmail Send                |
        |                    |                    |
        +---------> MERGE REPORTS <---------------+
                         |
                    Cleanup Code
                         |
              +----------+----------+
              |                     |
       [DIRECTOR AGENT]      [CMO CONTEXT]
              |                     |
       JSON Cleanup                 |
              |                     |
       Gmail Send           +-------+
              |             |
              +-----> MERGE3 <------+
                         |
                   CMO Context
                         |
                   CMO Agent
                         |
                  JSON Cleanup
                         |
                   Gmail Send
```

The workflow is well-architected with a clear multi-agent hierarchy (Analysts -> Director -> CMO). The main issue is the security vulnerability with the hardcoded Facebook token.
