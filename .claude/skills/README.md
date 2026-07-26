# AQE Skills Index

This directory contains Quality Engineering skills managed by Agentic QE.

## Summary

- **Total QE Skills**: 88
- **V2 Methodology Skills**: 65
- **V3 Domain Skills**: 23
- **Platform Skills**: 32 (Claude Flow managed)
- **Validation Infrastructure**: ✅ Installed

> **Note**: Platform skills (agentdb, github, flow-nexus, etc.) are managed by claude-flow.
> Only QE-specific skills are installed/updated by `aqe init`.

## V2 Methodology Skills (65)

Version-agnostic quality engineering best practices from the QE community.

- **a11y-ally**: Use when running comprehensive WCAG accessibility audits with axe-core + pa11y + Lighthouse, generating context-aware remediation, or testing video accessibility. Supports 3-tier browser cascade with graceful degradation.
- **accessibility-testing**: WCAG 2.2 compliance testing, screen reader validation, and inclusive design verification. Use when ensuring legal compliance (ADA, Section 508), testing for disabilities, or building accessible applications for 1 billion disabled users globally.
- **agentic-quality-engineering**: Use when orchestrating QE agents, understanding PACTS principles, configuring the AQE v3 fleet, or leveraging AI agents as force multipliers for quality work.
- **api-testing-patterns**: Comprehensive API testing patterns including contract testing, REST/GraphQL testing, and integration testing. Use when testing APIs or designing API test strategies.
- **browser**: Web browser automation with AI-optimized snapshots for claude-flow agents
- **brutal-honesty-review**: Unvarnished technical criticism combining Linus Torvalds
- **bug-reporting-excellence**: Write high-quality bug reports that get fixed quickly. Use when reporting bugs, training teams on bug reporting, or establishing bug report standards.
- **chaos-engineering-resilience**: Chaos engineering principles, controlled failure injection, resilience testing, and system recovery validation. Use when testing distributed systems, building confidence in fault tolerance, or validating disaster recovery.
- **cicd-pipeline-qe-orchestrator**: Orchestrate quality engineering across CI/CD pipeline phases. Use when designing test strategies, planning quality gates, or implementing shift-left/shift-right testing.
- **code-review-quality**: Conduct context-driven code reviews focusing on quality, testability, and maintainability. Use when reviewing code, providing feedback, or establishing review practices.
- **compatibility-testing**: Cross-browser, cross-platform, and cross-device compatibility testing ensuring consistent experience across environments. Use when validating browser support, testing responsive design, or ensuring platform compatibility.
- **compliance-testing**: Regulatory compliance testing for GDPR, CCPA, HIPAA, SOC2, PCI-DSS and industry-specific regulations. Use when ensuring legal compliance, preparing for audits, or handling sensitive data.
- **consultancy-practices**: Apply effective software quality consultancy practices. Use when consulting, advising clients, or establishing consultancy workflows.
- **context-driven-testing**: Apply context-driven testing principles where practices are chosen based on project context, not universal
- **contract-testing**: Consumer-driven contract testing for microservices using Pact, schema validation, API versioning, and backward compatibility testing. Use when testing API contracts or coordinating distributed teams.
- **database-testing**: Database schema validation, data integrity testing, migration testing, transaction isolation, and query performance. Use when testing data persistence, ensuring referential integrity, or validating database migrations.
- **debug-loop**: Use when debugging a failing test or runtime error with hypothesis-driven investigation, autonomous command validation, and systematic root cause elimination.
- **enterprise-integration-testing**: Use when testing enterprise integrations across SAP, middleware, WMS, or backend systems, validating E2E enterprise flows, testing SAP-specific patterns (RFC, BAPI, IDoc, OData, Fiori), or enforcing cross-system quality gates.
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours. Use when planning exploration sessions, investigating bugs, or discovering unknown quality risks.
- **holistic-testing-pact**: Apply the Holistic Testing Model evolved with PACTS (Proactive, Autonomous, Collaborative, Targeted, Structured) principles. Use when designing comprehensive test strategies for Classical, AI-assisted, Agent based, or Agentic Systems building quality into the team, or implementing whole-team quality practices.
- **localization-testing**: Internationalization (i18n) and localization (l10n) testing for global products including translations, locale formats, RTL languages, and cultural appropriateness. Use when launching in new markets or building multi-language products.
- **middleware-testing-patterns**: Enterprise middleware testing patterns for message routing, transformation, DLQ, protocol mediation, ESB error handling, and EIP patterns. Use when testing middleware layers, message brokers, ESBs, or integration buses.
- **mobile-testing**: Comprehensive mobile testing for iOS and Android platforms including gestures, sensors, permissions, device fragmentation, and performance. Use when testing native apps, hybrid apps, or mobile web, ensuring quality across 1000+ device variants.
- **mutation-testing**: Test quality validation through mutation testing, assessing test suite effectiveness by introducing code mutations and measuring kill rate. Use when evaluating test quality, identifying weak tests, or proving tests actually catch bugs.
- **n8n-expression-testing**: n8n expression syntax validation, context-aware testing, common pitfalls detection, and performance optimization. Use when validating n8n expressions and data transformations.
- **n8n-integration-testing-patterns**: API contract testing, authentication flows, rate limit handling, and error scenario coverage for n8n integrations with external services. Use when testing n8n node integrations.
- **n8n-security-testing**: Credential exposure detection, OAuth flow validation, API key management testing, and data sanitization verification for n8n workflows. Use when validating n8n workflow security.
- **n8n-trigger-testing-strategies**: Webhook testing, schedule validation, event-driven triggers, and polling mechanism testing for n8n workflows. Use when testing how workflows are triggered.
- **n8n-workflow-testing-fundamentals**: Comprehensive n8n workflow testing including execution lifecycle, node connection patterns, data flow validation, and error handling strategies. Use when testing n8n workflow automation applications.
- **observability-testing-patterns**: Observability and monitoring validation patterns for dashboards, alerting, log aggregation, APM traces, and SLA/SLO verification. Use when testing monitoring infrastructure, dashboard accuracy, alert rules, or metric pipelines.
- **pair-programming**: AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, quality monitoring, and comprehensive testing. Supports TDD, debugging, refactoring, and learning sessions. Features automatic role switching, continuous code review, security scanning, and performance optimization with truth-score verification.
- **performance-testing**: Profiles application performance under load using k6, Artillery, or JMeter to measure latency, throughput, and error rates. Use when planning load tests, stress tests, soak tests, benchmarking APIs, or identifying performance bottlenecks.
- **pr-review**: Use when reviewing a GitHub PR for quality, scope correctness, trust tier compliance, or generating user-friendly review feedback.
- **qcsd-cicd-swarm**: Use when enforcing CI/CD quality gates before release, running regression analysis, detecting flaky tests, or assessing deployment readiness in the QCSD Verification phase.
- **qcsd-development-swarm**: Use when monitoring in-sprint code quality with TDD adherence checks, complexity analysis, coverage gap detection, or defect prediction in the QCSD Development phase.
- **qcsd-ideation-swarm**: Use when running Quality Criteria sessions during PI/Sprint planning with HTSM v6.3, Risk Storming, or Testability analysis in the QCSD Ideation phase.
- **qcsd-production-swarm**: Use when assessing post-release production health with DORA metrics, root cause analysis, defect prediction, or cross-phase feedback loops in the QCSD Production phase.
- **qcsd-refinement-swarm**: Use when running Sprint Refinement sessions with SFDIPOT product factors, generating BDD scenarios, or validating requirements in the QCSD Refinement phase.
- **qe-court**: Adversarial review court — a delivery (diff, PR, test suite, or artifact) is prosecuted by independent AI reviewers from different vendors, each with its own probe set, then a SHIP verdict must SURVIVE escalating deeper reviewers before it stands. Use when you want more than one reviewer
- **quality-metrics**: Tracks quality metrics including defect density, test effectiveness ratio, DORA metrics, and mean time to detection. Use when establishing quality dashboards, defining KPIs, evaluating test suite effectiveness, or reporting quality trends to stakeholders.
- **refactoring-patterns**: Apply safe refactoring patterns to improve code structure without changing behavior. Use when cleaning up code, reducing technical debt, or improving maintainability.
- **regression-testing**: Strategic regression testing with test selection, impact analysis, and continuous regression management. Use when verifying fixes don
- **risk-based-testing**: Focus testing effort on highest-risk areas using risk assessment and prioritization. Use when planning test strategy, allocating testing resources, or making coverage decisions.
- **ruflo**: Ruflo is a multi-agent orchestration platform for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini, Amp, +12 more). Use this skill when the user wants to (1) install/init ruflo in a project, (2) run multi-agent swarms with hierarchical coordination, (3) use ruflo
- **security-testing**: Scans for security vulnerabilities including XSS, SQL injection, CSRF, and auth flaws using OWASP Top 10 methodology. Use when conducting SAST/DAST scans, auditing authentication flows, testing authorization rules, or implementing security test automation.
- **security-visual-testing**: Security-first visual testing combining URL validation, PII detection, and visual regression with parallel viewport support. Use when testing web applications that handle sensitive data, need visual regression coverage, or require WCAG accessibility compliance.
- **sfdipot-product-factors**: James Bach
- **sherlock-review**: Evidence-based investigative code review using deductive reasoning to determine what actually happened versus what was claimed. Use when verifying implementation claims, investigating bugs, validating fixes, or conducting root cause analysis. Elementary approach to finding truth through systematic observation.
- **shift-left-testing**: Move testing activities earlier in the development lifecycle to catch defects when they
- **shift-right-testing**: Testing in production with feature flags, canary deployments, synthetic monitoring, and chaos engineering. Use when implementing production observability or progressive delivery.
- **six-thinking-hats**: Apply Edward de Bono
- **tdd-london-chicago**: Apply London (mock-based) and Chicago (state-based) TDD schools. Use when practicing test-driven development or choosing testing style for your context.
- **technical-writing**: Write clear, engaging technical content from real experience. Use when writing blog posts, documentation, tutorials, or technical articles.
- **test-automation-strategy**: Design and implement effective test automation with proper pyramid, patterns, and CI/CD integration. Use when building automation frameworks or improving test efficiency.
- **test-data-management**: Strategic test data generation, management, and privacy compliance. Use when creating test data, handling PII, ensuring GDPR/CCPA compliance, or scaling data generation for realistic testing scenarios.
- **test-design-techniques**: Systematic test design with boundary value analysis, equivalence partitioning, decision tables, state transition testing, and combinatorial testing. Use when designing comprehensive test cases, reducing redundant tests, or ensuring systematic coverage.
- **test-environment-management**: Test environment provisioning, infrastructure as code for testing, Docker/Kubernetes for test environments, service virtualization, and cost optimization. Use when managing test infrastructure, ensuring environment parity, or optimizing testing costs.
- **test-idea-rewriting**: Transform passive
- **test-reporting-analytics**: Advanced test reporting, quality dashboards, predictive analytics, trend analysis, and executive reporting for QE metrics. Use when communicating quality status, tracking trends, or making data-driven decisions.
- **testability-scoring**: AI-powered testability assessment using 10 principles of intrinsic testability with Playwright and optional Vibium integration. Evaluates web applications against Observability, Controllability, Algorithmic Simplicity, Transparency, Stability, Explainability, Unbugginess, Smallness, Decomposability, and Similarity. Use when assessing software testability, evaluating test readiness, identifying testability improvements, or generating testability reports.
- **validation-pipeline**: Runs multi-stage validation gates with per-step scoring, pass/fail verdicts, and aggregate quality reports. Use when validating requirements, code, or artifacts through structured gate enforcement before merge or release.
- **verification-quality**: |
- **visual-testing-advanced**: Advanced visual regression testing with pixel-perfect comparison, AI-powered diff analysis, responsive design validation, and cross-browser visual consistency. Use when detecting UI regressions, validating designs, or ensuring visual consistency.
- **wms-testing-patterns**: Warehouse Management System testing patterns for inventory operations, pick/pack/ship workflows, wave management, EDI X12/EDIFACT compliance, RF/barcode scanning, and WMS-ERP integration. Use when testing WMS platforms (Blue Yonder, Manhattan, SAP EWM).
- **xp-practices**: Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace. Use when implementing agile development practices, improving team collaboration, or adopting technical excellence practices.

