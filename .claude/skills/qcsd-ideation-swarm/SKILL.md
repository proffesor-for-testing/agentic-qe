---
name: qcsd-ideation-swarm
description: "QCSD Ideation phase swarm for Quality Criteria sessions using HTSM v6.3, Risk Storming, and Testability analysis before development begins."
category: qcsd-phases
priority: critical
tokenEstimate: 1800
agents: [qe-quality-criteria-recommender, qe-risk-assessor, qe-requirements-validator, qe-accessibility-auditor, qe-security-auditor, qe-qx-partner]
implementation_status: working
optimization_version: 2.0
last_optimized: 2026-01-25
dependencies: [testability-scoring, risk-based-testing, context-driven-testing, holistic-testing-pact]
quick_reference_card: true
tags: [qcsd, ideation, htsm, quality-criteria, risk-storming, testability, enable-engage, pi-planning]
---

# QCSD Ideation Swarm

## WORKING IMPLEMENTATION

<default_to_action>
When running Quality Criteria sessions, PI Planning, or Ideation phase analysis:

**Step 1: Initialize Fleet (MCP Tool)**
```javascript
mcp__agentic_qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "quality-assessment", "security-compliance", "visual-accessibility"],
  maxAgents: 6,
  lazyLoading: true
})
```

**Step 2: Spawn Agents in Parallel (Task Tool)**
Use a SINGLE message with multiple Task calls for parallel execution:

```javascript
// ALL THREE in ONE message for parallel execution
Task({
  prompt: `Run HTSM v6.3 Quality Criteria analysis on this epic:

${epicContent}

Analyze ALL 10 HTSM categories:
1. Capability - Can it perform required functions?
2. Reliability - Will it resist failure?
3. Usability - How easy for real users?
4. Charisma - How appealing/engaging?
5. Security - How protected against threats?
6. Scalability - How well does it scale?
7. Compatibility - Works with external systems?
8. Performance - How speedy and responsive?
9. Installability - How easily deployed?
10. Development - How well can we test/modify?

For each category provide:
- Score (1-5)
- Evidence type (Direct with file:line, Inferred with reasoning, or Claimed)
- Key risks
- Test focus recommendations

Output as structured markdown report.`,
  subagent_type: "qe-quality-criteria-recommender",
  run_in_background: true
})

Task({
  prompt: `Perform Risk Storming analysis on this epic:

${epicContent}

Identify and score risks in these categories:
1. Technical risks (architecture, dependencies, complexity)
2. Business risks (compliance, deadlines, budget)
3. Quality risks (testability, coverage gaps, tech debt)
4. Integration risks (APIs, external systems, data)

For each risk provide:
- Description
- Likelihood (Low/Medium/High)
- Impact (Low/Medium/High)
- Risk Score (Likelihood × Impact)
- Mitigation strategy

Output as Risk Matrix table.`,
  subagent_type: "qe-risk-assessor",
  run_in_background: true
})

Task({
  prompt: `Validate acceptance criteria completeness:

Acceptance Criteria:
${acceptanceCriteria}

Check each AC for:
1. Testability - Can we write automated tests?
2. Completeness - Edge cases covered?
3. Clarity - Unambiguous language?
4. Measurability - Quantifiable success criteria?

Output:
- AC Validation Report
- Missing edge cases
- Suggested improvements
- Testability score (0-100%)`,
  subagent_type: "qe-requirements-validator",
  run_in_background: true
})
```

**Step 3: Store Results (MCP Tool)**
After agents complete, store learnings:

```javascript
mcp__agentic_qe__memory_store({
  key: "qcsd-ideation-epic-" + epicId,
  namespace: "qcsd-ideation",
  value: {
    epicId: epicId,
    htsmScores: htsmResults,
    riskMatrix: riskResults,
    acValidation: validationResults,
    timestamp: new Date().toISOString()
  }
})
```

**Quick Commands:**
- Full swarm: `/qcsd-ideation-swarm "Epic: <description>"`
- HTSM only: `Task({ prompt: "HTSM analysis...", subagent_type: "qe-quality-criteria-recommender" })`
- Risk only: `Task({ prompt: "Risk assessment...", subagent_type: "qe-risk-assessor" })`
</default_to_action>

---

## When to Use

