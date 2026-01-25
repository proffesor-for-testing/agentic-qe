---
name: qcsd-ideation-swarm
description: "QCSD Ideation phase swarm for Quality Criteria sessions using HTSM v6.3, Risk Storming, and Testability analysis before development begins."
category: qcsd-phases
priority: critical
version: 6.1.0
tokenEstimate: 3000
agents:
  core: [qe-quality-criteria-recommender, qe-risk-assessor, qe-requirements-validator]
  conditional: [qe-accessibility-auditor, qe-security-auditor, qe-qx-partner]
skills: [testability-scoring]
methodologies: [risk-based-testing, context-driven-testing, holistic-testing-pact]
execution_model: task-tool-swarm
swarm_pattern: true
parallel_batches: 2
last_updated: 2026-01-25
html_output: true
enforcement_level: strict
tags: [qcsd, ideation, htsm, quality-criteria, risk-storming, testability, swarm, parallel]
---

# QCSD Ideation Swarm v6.1

Shift-left quality engineering swarm for PI Planning and Sprint Planning.

---

## ⛔ ENFORCEMENT RULES - READ FIRST

**These rules are NON-NEGOTIABLE. Violation means skill execution failure.**

| Rule | Enforcement |
|------|-------------|
| **E1** | You MUST spawn ALL THREE core agents in Phase 2. No exceptions. |
| **E2** | You MUST put all parallel Task calls in a SINGLE message. |
| **E3** | You MUST STOP and WAIT after each batch. No proceeding early. |
| **E4** | You MUST spawn conditional agents if flags are TRUE. No skipping. |
| **E5** | You MUST apply GO/CONDITIONAL/NO-GO logic exactly as specified. |
| **E6** | You MUST generate the full report structure. No abbreviated versions. |
| **E7** | Each agent MUST read its reference files before analysis. |

**❌ PROHIBITED BEHAVIORS:**
- Summarizing instead of spawning agents
- Skipping agents "for brevity"
- Proceeding before background tasks complete
- Providing your own analysis instead of spawning specialists
- Omitting report sections
- Using placeholder text like "[details here]"

---

## PHASE 1: Analyze Epic Content

**⚠️ MANDATORY: You must complete this analysis before Phase 2.**

Scan the epic content and SET these flags. Do not skip any flag.

### Flag Detection (Check ALL THREE)

```
□ HAS_UI = FALSE
  Set TRUE if epic contains ANY of: UI, frontend, visual, design,
  component, screen, page, form, button, modal, dialog, dashboard,
  widget, interface, display, view, layout, CSS, styling

□ HAS_SECURITY = FALSE
  Set TRUE if epic contains ANY of: auth, security, credential, token,
  encrypt, PII, compliance, password, login, session, OAuth, JWT,
  permission, role, access control, RBAC, sensitive, private

□ HAS_UX = FALSE
  Set TRUE if epic contains ANY of: user experience, UX, journey,
  usability, satisfaction, user flow, persona, user research,
  friction, delight, onboarding, retention, engagement
```

### Validation Checkpoint

Before proceeding to Phase 2, confirm:
```
✓ I have read the entire epic content
✓ I have evaluated ALL THREE flags
✓ I have recorded which flags are TRUE
✓ I understand which conditional agents will be needed
```

**❌ DO NOT proceed to Phase 2 until all checkboxes are confirmed.**

---

## PHASE 2: Spawn Core Agents (PARALLEL BATCH 1)