## V3 Domain Skills (23)

V3-specific implementation guides for the 12 DDD bounded contexts.

- **coverage-drop-investigator**: Use when test coverage has dropped and you need to find which changes caused it and what tests to add. Traces coverage regressions to specific commits and files.
- **coverage-guard**: Use when you want to prevent coverage regressions during development. Activate with /coverage-guard to warn when coverage drops below threshold after code changes.
- **e2e-flow-verifier**: Use when verifying complete user flows end-to-end with the qe-browser skill (Vibium), recording session evidence, and asserting state at each step. For product verification with real browser automation.
- **freeze-tests**: Use when refactoring production code and you want to ensure test files are not modified. Activate with /freeze-tests to block all edits to test files for safe refactoring.
- **no-skip**: Use when you want to prevent .skip(), .only(), xit(), and xdescribe() from being committed to test files. Activate with /no-skip for session-scoped test skip prevention.
- **pentest-validation**: Use when validating security findings from SAST/DAST scans, proving exploitability of reported vulnerabilities, eliminating false positives, or running the 4-phase pentest pipeline (recon, analysis, validation, report).
- **qe-browser**: Browser automation for QE agents using Vibium (WebDriver BiDi) with assertions, batch execution, visual diff, prompt-injection scanning, and semantic intents. Use when any QE skill needs to drive a real browser — visual testing, accessibility audits, E2E flow verification, pentest validation, or exploratory testing.
- **qe-chaos-resilience**: Injects controlled faults (network partition, latency, process kill, disk pressure) into distributed systems and validates recovery behavior. Use when testing circuit breakers, failover paths, retry logic, or building confidence in system resilience through chaos engineering.
- **qe-code-intelligence**: Builds semantic code indexes, maps dependency graphs, and performs intelligent code search across large codebases. Use when understanding unfamiliar code, tracing call chains, analyzing import dependencies, or reducing context window usage through targeted retrieval.
- **qe-coverage-analysis**: Analyzes test coverage data (Istanbul, c8, lcov) to identify uncovered lines, branches, and functions with risk-weighted gap detection. Use when analyzing coverage reports, identifying coverage gaps, comparing coverage between branches, or prioritizing which untested code to cover first.
- **qe-defect-intelligence**: Predicts defect-prone code using change frequency, complexity metrics, and historical bug patterns. Use when predicting defects before they escape, analyzing root causes of test failures, learning from past defect patterns, or implementing proactive quality management.
- **qe-iterative-loop**: Runs autonomous red-green-refactor loops to fix failing tests, reach coverage targets, and satisfy quality gates. Use when tests need to pass, coverage thresholds must be met, quality gates require compliance, or flaky tests need stabilization.
- **qe-learning-optimization**: Optimizes QE agent performance through transfer learning, hyperparameter tuning, and pattern distillation across test domains. Use when improving agent accuracy, applying learned patterns to new projects, tuning quality thresholds, or implementing continuous improvement loops for AI-powered testing.
- **qe-quality-assessment**: Evaluates code quality through complexity analysis, lint results, code smell detection, and test health metrics. Use when assessing deployment readiness, configuring quality gates, scoring a codebase for release, or generating quality reports with pass/fail verdicts.
- **qe-requirements-validation**: Validates acceptance criteria for testability, traces requirements to test cases, and generates BDD scenarios from user stories. Use when validating acceptance criteria, building requirements traceability matrices, managing Gherkin scenarios, or ensuring complete requirements coverage before development.
- **qe-test-execution**: Orchestrates test suite execution with parallel sharding, intelligent retry, and real-time reporting across Jest, Vitest, and Playwright. Use when running test suites, optimizing execution time, handling flaky tests, configuring CI test pipelines, or analyzing test run results.
- **qe-test-generation**: Generates durable-first tests — invariants, contracts, and property-based tests at boundaries that survive a reimplementation — plus unit, integration, and e2e coverage. Use when creating tests for new or changed code, filling coverage gaps, or migrating test suites between Jest, Vitest, and Playwright.
- **qe-visual-accessibility**: Captures and compares screenshots across viewports, runs axe-core accessibility scans, and detects visual regressions with pixel-diff analysis. Use when detecting UI regressions, validating responsive layouts, testing WCAG compliance, or ensuring visual consistency after CSS or component changes.
- **security-watch**: Use when working on security-sensitive code to catch secrets, eval(), innerHTML, and other dangerous patterns before they
- **skill-stats**: Use when reviewing which QE skills are being used, finding undertriggering skills, or analyzing skill effectiveness. Shows usage patterns and recommendations.
- **strict-tdd**: Use when enforcing TDD discipline — blocks writing production code unless a failing test exists first. Activate with /strict-tdd to enable session-scoped Red-Green-Refactor guardrail.
- **test-failure-investigator**: Use when a test is failing and you need to determine root cause: is it flaky, an environment issue, or a real regression? Traces failure from symptom to fix.
- **test-metrics-dashboard**: Use when querying test history, analyzing flakiness rates, tracking MTTR, or building quality trend dashboards from test execution data.