| Context | Use This Skill? |
|---------|-----------------|
| PI Planning sessions | ✅ Yes |
| Sprint Planning | ✅ Yes |
| Epic/Feature kickoff | ✅ Yes |
| Quality Criteria workshops | ✅ Yes |
| Risk Storming sessions | ✅ Yes |
| Small bug fixes | ❌ No (overkill) |
| Single-file changes | ❌ No |

---

## Agent Responsibilities

| Agent | What It Does | Output |
|-------|--------------|--------|
| `qe-quality-criteria-recommender` | HTSM v6.3 analysis of 10 quality categories | Quality Criteria Report |
| `qe-risk-assessor` | Risk identification and scoring | Risk Matrix |
| `qe-requirements-validator` | AC completeness and testability check | Validation Report |
| `qe-accessibility-auditor` | WCAG compliance gaps (UI features) | A11y Findings |
| `qe-security-auditor` | Threat modeling (security features) | Security Risks |
| `qe-qx-partner` | QE + UX quality pairing | QX Assessment |

---

## Quality Gate Thresholds

| Metric | Minimum | Target | Blocker |
|--------|---------|--------|---------|
| HTSM Coverage | 8/10 categories | 10/10 | <6 categories |
| Testability Score | 60% | 80%+ | <40% |
| Risk Items Identified | 5+ | 10+ | 0 |
| AC Completeness | 70% | 90%+ | <50% |

---

## HTSM v6.3 Quality Categories

| # | Category | Question | Never Omit? |
|---|----------|----------|-------------|
| 1 | Capability | Can it perform required functions? | **NEVER** |
| 2 | Reliability | Will it resist failure? | **NEVER** |
| 3 | Usability | How easy for real users? | Rarely |
| 4 | Charisma | How appealing/engaging? | With evidence |
| 5 | Security | How protected against threats? | **NEVER** |
| 6 | Scalability | How well does it scale? | Rarely |
| 7 | Compatibility | Works with external systems? | With evidence |
| 8 | Performance | How speedy and responsive? | **NEVER** |
| 9 | Installability | How easily deployed? | SaaS only |
| 10 | Development | How well can we test/modify? | **NEVER** |

### Evidence Classification

| Type | Definition | How to Cite |
|------|------------|-------------|
| **Direct** | Actual code/doc quote | `src/auth/login.ts:45-52` |
| **Inferred** | Logical deduction | Show reasoning chain |
| **Claimed** | Needs verification | State "requires verification" |

---

## Complete Example: Running Ideation Swarm

### Input: Epic Description
```
Epic: User Authentication Overhaul
- Implement SSO with OAuth2/OIDC
- Add MFA support (TOTP, SMS, email)
- Session management with 30-min timeout
- Audit logging for all auth events
```

### Step 1: Initialize Fleet
```javascript
mcp__agentic_qe__fleet_init({
  topology: "hierarchical",
  enabledDomains: ["requirements-validation", "quality-assessment", "security-compliance"],
  maxAgents: 6,
  lazyLoading: true
})
```

### Step 2: Spawn Agents (Single Message, Parallel)

```javascript
// Message 1: All three agents spawn in parallel
Task({
  prompt: `Run HTSM v6.3 Quality Criteria analysis on:

Epic: User Authentication Overhaul
- Implement SSO with OAuth2/OIDC
- Add MFA support (TOTP, SMS, email)
- Session management with 30-min timeout
- Audit logging for all auth events

Analyze ALL 10 HTSM categories with scores, evidence, risks, and test focus.`,
  subagent_type: "qe-quality-criteria-recommender",
  run_in_background: true
})

Task({
  prompt: `Perform Risk Storming on:

Epic: User Authentication Overhaul
- SSO with OAuth2/OIDC
- MFA (TOTP, SMS, email)
- Session management
- Audit logging

Identify technical, business, quality, and integration risks with likelihood/impact scoring.`,
  subagent_type: "qe-risk-assessor",
  run_in_background: true
})

Task({
  prompt: `Validate acceptance criteria:

AC1: Users can login via corporate SSO
AC2: MFA is required for admin accounts
AC3: Sessions expire after 30 minutes of inactivity
AC4: All auth events are logged with user ID, timestamp, action

Check testability, completeness, clarity, measurability.`,
  subagent_type: "qe-requirements-validator",
  run_in_background: true
})
```

### Step 3: Optional Specialized Agents

For security-sensitive features like auth, also spawn:

```javascript
Task({
  prompt: `Perform threat modeling on authentication epic:
- SSO/OAuth2 attack vectors
- MFA bypass risks
- Session hijacking
- Token security