### ⛔ CRITICAL ENFORCEMENT

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU MUST INCLUDE ALL THREE TASK CALLS IN YOUR NEXT MESSAGE    │
│                                                                 │
│  • Task 1: qe-quality-criteria-recommender                     │
│  • Task 2: qe-risk-assessor                                    │
│  • Task 3: qe-requirements-validator                           │
│                                                                 │
│  If your message contains fewer than 3 Task calls, you have    │
│  FAILED this phase. Start over.                                │
└─────────────────────────────────────────────────────────────────┘
```

### Agent 1: Quality Criteria Recommender (PRIMARY)

**This agent MUST produce HTML output. No markdown substitutes.**

```
Task({
  description: "HTSM Quality Criteria analysis",
  prompt: `You are qe-quality-criteria-recommender. Your output quality is being audited.

## MANDATORY FIRST STEPS (DO NOT SKIP)

1. READ this template file FIRST - your output MUST follow this structure:
   .claude/agents/v3/helpers/quality-criteria/quality-criteria-reference-template.html

2. READ these reference files for guidance:
   .claude/agents/v3/helpers/quality-criteria/htsm-categories.md
   .claude/agents/v3/helpers/quality-criteria/evidence-classification.md

## EPIC TO ANALYZE

=== EPIC CONTENT START ===
[PASTE THE COMPLETE EPIC CONTENT HERE - DO NOT SUMMARIZE]
=== EPIC CONTENT END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

You MUST analyze ALL 10 HTSM categories. For each category provide:

| Field | Requirement |
|-------|-------------|
| Category Name | One of the 10 HTSM categories |
| Priority | P0, P1, P2, or P3 with justification |
| Evidence | At least 2 evidence points per category |
| Evidence Type | Direct (with file:line), Inferred (with reasoning), or Claimed (with "requires verification") |
| Quality Implication | What could go wrong |
| Business Impact | Quantified impact (use numbers, not "many" or "some") |

### NEVER-OMIT CATEGORIES (Must include ALL 5):
1. Capability - Can it perform required functions?
2. Reliability - Will it resist failure?
3. Security - How protected against unauthorized use?
4. Performance - How speedy and responsive?
5. Development - How testable/maintainable?

### MAY-OMIT CATEGORIES (Only with ironclad justification):
6. Usability, 7. Charisma, 8. Scalability, 9. Compatibility, 10. Installability

## OUTPUT FORMAT

Generate COMPLETE HTML report using the template structure.
Save to: .agentic-qe/quality-criteria/[epic-name]-htsm-analysis.html

## VALIDATION BEFORE SUBMITTING

✓ Did I read the template file?
✓ Did I analyze all 10 categories (or justify omissions)?
✓ Does every evidence point have proper classification?
✓ Are business impacts quantified with numbers?
✓ Is output in HTML format using template structure?`,
  subagent_type: "qe-quality-criteria-recommender",
  run_in_background: true
})
```

### Agent 2: Risk Assessor

**This agent MUST identify at least 5 risks. Fewer is a failure.**

```
Task({
  description: "Risk Storming analysis",
  prompt: `You are qe-risk-assessor. Your output quality is being audited.

## METHODOLOGY

Apply risk-based-testing methodology systematically.

## EPIC TO ANALYZE

=== EPIC CONTENT START ===
[PASTE THE COMPLETE EPIC CONTENT HERE - DO NOT SUMMARIZE]
=== EPIC CONTENT END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### Risk Identification Requirements

You MUST identify risks in ALL FOUR categories:
1. **Technical Risks** - Architecture, integration, dependencies, complexity
2. **Business Risks** - Revenue impact, user impact, compliance, reputation
3. **Quality Risks** - Testability, maintainability, reliability concerns
4. **Integration Risks** - Third-party services, APIs, data flows

**MINIMUM: 5 total risks. Target: 10+ risks.**

### For EACH Risk, Provide:

| Field | Requirement |
|-------|-------------|
| Risk ID | R001, R002, etc. |
| Description | Specific, actionable description (not vague) |
| Category | Technical, Business, Quality, or Integration |
| Likelihood | 1-5 scale with justification |
| Impact | 1-5 scale with justification |
| Risk Score | Likelihood × Impact |
| Mitigation | Specific mitigation strategy |
| Owner | Suggested owner (Dev, QE, Product, Ops) |

### Critical Risk Threshold
- Score ≥ 15 = CRITICAL (must be flagged prominently)
- Score 10-14 = HIGH
- Score 5-9 = MEDIUM
- Score < 5 = LOW

## OUTPUT FORMAT

Markdown with:
1. Executive Summary (top 3 risks in bold)
2. Risk Matrix Table (sorted by score descending)
3. Critical Risks Section (if any score ≥ 15)
4. Mitigation Priority List

## VALIDATION BEFORE SUBMITTING

✓ Did I identify at least 5 risks?
✓ Did I cover all 4 risk categories?
✓ Does every risk have likelihood, impact, AND score?
✓ Are critical risks (≥15) clearly flagged?
✓ Does every risk have a specific mitigation?`,
  subagent_type: "qe-risk-assessor",
  run_in_background: true
})
```

### Agent 3: Requirements Validator

**This agent MUST provide testability score 0-100. No ranges.**

```
Task({
  description: "AC validation and testability scoring",
  prompt: `You are qe-requirements-validator. Your output quality is being audited.

## METHODOLOGY

Apply context-driven-testing and testability-scoring principles.

## ACCEPTANCE CRITERIA TO VALIDATE

=== ACCEPTANCE CRITERIA START ===
[PASTE THE COMPLETE ACCEPTANCE CRITERIA HERE - DO NOT SUMMARIZE]
=== ACCEPTANCE CRITERIA END ===

## REQUIRED OUTPUT (ALL SECTIONS MANDATORY)

### 1. Testability Score (MANDATORY - SINGLE NUMBER)

Score each of the 10 testability principles (0-10 each):

| Principle | Score | Evidence |
|-----------|-------|----------|
| Controllability | X/10 | Can we control inputs/state? |
| Observability | X/10 | Can we observe outputs/behavior? |
| Isolability | X/10 | Can we test in isolation? |
| Separation of Concerns | X/10 | Are responsibilities clear? |
| Understandability | X/10 | Is behavior clearly specified? |
| Automatability | X/10 | Can tests be automated? |
| Heterogeneity | X/10 | Works across environments? |
| Simplicity | X/10 | Is complexity manageable? |
| Stability | X/10 | Are requirements stable? |
| Information Availability | X/10 | Do we have needed info? |

**TOTAL TESTABILITY SCORE: XX/100**

### 2. AC Completeness Assessment

For EACH acceptance criterion:

| AC ID | Text | INVEST Score | Issues | Testable? |
|-------|------|--------------|--------|-----------|
| AC1 | ... | X/6 | ... | Yes/No |

INVEST Criteria:
- **I**ndependent (can be tested alone)
- **N**egotiable (not over-specified)
- **V**aluable (delivers value)
- **E**stimable (can estimate effort)
- **S**mall (testable in one session)
- **T**estable (clear pass/fail)

**AC COMPLETENESS: XX%** (ACs that are fully testable / total ACs)

### 3. Gaps Identified (MANDATORY)

List ALL gaps found:
- Missing scenarios
- Unclear requirements
- Untestable criteria
- Ambiguous language
- Missing edge cases

**MINIMUM: Identify at least 3 gaps or explicitly state "No gaps found after thorough analysis"**

### 4. Recommendations

Specific, actionable recommendations to improve testability.

## VALIDATION BEFORE SUBMITTING

✓ Did I score all 10 testability principles?
✓ Did I calculate a single testability score (not a range)?
✓ Did I assess every AC against INVEST?
✓ Did I calculate AC completeness percentage?
✓ Did I identify gaps (or explicitly confirm none)?`,
  subagent_type: "qe-requirements-validator",
  run_in_background: true
})
```

### Post-Spawn Confirmation

After sending all three Task calls, you MUST tell the user:

```
I've launched 3 core agents in parallel:

