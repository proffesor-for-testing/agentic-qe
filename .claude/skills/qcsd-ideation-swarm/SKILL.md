---
name: "qcsd-ideation-swarm"
description: "Run shift-left quality sessions during PI/Sprint planning with HTSM v6.3, Risk Storming, and Testability analysis. Use when assessing story viability or running QCSD Ideation phase gates."
---

# QCSD Ideation Swarm v7.0

Shift-left quality engineering swarm for PI Planning and Sprint Planning. Assesses stories and URLs before development begins using HTSM v6.3 quality criteria, Risk Storming, and Testability analysis. Renders a GO / CONDITIONAL / NO-GO decision.

## QCSD Phase Positioning

| Phase | Swarm | Decision | When |
|-------|-------|----------|------|
| **Ideation** | **qcsd-ideation-swarm** | **GO / CONDITIONAL / NO-GO** | **PI/Sprint Planning** |
| Refinement | qcsd-refinement-swarm | READY / CONDITIONAL / NOT-READY | Sprint Refinement |
| Development | qcsd-development-swarm | SHIP / CONDITIONAL / HOLD | During Sprint |
| Verification | qcsd-cicd-swarm | RELEASE / REMEDIATE / BLOCK | Pre-Release / CI-CD |
| Production | qcsd-production-swarm | HEALTHY / DEGRADED / CRITICAL | Post-Release |

### Parameters

- `URL`: Website to analyze (required for URL mode)
- `OUTPUT_FOLDER`: Where to save reports (default: `${PROJECT_ROOT}/Agentic QCSD/{domain}/`)

### Unique Features

- **URL Mode**: Automated 5-tier browser cascade for live website analysis
- **HAS_VIDEO Flag**: Detects video content and recommends `/a11y-ally` follow-up
- **HTML Output**: Generates HTML reports when `html_output: true`
- **Browser Cascade**: Vibium -> agent-browser -> Playwright+Stealth -> WebFetch -> WebSearch-fallback

## Enforcement Rules

| Rule | Requirement |
|------|-------------|
| E1 | Spawn ALL THREE core agents in Step 2. No exceptions. |
| E2 | All parallel Task calls in a SINGLE message. |
| E3 | STOP and WAIT after each batch. |
| E4 | Spawn conditional agents if flags are TRUE. |
| E5 | Apply GO/CONDITIONAL/NO-GO logic exactly as specified. |
| E6 | Generate the full report structure. |
| E7 | Each agent reads its reference files before analysis. |
| E8 | Execute Step 7 learning persistence. |

**Prohibited:** Summarizing instead of spawning, skipping agents, proceeding before completion, providing own analysis, omitting report sections.

## Step Execution Protocol

Execute steps sequentially by reading each step file with the Read tool.

1. **Flag Detection** -- `steps/01-flag-detection.md` -- Fetch URL, detect flags (HAS_UI, HAS_SECURITY, HAS_UX, HAS_VIDEO, HAS_MIDDLEWARE, HAS_SAP_INTEGRATION, HAS_AUTHORIZATION)
2. **Core Agents** -- `steps/02-core-agents.md` -- Spawn qe-quality-criteria-recommender, qe-risk-assessor, qe-requirements-validator in parallel
3. **Batch 1 Results** -- `steps/03-batch1-results.md` -- Wait for core agents, extract metrics
4. **Conditional Agents** -- `steps/04-conditional-agents.md` -- Spawn flagged conditional agents in parallel
5. **Decision Synthesis** -- `steps/05-decision-synthesis.md` -- Apply GO/CONDITIONAL/NO-GO logic
6. **Report Generation** -- `steps/06-report-generation.md` -- Generate executive summary and full report
7. **Learning Persistence** -- `steps/07-learning-persistence.md` -- Store findings, save record, include video follow-up
8. **Final Output** -- `steps/08-final-output.md` -- Display completion summary with scores and recommendations

### Execution Instructions

1. Read each step file: `Read({ file_path: ".claude/skills/qcsd-ideation-swarm/steps/01-flag-detection.md" })`
2. Execute completely, verify success criteria
3. Pass output as context to next step
4. On failure, halt and report -- do not skip ahead
5. Resume support: `--from-step N`

## Agent Inventory

| Agent | Type | Domain | Batch |
|-------|------|--------|-------|
| qe-quality-criteria-recommender | Core | requirements-validation | 1 |
| qe-risk-assessor | Core | coverage-analysis | 1 |
| qe-requirements-validator | Core | requirements-validation | 1 |
| qe-accessibility-auditor | Conditional (HAS_UI) | visual-accessibility | 2 |
| qe-security-auditor | Conditional (HAS_SECURITY) | security-compliance | 2 |
| qe-qx-partner | Conditional (HAS_UX) | cross-domain | 2 |
| qe-middleware-validator | Conditional (HAS_MIDDLEWARE) | enterprise-integration | 2 |
| qe-sap-rfc-tester | Conditional (HAS_SAP_INTEGRATION) | enterprise-integration | 2 |
| qe-sod-analyzer | Conditional (HAS_AUTHORIZATION) | enterprise-integration | 2 |

**Total: 9 agents (3 core + 6 conditional)**

## Quality Gate Thresholds

| Metric | GO | CONDITIONAL | NO-GO |
|--------|-----|-------------|-------|
| Testability Score | >= 70% | 40-69% | < 40% |
| Risk Score | LOW/MEDIUM | HIGH (mitigatable) | CRITICAL |
| Requirements Completeness | >= 80% | 50-79% | < 50% |
| Quality Criteria Coverage | >= 7/10 | 4-6/10 | < 4/10 |

## Execution Model

| Model | When | Spawn |
|-------|------|-------|
| **Task Tool** (primary) | Claude Code sessions | `Task({ subagent_type, run_in_background: true })` |
| MCP Tools | MCP server available | `fleet_init({})` / `task_submit({})` |
| CLI | Terminal/scripts | `swarm init` / `agent spawn` |