## Platform Skills (32)

Claude Flow platform skills (managed separately).

- agentdb-advanced
- agentdb-learning
- agentdb-memory-patterns
- agentdb-optimization
- agentdb-vector-search
- flow-nexus-neural
- flow-nexus-platform
- flow-nexus-swarm
- github-code-review
- github-multi-repo
- github-project-management
- github-release-management
- github-workflow-automation
- hooks-automation
- iterative-loop
- reasoningbank-agentdb
- reasoningbank-intelligence
- release
- skill-builder
- sparc-methodology
- stream-chain
- swarm-advanced
- swarm-orchestration
- v3-cli-modernization
- v3-core-implementation
- v3-ddd-architecture
- v3-integration-deep
- v3-mcp-optimization
- v3-memory-unification
- v3-performance-optimization
- v3-security-overhaul
- v3-swarm-coordination

## Validation Infrastructure

The `.validation/` directory contains the skill validation infrastructure (ADR-056):

- **schemas/**: JSON Schema definitions for validating skill outputs
- **templates/**: Validator script templates for creating skill validators
- **examples/**: Example skill outputs that validate against schemas
- **test-data/**: Test data for validator self-testing

See `.validation/README.md` for usage instructions.

---

*Generated by AQE v3 init on 2026-07-26T08:24:02.025Z*