🎯 qe-quality-criteria-recommender
   - Analyzing all 10 HTSM v6.3 categories
   - Collecting evidence with classifications
   - Generating HTML report

⚠️ qe-risk-assessor
   - Identifying Technical, Business, Quality, Integration risks
   - Scoring likelihood × impact
   - Prioritizing mitigations

✅ qe-requirements-validator
   - Scoring testability (10 principles)
   - Validating ACs against INVEST
   - Identifying gaps

⏳ WAITING for all agents to complete before proceeding...
```

**❌ DO NOT proceed to Phase 3 until you have sent this confirmation.**

---

## PHASE 3: Wait for Batch 1 Completion

### ⛔ ENFORCEMENT: NO EARLY PROCEEDING

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU MUST WAIT FOR ALL THREE BACKGROUND TASKS TO COMPLETE      │
│                                                                 │
│  ❌ DO NOT summarize what agents "would" find                   │
│  ❌ DO NOT proceed to Phase 4 early                             │
│  ❌ DO NOT provide your own analysis as substitute              │
│                                                                 │
│  ✓ WAIT for actual agent results                               │
│  ✓ ONLY proceed when all three have returned                   │
└─────────────────────────────────────────────────────────────────┘
```

### Results Extraction Checklist

When results return, extract and record:

```
From qe-quality-criteria-recommender:
□ htsmCoverage = __/10 categories analyzed
□ p0Count = __ P0 priority items
□ evidenceQuality = Direct __%, Inferred __%, Claimed __%

From qe-risk-assessor:
□ totalRisks = __ risks identified
□ criticalRisks = __ risks with score ≥ 15
□ topRiskScore = __ (highest score)

From qe-requirements-validator:
□ testabilityScore = __/100
□ acCompleteness = __%
□ gapsIdentified = __ gaps
```

**❌ DO NOT proceed to Phase 4 until ALL fields are filled.**

---

## PHASE 4: Spawn Conditional Agents (PARALLEL BATCH 2)

### ⛔ ENFORCEMENT: NO SKIPPING CONDITIONAL AGENTS

```
┌─────────────────────────────────────────────────────────────────┐
│  IF A FLAG IS TRUE, YOU MUST SPAWN THAT AGENT                  │
│                                                                 │
│  HAS_UI = TRUE     → MUST spawn qe-accessibility-auditor       │
│  HAS_SECURITY = TRUE → MUST spawn qe-security-auditor          │
│  HAS_UX = TRUE     → MUST spawn qe-qx-partner                  │
│                                                                 │
│  Skipping a flagged agent is a FAILURE of this skill.          │
└─────────────────────────────────────────────────────────────────┘
```

### Decision Tree

```
IF HAS_UI == FALSE AND HAS_SECURITY == FALSE AND HAS_UX == FALSE:
    → Skip to Phase 5 (no conditional agents needed)
    → State: "No conditional agents needed based on epic analysis"

ELSE:
    → Spawn ALL applicable agents in ONE message
    → Count how many you're spawning: __
```

### IF HAS_UI: Accessibility Auditor (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Early accessibility review",
  prompt: `You are qe-accessibility-auditor. Your output quality is being audited.

## EPIC CONTENT

=== EPIC CONTENT START ===
[PASTE THE COMPLETE EPIC CONTENT HERE]
=== EPIC CONTENT END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. UI Components Inventory

List EVERY UI component mentioned or implied:
| Component | Type | A11y Risk Level |
|-----------|------|-----------------|

### 2. WCAG 2.1 AA Risk Assessment

For each component, assess against:
- Perceivable (text alternatives, captions, adaptable, distinguishable)
- Operable (keyboard, timing, seizures, navigation)
- Understandable (readable, predictable, input assistance)
- Robust (compatible with assistive tech)

### 3. Keyboard Navigation Requirements

List ALL interactions that MUST support keyboard:
- [ ] Requirement 1
- [ ] Requirement 2
- ...

### 4. Screen Reader Considerations

What must be announced? What ARIA roles needed?

### 5. Findings Summary

| Finding | Severity | WCAG Criterion | Recommendation |
|---------|----------|----------------|----------------|

Severity: Critical (blocker), Major (significant barrier), Minor (inconvenience)

**MINIMUM: 3 findings or explicit "No accessibility risks identified after thorough analysis"**`,
  subagent_type: "qe-accessibility-auditor",
  run_in_background: true
})
```

### IF HAS_SECURITY: Security Auditor (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Security threat modeling",
  prompt: `You are qe-security-auditor. Your output quality is being audited.

