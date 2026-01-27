# n8n Security Audit Report

## Executive Summary

| Metric | Value |
|--------|-------|
| **Workflow ID** | wFp8WszRSWcKuhGA |
| **Workflow Name** | Agentic_Marketing_Performance_Dept_v02 |
| **Audit Date** | 2026-01-23 |
| **Risk Score** | **CRITICAL (18/100)** |
| **Critical Findings** | 1 |
| **High Findings** | 2 |
| **Medium Findings** | 3 |
| **Low Findings** | 2 |

```
CRITICAL  ████████████████████  1 finding   (IMMEDIATE ACTION REQUIRED)
HIGH      ████████░░░░░░░░░░░░  2 findings
MEDIUM    ██████░░░░░░░░░░░░░░  3 findings
LOW       ████░░░░░░░░░░░░░░░░  2 findings
```

---

## CRITICAL FINDINGS

### CRIT-001: HARDCODED META/FACEBOOK ACCESS TOKEN

**Severity:** CRITICAL
**OWASP Category:** A02 - Cryptographic Failures
**Node:** "Get Meta Ads Data" (HTTP Request)
**Location:** `parameters.queryParameters.parameters[0].value`

**Finding:**
```json
{
  "name": "access_token",
  "value": "EAAJSWttgAsoBQ...[REDACTED]"
}
```

**Impact:**
- **Full Facebook/Meta Ads API access exposed** - Attacker can read all ad performance data
- **Ad account manipulation** - Could pause/modify/delete ad campaigns
- **Financial exposure** - Could create new ads spending client's budget
- **Token stored in workflow JSON** - Visible to anyone with workflow access, exported, or in version control
- **No expiration handling** - Long-lived tokens are higher risk

**Attack Scenario:**
1. Workflow is exported, shared, or backed up
2. Token is extracted from JSON
3. Attacker uses token to access `https://graph.facebook.com/v19.0/act_2144618699332578/`
4. Full ad account access achieved

**Immediate Remediation:**

1. **ROTATE THE TOKEN IMMEDIATELY** at https://business.facebook.com/settings/security
2. Create an n8n credential for Meta/Facebook OAuth:
   ```json
   {
     "credentials": {
       "facebookGraphApi": {
         "id": "<new_cred_id>",
         "name": "Meta Ads API Credential"
       }
     }
   }
   ```
3. Update node to use credential reference instead of hardcoded value
4. Delete the token from query parameters

**Status:** REQUIRES IMMEDIATE ACTION

---

## HIGH FINDINGS

### HIGH-001: SENSITIVE FACEBOOK AD ACCOUNT ID EXPOSURE

**Severity:** HIGH
**OWASP Category:** A01 - Broken Access Control
**Node:** "Get Meta Ads Data"
**Location:** `parameters.url`

**Finding:**
```
https://graph.facebook.com/v19.0/act_2144618699332578/insights
```

**Impact:**
- Ad Account ID `2144618699332578` is hardcoded in workflow
- Combined with leaked token, provides complete targeting information
- Enables direct API calls to specific account
- Account enumeration becomes trivial

**Remediation:**
Use environment variable or credential store:
```javascript
url: "https://graph.facebook.com/v19.0/act_{{ $env.META_AD_ACCOUNT_ID }}/insights"
```

---

### HIGH-002: PLAINTEXT EMAIL ADDRESSES EXPOSED

**Severity:** HIGH
**OWASP Category:** A02 - Cryptographic Failures
**Nodes:** Multiple Gmail nodes
**Locations:**
- "Send Meta Ads Report"
- "Send Spotify Report"
- "Send Marketing Director Email"
- "Send Spotify Report2"

**Finding:**
```json
{
  "sendTo": "dominic.veit@accenture.com"
}
```

**Impact:**
- Corporate email addresses hardcoded in workflow
- PII exposure risk
- Phishing attack vector (attacker knows who receives reports)
- GDPR/Privacy compliance concern

**Remediation:**
Use environment variables or a configuration node:
```javascript
sendTo: "={{ $env.REPORT_RECIPIENT_EMAIL }}"
```

---

## MEDIUM FINDINGS

### MED-001: UNVALIDATED USER INPUT IN CODE NODES

**Severity:** MEDIUM
**OWASP Category:** A03 - Injection
**Nodes:** Multiple Code nodes (6 total)

**Finding:**
The Code nodes process data from external APIs without validation:

**Node: "Format Output"**
```javascript
for (const ad of adsData) {
  markdownTable += `| ${ad.ad_name} | ${ad.spend} | ...`;  // NO SANITIZATION
}
```

**Impact:**
- Malformed data from Meta API could break workflow
- JSON injection possible if AI model returns malicious content
- No schema validation on parsed data
- XSS risk if email_body HTML is not sanitized

**Remediation:**
Add input validation:
```javascript
// Validate expected fields
if (!adsData || !Array.isArray(adsData)) {
  throw new Error("Invalid ads data structure");
}

// Sanitize string inputs
const sanitize = (str) => String(str).replace(/[<>&"']/g, '');
markdownTable += `| ${sanitize(ad.ad_name)} | ${sanitize(ad.spend)} |`;
```

---

### MED-002: NO ERROR HANDLING FOR CREDENTIAL FAILURES

**Severity:** MEDIUM
**OWASP Category:** A05 - Security Misconfiguration
**Nodes:** All credential-using nodes

**Finding:**
Nodes using credentials lack error handling for authentication failures:
- Google BigQuery nodes (5 instances)
- Gmail nodes (4 instances)
- Google Vertex AI nodes (4 instances)

**Impact:**
- Credential expiration silently fails workflow
- No alerting on authentication issues
- Potential data loss if reports fail to send

