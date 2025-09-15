# Agentic QE Testing Agents – Development Instructions

This document provides structured instructions for designing and implementing the fleet of testing agents that span the SDLC, with an **Agentic QE Orchestrator** coordinating them.

Each section contains:
- **Purpose**: What the agent is meant to achieve.
- **Inputs**: What the agent consumes (artifacts, signals, context).
- **Outputs**: What the agent produces (reports, evidence, actions).
- **Core Capabilities**: Essential features/behaviors.
- **Implementation Notes**: Design considerations and constraints.

---

## 1. Context-Analyzer Agent
**Purpose:** Analyze specifications, user stories, and acceptance criteria to detect ambiguities, assumptions, and risks.  
**Inputs:** Requirements documents, PRDs, user stories.  
**Outputs:** Ambiguity report, highlighted risks, suggested clarifications.  
**Core Capabilities:**  
- NLP-based ambiguity detection.  
- Risk heuristics from RST (*what could go wrong?*).  
- Linking issues to business value.  
**Implementation Notes:** Start with rule-based + LLM hybrid; integrate with requirement management tools.

---

## 2. Risk-Mapper Agent
**Purpose:** Build and update a risk map tied to business value and user impact.  
**Inputs:** Business context, requirements, change history, telemetry.  
**Outputs:** Risk heatmap, prioritized risk register.  
**Core Capabilities:**  
- Map features to risk categories (security, performance, usability).  
- Prioritize based on likelihood × impact.  
- Feed updated priorities to Orchestrator.  
**Implementation Notes:** Use lightweight scoring models; allow human override.

---

## 3. Code-Integrity Agent
**Purpose:** Ensure code quality and alignment with intended design.  
**Inputs:** Source code, commits, design artifacts.  
**Outputs:** Static analysis reports, mutation testing scores.  
**Core Capabilities:**  
- Static analysis (linting, type checking).  
- Mutation testing with effectiveness metrics.  
- Diff-based contextual checks.  
**Implementation Notes:** Rust for performance; integrate with GitHub Actions or CI pipelines.

---

## 4. Unit-Test Generator Agent
**Purpose:** Generate and maintain meaningful unit-level tests.  
**Inputs:** Source code, function signatures, documentation.  
**Outputs:** Unit test files, coverage reports.  
**Core Capabilities:**  
- LLM-based test generation.  
- Negative and edge case creation.  
- Continuous adaptation to code changes.  
**Implementation Notes:** Must avoid brittle tests; measure effectiveness via mutation coverage.

---

## 5. Pair-Program Reviewer Agent
**Purpose:** Provide exploratory critiques of developer logic.  
**Inputs:** Code diffs, PRs.  
**Outputs:** Review comments, suggested fixes.  
**Core Capabilities:**  
- Context-aware review (not just static lint).  
- Heuristic-driven “second brain” for devs.  
- Edge case surfacing.  
**Implementation Notes:** Frame outputs as *suggestions* to maintain trust.

---

## 6. Contract-Verifier Agent
**Purpose:** Validate API schemas and ensure backward compatibility.  
**Inputs:** API specs, schema versions, API calls.  
**Outputs:** Compatibility reports, failing test cases.  
**Core Capabilities:**  
- Contract diff analysis.  
- Regression tests for endpoints.  
- Automatic client simulation.  
**Implementation Notes:** Align with API blueprint specification already in use.

---

## 7. Fault-Injection Agent
**Purpose:** Stress-test inter-service boundaries with invalid/malicious input.  
**Inputs:** API endpoints, integration points.  
**Outputs:** Fault impact reports, resilience gaps.  
**Core Capabilities:**  
- Malformed request generation.  
- Latency and throttling injection.  
- Chaos scenarios (dependency failures).  
**Implementation Notes:** Should integrate safely in staging/controlled environments.

---

## 8. Scenario-Orchestrator Agent
**Purpose:** Build end-to-end flows simulating real-world usage.  
**Inputs:** User journeys, API endpoints, risk map.  
**Outputs:** E2E test scenarios, anomaly reports.  
**Core Capabilities:**  
- Journey synthesis with branching.  
- Heuristic tours (RST style).  
- Context-driven test path generation.  
**Implementation Notes:** Works in tandem with Exploratory Companion.

---

## 9. Exploratory Companion Agent
**Purpose:** Support human testers during exploratory sessions.  
**Inputs:** Tester actions, charters, system state.  
**Outputs:** Session logs, coverage heatmaps, anomaly suggestions.  
**Core Capabilities:**  
- Hypothesis prompting (“have you tried…?”).  
- Evidence capture (screens, logs).  
- Gap analysis vs. risk map.  
**Implementation Notes:** Must remain lightweight and non-intrusive.