## EPIC CONTENT

=== EPIC CONTENT START ===
[PASTE THE COMPLETE EPIC CONTENT HERE]
=== EPIC CONTENT END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. STRIDE Threat Model

Analyze against ALL SIX categories:

| Threat Type | Applicable? | Threats Identified | Mitigations |
|-------------|-------------|-------------------|-------------|
| **S**poofing | Yes/No | ... | ... |
| **T**ampering | Yes/No | ... | ... |
| **R**epudiation | Yes/No | ... | ... |
| **I**nformation Disclosure | Yes/No | ... | ... |
| **D**enial of Service | Yes/No | ... | ... |
| **E**levation of Privilege | Yes/No | ... | ... |

### 2. Authentication/Authorization Requirements

- Auth method required: ___
- Session management: ___
- Permission model: ___

### 3. Data Protection Concerns

| Data Type | Classification | Protection Required |
|-----------|---------------|---------------------|
| ... | PII/Sensitive/Public | Encryption/Masking/None |

### 4. Compliance Implications

Check ALL that apply:
- [ ] GDPR (EU user data)
- [ ] CCPA (California user data)
- [ ] SOC 2 (security controls)
- [ ] HIPAA (health data)
- [ ] PCI-DSS (payment data)
- [ ] Other: ___

### 5. Security Testing Requirements

What security tests MUST be performed?

**MINIMUM: Identify threats in at least 3 STRIDE categories**`,
  subagent_type: "qe-security-auditor",
  run_in_background: true
})
```

### IF HAS_UX: QX Partner (MANDATORY WHEN FLAGGED)

```
Task({
  description: "Quality Experience analysis",
  prompt: `You are qe-qx-partner. Your output quality is being audited.

## METHODOLOGY

Apply holistic-testing-pact methodology (PACT principles).

## EPIC CONTENT

=== EPIC CONTENT START ===
[PASTE THE COMPLETE EPIC CONTENT HERE]
=== EPIC CONTENT END ===

## REQUIRED ANALYSIS (ALL SECTIONS MANDATORY)

### 1. PACT Analysis

| Dimension | Analysis |
|-----------|----------|
| **P**eople | Who are the users? Personas? Needs? |
| **A**ctivities | What are they trying to do? Goals? |
| **C**ontexts | Where/when/how do they use this? |
| **T**echnologies | What tech constraints exist? |

### 2. User Personas Affected

| Persona | Impact Level | Key Concerns |
|---------|--------------|--------------|
| ... | High/Medium/Low | ... |

### 3. User Journey Impact

Map affected touchpoints:
```
[Entry] → [Step 1] → [Step 2] → [Exit]
           ↑ Impact    ↑ Impact
```

### 4. Quality Experience Risks

| QX Risk | User Feeling | Business Impact |
|---------|--------------|-----------------|
| ... | Frustrated/Confused/Delighted | ... |

### 5. UX Testing Recommendations

What UX-specific tests are needed?
- Usability testing needs
- User research gaps
- A/B testing candidates

**MINIMUM: Identify 3 QX risks or explicit "No QX risks after thorough analysis"**`,
  subagent_type: "qe-qx-partner",
  run_in_background: true
})
```

### Post-Spawn Confirmation (If Applicable)

```
I've launched [N] conditional agent(s) in parallel:

[IF HAS_UI] ♿ qe-accessibility-auditor - WCAG 2.1 AA assessment
[IF HAS_SECURITY] 🔒 qe-security-auditor - STRIDE threat modeling
[IF HAS_UX] 💫 qe-qx-partner - PACT quality experience analysis

⏳ WAITING for conditional agents to complete...
```