**Remediation:**
Add error handling workflow branch for each critical node, or implement workflow-level error handling.

---

### MED-003: GOOGLE CLOUD PROJECT ID EXPOSURE

**Severity:** MEDIUM
**OWASP Category:** A02 - Cryptographic Failures
**Nodes:** All BigQuery and Vertex AI nodes

**Finding:**
```json
{
  "projectId": {
    "value": "bmsg-analytics-agents",
    "cachedResultName": "BMSG Analytics Agents"
  }
}
```

**Impact:**
- GCP project identifier exposed
- Combined with other information, aids in reconnaissance
- Project name reveals business context

**Remediation:**
Use environment variable:
```javascript
projectId: "={{ $env.GCP_PROJECT_ID }}"
```

---

## LOW FINDINGS

### LOW-001: WEBHOOK ID EXPOSURE

**Severity:** LOW
**OWASP Category:** A02 - Cryptographic Failures
**Nodes:** Gmail nodes

**Finding:**
```json
{
  "webhookId": "37ea4d9f-376e-44ac-ab17-3eab430d880b"
}
```

**Impact:**
- Internal webhook identifiers exposed
- Could aid in API enumeration attacks
- Minor information disclosure

---

### LOW-002: DEBUG ERROR OUTPUT TO EMAIL

**Severity:** LOW
**OWASP Category:** A09 - Logging & Monitoring Failures
**Nodes:** Code cleanup nodes

**Finding:**
```javascript
return {
    json: {
        error: "JSON Parse Failed",
        message: e.message,
        debug_text: cleanText  // RAW DATA EXPOSED
    }
};
```

**Impact:**
- Error details potentially sent in emails
- Could expose raw API responses
- Information disclosure to email recipients

**Remediation:**
```javascript
return {
    json: {
        error: "Processing Error",
        contact: "Please contact support if this persists"
    }
};
// Log detailed errors to monitoring system instead
```

---

## OWASP TOP 10 COMPLIANCE

| Category | Status | Findings |
|----------|--------|----------|
| A01 Broken Access Control | FAIL | 1 HIGH |
| A02 Cryptographic Failures | FAIL | 1 CRITICAL, 1 HIGH, 2 MEDIUM |
| A03 Injection | WARN | 1 MEDIUM |
| A04 Insecure Design | PASS | 0 |
| A05 Security Misconfiguration | WARN | 1 MEDIUM |
| A06 Vulnerable Components | PASS | 0 |
| A07 Authentication Failures | PASS | 0 (credentials use OAuth properly) |
| A08 Data Integrity Failures | WARN | 1 LOW |
| A09 Logging Failures | WARN | 1 LOW |
| A10 SSRF | PASS | 0 |

**Compliance Score: 40%** (4/10 categories pass)

---

## CREDENTIAL USAGE ANALYSIS

### Proper Credential Usage (GOOD):
| Credential | Type | Nodes Using |
|------------|------|-------------|
| `l48ebvDqv9DgY1ti` | Google BigQuery/Vertex AI | 9 nodes |
| `8MDLDMIukkjltkOW` | Gmail OAuth2 | 4 nodes |

**Analysis:** The workflow correctly uses n8n's credential store for Google services and Gmail. This is the proper pattern.

### Improper Credential Usage (BAD):
| Secret | Type | Location |
|--------|------|----------|
| Meta Access Token | Hardcoded | HTTP Request query parameter |
| Ad Account ID | Hardcoded | HTTP Request URL |
| Email addresses | Hardcoded | Gmail node parameters |

---

## REMEDIATION PRIORITY

| Priority | Finding | Effort | Impact | Timeline |
|----------|---------|--------|--------|----------|
| 1 | CRIT-001: Hardcoded Meta Token | Low | Critical | IMMEDIATE |
| 2 | HIGH-001: Ad Account ID Exposure | Low | High | 24 hours |
| 3 | HIGH-002: Email PII Exposure | Low | High | 24 hours |
| 4 | MED-001: Input Validation | Medium | Medium | 1 week |
| 5 | MED-002: Error Handling | Medium | Medium | 1 week |
| 6 | MED-003: Project ID Exposure | Low | Medium | 1 week |

---

## SECURITY REMEDIATION CHECKLIST

- [ ] **IMMEDIATE:** Rotate Meta/Facebook access token at business.facebook.com
- [ ] Create n8n credential for Facebook Graph API
- [ ] Update HTTP Request node to use credential reference
- [ ] Move Ad Account ID to environment variable
- [ ] Move email addresses to environment variables or configuration
- [ ] Add input validation to all Code nodes
- [ ] Add schema validation for JSON parsing
- [ ] Implement workflow-level error handling
- [ ] Move GCP Project ID to environment variable
- [ ] Remove debug output from error responses
- [ ] Review and restrict workflow sharing permissions

---

## FINAL SECURITY SCORE

| Category | Score |
|----------|-------|
| Credential Management | 18/100 (CRITICAL - hardcoded token) |
| Data Protection | 45/100 (PII exposure) |
| Input Validation | 50/100 (No validation in Code nodes) |
| Error Handling | 40/100 (Debug output exposed) |
| OWASP Compliance | 40/100 (4/10 pass) |
| **Overall Security Score** | **18/100 (CRITICAL)** |

The workflow has one critical security vulnerability that requires immediate remediation. The hardcoded Facebook access token represents a significant security risk and should be rotated and migrated to the credential store immediately.

---

**Report Generated By:** N8n Security Auditor Agent
**Audit Framework:** OWASP Top 10 2021, n8n Security Best Practices
**Confidence Level:** 0.95