---

## 10. Identity-Adversary Agent
**Purpose:** Simulate identity-focused attacks.  
**Inputs:** Auth flows, credentials, tokens.  
**Outputs:** Security breach reports, exploit traces.  
**Core Capabilities:**  
- Phishing simulation.  
- Token theft & replay.  
- Prompt injection attempts.  
**Implementation Notes:** Apply OWASP GenAI threat compass categories.

---

## 11. Data-Guard Agent
**Purpose:** Protect user data and ensure compliance.  
**Inputs:** Data flows, logs, schema definitions.  
**Outputs:** Compliance report, data misuse alerts.  
**Core Capabilities:**  
- PII leakage detection.  
- Policy/regulation checks (GDPR, HIPAA).  
- Synthetic data validation.  
**Implementation Notes:** Red-team style adversarial testing of data handling.

---

## 12. Load-Planner Agent
**Purpose:** Design and run load/performance tests.  
**Inputs:** User behavior models, system endpoints.  
**Outputs:** Load test scripts (k6, JMeter, Locust), performance reports.  
**Core Capabilities:**  
- Profile-based scenario generation.  
- SLA/SLO validation.  
- Bottleneck detection.  
**Implementation Notes:** Orchestrator uses this for performance gates.

---

## 13. Chaos-Orchestrator Agent
**Purpose:** Validate resilience under failure conditions.  
**Inputs:** Infra topology, service dependencies.  
**Outputs:** Chaos experiment results, resilience score.  
**Core Capabilities:**  
- Controlled fault injection (node kill, latency spike).  
- Degradation detection.  
- Recovery verification.  
**Implementation Notes:** Run only in staging/prod-sim environments with safety guards.

---

## 14. Canary-Validator Agent
**Purpose:** Ensure safe deployment through canary monitoring.  
**Inputs:** Canary metrics, release candidates.  
**Outputs:** Anomaly reports, rollback signals.  
**Core Capabilities:**  
- Stats-based anomaly detection.  
- Experience degradation detection.  
- Rollback recommendation.  
**Implementation Notes:** Integrates with deployment orchestrators.

---

## 15. Telemetry-Explorer Agent
**Purpose:** Analyze production telemetry to suggest new tests.  
**Inputs:** Logs, traces, metrics.  
**Outputs:** New test hypotheses, anomaly correlations.  
**Core Capabilities:**  
- Clustering anomalies.  
- Mapping telemetry → user journeys.  
- Hypothesis generation.  
**Implementation Notes:** Feedback loop into Orchestrator risk model.

---

## 16. Test-Journal Agent
**Purpose:** Maintain auditable logs of all test activity.  
**Inputs:** Agent actions, evidence, test runs.  
**Outputs:** Journals, ADR-ready summaries.  
**Core Capabilities:**  
- Immutable logging.  
- Explainability and provenance.  
- Evidence bundling.  
**Implementation Notes:** Must be queryable and exportable.

---

## 17. Quality-Coach Agent
**Purpose:** Provide coaching, heuristics, and guidance to teams.  
**Inputs:** Test outcomes, team activity, heuristics library.  
**Outputs:** Tips, playbooks, guidance reports.  
**Core Capabilities:**  
- Heuristic-driven suggestions.  
- Charter building.  
- Coaching prompts for testers/devs.  
**Implementation Notes:** Functions as a learning layer for humans.

---

## 18. **Agentic QE Orchestrator (Conductor)**
**Purpose:** Coordinate all agents across SDLC, manage risk, ensure explainability.  
**Inputs:** Risk maps, missions, signals, policies.  
**Outputs:** Test Missions, evidence graphs, gate decisions, ADRs.  
**Core Capabilities:**  
- Mission generation and assignment.  
- Verification Graph for provenance.  
- Human-in-the-loop checkpoints.  
**Implementation Notes:** Start minimal (3–4 agents) and expand. Ensure HA deployment and explainability reports are mandatory.

---

# Notes for Development
- **Ephemeral execution**: Agents should run on demand, statelessly, with context pulled from Orchestrator.  
- **Evidence-first**: All agents must output evidence artifacts.  
- **Human in loop**: No auto-approval; Orchestrator defers final decisions.  
- **Heuristics baked-in**: Encode RST/context-driven tours, not just fixed checks.  

---