---

## PHASE 5: Synthesize Results & Determine Recommendation

### ⛔ ENFORCEMENT: EXACT DECISION LOGIC

**You MUST apply this logic EXACTLY. No interpretation.**

```
STEP 1: Check NO-GO conditions (ANY triggers NO-GO)
─────────────────────────────────────────────────
IF testabilityScore < 40        → NO-GO (reason: "Testability critically low")
IF htsmCoverage < 6             → NO-GO (reason: "Insufficient quality coverage")
IF acCompleteness < 50          → NO-GO (reason: "Acceptance criteria incomplete")
IF criticalRisks > 2            → NO-GO (reason: "Too many critical risks")

STEP 2: Check GO conditions (ALL required for GO)
─────────────────────────────────────────────────
IF testabilityScore >= 80
   AND htsmCoverage >= 8
   AND acCompleteness >= 90
   AND criticalRisks == 0       → GO

STEP 3: Default
─────────────────────────────────────────────────
ELSE                            → CONDITIONAL
```

### Decision Recording

```
METRICS:
- testabilityScore = __/100
- htsmCoverage = __/10
- acCompleteness = __%
- criticalRisks = __

NO-GO CHECK:
- testabilityScore < 40? __ (YES/NO)
- htsmCoverage < 6? __ (YES/NO)
- acCompleteness < 50? __ (YES/NO)
- criticalRisks > 2? __ (YES/NO)

GO CHECK (only if no NO-GO triggered):
- testabilityScore >= 80? __ (YES/NO)
- htsmCoverage >= 8? __ (YES/NO)
- acCompleteness >= 90? __ (YES/NO)
- criticalRisks == 0? __ (YES/NO)

FINAL RECOMMENDATION: [GO / CONDITIONAL / NO-GO]
REASON: ___
```

---

## PHASE 6: Generate Ideation Report

### ⛔ ENFORCEMENT: COMPLETE REPORT STRUCTURE

**ALL sections below are MANDATORY. No abbreviations.**

```markdown
# QCSD Ideation Report: [Epic Name]

**Generated**: [Date/Time]
**Recommendation**: [GO / CONDITIONAL / NO-GO]
**Agents Executed**: [List all agents that ran]

---

## Executive Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| HTSM Coverage | X/10 | ≥8 | ✅/⚠️/❌ |
| Testability Score | X% | ≥80% | ✅/⚠️/❌ |
| AC Completeness | X% | ≥90% | ✅/⚠️/❌ |
| Critical Risks | X | 0 | ✅/⚠️/❌ |

**Recommendation Rationale**: [1-2 sentences explaining why GO/CONDITIONAL/NO-GO]

---

## Quality Criteria Analysis (HTSM v6.3)

[EMBED or LINK the HTML report from qe-quality-criteria-recommender]

### Priority Items Summary

| Priority | Count | Categories |
|----------|-------|------------|
| P0 (Critical) | X | [list] |
| P1 (High) | X | [list] |
| P2 (Medium) | X | [list] |
| P3 (Low) | X | [list] |

### Cross-Cutting Concerns
[List any concerns that span multiple categories]

---

## Risk Assessment

### Risk Matrix

| ID | Risk | Category | L | I | Score | Mitigation |
|----|------|----------|---|---|-------|------------|
[ALL risks from qe-risk-assessor, sorted by score]

### Critical Risks (Score ≥ 15)
[Highlight critical risks with detailed mitigation plans]

### Risk Distribution
- Technical: X risks
- Business: X risks
- Quality: X risks
- Integration: X risks

---

## Requirements Validation

### Testability Score: X/100

| Principle | Score | Notes |
|-----------|-------|-------|
[All 10 principles from qe-requirements-validator]

### AC Completeness: X%

| AC | Status | Issues |
|----|--------|--------|
[All ACs evaluated]

### Gaps Identified
1. [Gap 1]
2. [Gap 2]
[All gaps from qe-requirements-validator]

---

## Conditional Analysis

[INCLUDE ONLY IF APPLICABLE - based on which conditional agents ran]

### Accessibility Review (IF HAS_UI)
[Full output from qe-accessibility-auditor]

### Security Assessment (IF HAS_SECURITY)
[Full output from qe-security-auditor]

### Quality Experience (IF HAS_UX)
[Full output from qe-qx-partner]

---

## Recommended Next Steps

### Immediate Actions (Before Development)
- [ ] [Action based on findings]
- [ ] [Action based on findings]

### During Development
- [ ] [Action based on findings]

### Pre-Release
- [ ] [Action based on findings]

---

## Appendix: Agent Outputs

[Link to or embed full outputs from each agent]

---

*Generated by QCSD Ideation Swarm v6.1*
*Execution Model: Task Tool Parallel Swarm*
```

