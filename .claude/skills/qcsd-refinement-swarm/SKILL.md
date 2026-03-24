---
name: "qcsd-refinement-swarm"
description: "Run Sprint Refinement sessions with SFDIPOT product factors, BDD scenario generation, and INVEST validation. Use when preparing stories for sprint commitment or running QCSD Refinement phase gates."
---

# QCSD Refinement Swarm v1.0

Shift-left quality engineering swarm for Sprint Refinement. Takes stories that passed Ideation and prepares them for Sprint commitment using SFDIPOT product factors, BDD scenarios, and INVEST validation. Renders a READY / CONDITIONAL / NOT-READY decision.

## QCSD Phase Positioning

| Phase | Swarm | Decision | When |
|-------|-------|----------|------|
| Ideation | qcsd-ideation-swarm | GO / CONDITIONAL / NO-GO | PI/Sprint Planning |
| **Refinement** | **qcsd-refinement-swarm** | **READY / CONDITIONAL / NOT-READY** | **Sprint Refinement** |
| Development | qcsd-development-swarm | SHIP / CONDITIONAL / HOLD | During Sprint |
| Verification | qcsd-cicd-swarm | RELEASE / REMEDIATE / BLOCK | Pre-Release / CI-CD |
| Production | qcsd-production-swarm | HEALTHY / DEGRADED / CRITICAL | Post-Release |

### Parameters

- `STORY_CONTENT`: User story with acceptance criteria (required)
- `OUTPUT_FOLDER`: Where to save reports (default: `${PROJECT_ROOT}/Agentic QCSD/refinement/`)

## Enforcement Rules

| Rule | Requirement |
|------|-------------|
| E1 | Spawn ALL THREE core agents in Step 2. |
| E2 | All parallel Task calls in a SINGLE message. |
| E3 | STOP and WAIT after each batch. |
| E4 | Spawn conditional agents if flags are TRUE. |
| E5 | Apply READY/CONDITIONAL/NOT-READY logic exactly. |
| E6 | Generate the full report structure. |
| E7 | Each agent reads its reference files first. |
| E8 | Apply qe-test-idea-rewriter transformation in Step 8. |
| E9 | Execute Step 7 learning persistence. |

## Step Execution Protocol

Execute steps sequentially by reading each step file with the Read tool.

1. **Flag Detection** -- `steps/01-flag-detection.md` -- Analyze story, evaluate flags
2. **Core Agents** -- `steps/02-core-agents.md` -- Spawn qe-product-factors-assessor, qe-bdd-generator, qe-requirements-validator
3. **Batch 1 Results** -- `steps/03-batch1-results.md` -- Wait and extract metrics
4. **Conditional Agents** -- `steps/04-conditional-agents.md` -- Spawn flagged agents
5. **Decision Synthesis** -- `steps/05-decision-synthesis.md` -- Apply READY/CONDITIONAL/NOT-READY logic
6. **Report Generation** -- `steps/06-report-generation.md` -- Generate refinement report
7. **Learning Persistence** -- `steps/07-learning-persistence.md` -- Store findings to memory
8. **Transformation** -- `steps/08-transformation.md` -- Run test idea rewriter on all test ideas
9. **Final Output** -- `steps/09-final-output.md` -- Display completion summary

### Execution Instructions

1. Read each step file with Read tool
2. Execute completely, verify success criteria
3. Pass output as context to next step
4. On failure, halt and report
5. Resume support: `--from-step N`

## Agent Inventory

| Agent | Type | Domain | Batch |
|-------|------|--------|-------|
| qe-product-factors-assessor | Core | requirements-validation | 1 |
| qe-bdd-generator | Core | requirements-validation | 1 |
| qe-requirements-validator | Core | requirements-validation | 1 |
| qe-contract-validator | Conditional (HAS_API) | contract-testing | 2 |
| qe-impact-analyzer | Conditional (HAS_REFACTORING) | code-intelligence | 2 |
| qe-dependency-mapper | Conditional (HAS_DEPENDENCIES) | code-intelligence | 2 |
| qe-middleware-validator | Conditional (HAS_MIDDLEWARE) | enterprise-integration | 2 |
| qe-odata-contract-tester | Conditional (HAS_SAP_INTEGRATION) | enterprise-integration | 2 |
| qe-sod-analyzer | Conditional (HAS_AUTHORIZATION) | enterprise-integration | 2 |
| qe-test-idea-rewriter | Transformation (always) | test-generation | 3 |

**Total: 10 agents (3 core + 6 conditional + 1 transformation)**