Output: STRIDE threat analysis with mitigations.`,
  subagent_type: "qe-security-auditor",
  run_in_background: true
})
```

### Step 4: Store Results

```javascript
mcp__agentic_qe__memory_store({
  key: "qcsd-ideation-auth-overhaul",
  namespace: "qcsd-ideation",
  value: {
    epicId: "AUTH-001",
    epicName: "User Authentication Overhaul",
    htsmScores: {
      capability: 4,
      reliability: 3,
      usability: 4,
      charisma: 2,
      security: 5,
      scalability: 3,
      compatibility: 4,
      performance: 3,
      installability: 3,
      development: 4
    },
    overallScore: 35,
    riskCount: 12,
    criticalRisks: 3,
    acCompleteness: 75,
    recommendation: "CONDITIONAL - address critical security risks"
  }
})
```

---

## Output: Ideation Report Template

```markdown
# Ideation Report: [Epic Name]

## Executive Summary
- **Overall Quality Readiness:** [Score]/50
- **Testability Score:** [Score]%
- **Risk Level:** [Low/Medium/High/Critical]
- **Recommendation:** [GO/CONDITIONAL/NO-GO]

## HTSM Quality Criteria

| Category | Score | Evidence | Key Risks |
|----------|-------|----------|-----------|
| Capability | 4/5 | Direct: `src/auth/sso.ts` | SSO provider integration |
| Reliability | 3/5 | Inferred | No failover for MFA |
| Security | 5/5 | Direct: threat model | Token expiry, session mgmt |
| ... | ... | ... | ... |

## Risk Matrix

| Risk | Likelihood | Impact | Score | Mitigation |
|------|------------|--------|-------|------------|
| OAuth provider outage | Medium | High | 6 | Fallback auth method |
| MFA SMS delivery failure | Medium | Medium | 4 | Multiple MFA options |
| Session token theft | Low | Critical | 5 | Secure cookies, rotation |

## AC Validation

| AC | Testable? | Complete? | Issues |
|----|-----------|-----------|--------|
| AC1: SSO login | Yes | Yes | - |
| AC2: Admin MFA | Yes | Partial | Missing "admin" definition |
| AC3: Session timeout | Yes | Yes | - |
| AC4: Audit logging | Yes | No | Missing retention policy |

## Recommendations
1. **P0:** Define threat model before development
2. **P1:** Add failover authentication method
3. **P1:** Specify audit log retention policy
4. **P2:** Add performance requirements for login latency

## Next Steps
- [ ] Address P0 items before sprint commitment
- [ ] Refine AC2 and AC4
- [ ] Schedule security review with AppSec team
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| MCP tool fails | Fleet not initialized | Run `mcp__agentic_qe__fleet_init` first |
| Agent timeout | Complex analysis | Increase timeout, split into smaller prompts |
| Low HTSM scores | Insufficient epic detail | Request more requirements/design docs |
| No risks found | Shallow analysis | Run security-auditor for deeper threat model |
| Evidence all "Claimed" | No code provided | Provide design docs or architecture diagrams |

---

## Valid Domain Names

For `enabledDomains` parameter, use these exact strings:
- `test-generation`
- `test-execution`
- `coverage-analysis`
- `quality-assessment`
- `defect-intelligence`
- `requirements-validation`
- `code-intelligence`
- `security-compliance`
- `contract-testing`
- `visual-accessibility`
- `chaos-resilience`
- `learning-optimization`

---

## CLI Usage

```bash
# Invoke the full swarm
claude "/qcsd-ideation-swarm Epic: User Authentication Overhaul - SSO, MFA, session management"

# With file input
claude "/qcsd-ideation-swarm $(cat docs/epics/auth-overhaul.md)"

# Quality criteria only
claude "Run HTSM Quality Criteria analysis on the authentication epic in docs/epics/auth-overhaul.md"
```

---

## Key Principle

**Quality is built in from the start, not tested in at the end.**

The Ideation Swarm answers THREE questions before development:
1. **What quality risks exist?** → HTSM Quality Criteria
2. **How testable is this design?** → Testability assessment
3. **What could go wrong?** → Risk Matrix

**Success Metric:** Zero "surprise" quality issues in development that could have been identified in ideation.

---

**QCSD Phase:** Enable & Engage → Ideation
**Next Phase:** Grooming Swarm (SFDIPOT + BDD for user stories)