### Report Validation Checklist

Before presenting report:
```
✓ Executive Summary table is complete with all 4 metrics
✓ Recommendation matches decision logic output
✓ Quality Criteria section includes priority summary
✓ Risk Matrix includes ALL identified risks
✓ Testability score shows all 10 principles
✓ All gaps are listed
✓ Conditional sections included for all spawned agents
✓ Next steps are specific and actionable (not generic)
```

**❌ DO NOT present an incomplete report.**

---

## PHASE 7: Store Learnings (OPTIONAL)

If MCP memory tools available:

```javascript
mcp__agentic-qe__memory_store({
  key: `qcsd-ideation-${epicId}-${Date.now()}`,
  namespace: "qcsd-ideation",
  value: {
    epicId: epicId,
    epicName: epicName,
    recommendation: recommendation,
    metrics: {
      htsmCoverage: htsmCoverage,
      testabilityScore: testabilityScore,
      acCompleteness: acCompleteness,
      criticalRisks: criticalRisks
    },
    agentsInvoked: agentList,
    timestamp: new Date().toISOString()
  }
})
```

---

## Quick Reference

### Enforcement Summary

| Phase | Must Do | Failure Condition |
|-------|---------|-------------------|
| 1 | Check ALL 3 flags | Missing flag evaluation |
| 2 | Spawn ALL 3 core agents in ONE message | Fewer than 3 Task calls |
| 3 | WAIT for completion | Proceeding before results |
| 4 | Spawn ALL flagged conditional agents | Skipping a TRUE flag |
| 5 | Apply EXACT decision logic | Wrong recommendation |
| 6 | Generate COMPLETE report | Missing sections |

### Quality Gate Thresholds

| Metric | GO | CONDITIONAL | NO-GO |
|--------|-----|-------------|-------|
| Testability | ≥80% | 40-79% | <40% |
| HTSM Coverage | ≥8/10 | 6-7/10 | <6/10 |
| AC Completeness | ≥90% | 50-89% | <50% |
| Critical Risks | 0 | 1-2 | >2 |

### Swarm Topology

```
              QCSD IDEATION SWARM
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
│Quality  │   │   Risk    │   │    AC     │
│Criteria │   │ Assessor  │   │ Validator │
│ (HTML)  │   │           │   │           │
└────┬────┘   └─────┬─────┘   └─────┬─────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
              [QUALITY GATE]
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
│  A11y   │   │ Security  │   │    QX     │
│[IF UI]  │   │[IF AUTH]  │   │ [IF UX]   │
└─────────┘   └───────────┘   └───────────┘
```

---

## Key Principle

**Quality is built in from the start, not tested in at the end.**

This swarm provides:
1. **What quality criteria matter?** → HTSM Analysis (10 categories)
2. **What risks exist?** → Risk Storming (4 categories)
3. **Are requirements testable?** → AC Validation (10 principles)
4. **Is it accessible/secure/good UX?** → Conditional specialists
5. **Should we proceed?** → GO/CONDITIONAL/NO-GO decision
