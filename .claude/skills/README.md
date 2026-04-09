# AQE Skills Index

This directory contains Quality Engineering skills managed by Agentic QE.

## Summary

- **Total QE Skills**: 85
- **V2 Methodology Skills**: 62
- **V3 Domain Skills**: 24
- **Platform Skills**: 30 (Claude Flow managed)
- **Validation Infrastructure**: ✅ Installed

> **Note**: Platform skills (agentdb, github, flow-nexus, etc.) are managed by claude-flow.
> Only QE-specific skills are installed/updated by `aqe init`.

## V2 Methodology Skills (62)

Version-agnostic quality engineering best practices from the QE community.

- **a11y-ally**: Comprehensive WCAG accessibility auditing with multi-tool testing (axe-core + pa11y + Lighthouse), TRUE PARALLEL execution with Promise.allSettled, graceful degradation, retry with backoff, context-aware remediation, learning integration, and video accessibility. Uses 3-tier browser cascade: Vibium → agent-browser → Playwright+Stealth.
- **accessibility-testing**: WCAG 2.2 compliance testing, screen reader validation, and inclusive design verification. Use when ensuring legal compliance (ADA, Section 508), testing for disabilities, or building accessible applications for 1 billion disabled users globally.
- **agentic-quality-engineering**: AI agents as force multipliers for quality work. Core skill for all 19 QE agents using PACT principles.
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
- **debug-loop**: Hypothesis-driven autonomous debugging with real command validation
- **enterprise-integration-testing**: Orchestration skill for enterprise integration testing across SAP, middleware, WMS, and backend systems. Covers E2E enterprise flows, SAP-specific patterns (RFC, BAPI, IDoc, OData, Fiori), cross-system data validation, and enterprise quality gates.
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours. Use when planning exploration sessions, investigating bugs, or discovering unknown quality risks.
- **holistic-testing-pact**: Apply the Holistic Testing Model evolved with PACT (Proactive, Autonomous, Collaborative, Targeted) principles. Use when designing comprehensive test strategies for Classical, AI-assisted, Agent based, or Agentic Systems building quality into the team, or implementing whole-team quality practices.
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
- **performance-testing**: Test application performance, scalability, and resilience. Use when planning load testing, stress testing, or optimizing system performance.
- **pr-review**: Scope-aware GitHub PR review with user-friendly tone and trust tier validation
- **qcsd-cicd-swarm**: QCSD Verification phase swarm for CI/CD pipeline quality gates using regression analysis, flaky test detection, quality gate enforcement, and deployment readiness assessment. Consumes Development outputs (SHIP/CONDITIONAL/HOLD decisions, quality metrics) and produces signals for Production monitoring.
- **qcsd-development-swarm**: QCSD Development phase swarm for in-sprint code quality assurance using TDD adherence, code complexity analysis, coverage gap detection, and defect prediction. Consumes Refinement outputs (BDD scenarios, SFDIPOT priorities) and produces signals for Verification.
- **qcsd-ideation-swarm**: QCSD Ideation phase swarm for Quality Criteria sessions using HTSM v6.3, Risk Storming, and Testability analysis before development begins. Uses 5-tier browser cascade: Vibium → agent-browser → Playwright+Stealth → WebFetch → WebSearch-fallback.
- **qcsd-production-swarm**: QCSD Production Telemetry phase swarm for post-release production health assessment using DORA metrics, root cause analysis, defect prediction, and cross-phase feedback loops. Consumes CI/CD outputs (RELEASE/REMEDIATE/BLOCK decisions, release readiness metrics) and produces feedback signals to Ideation and Refinement.
- **qcsd-refinement-swarm**: QCSD Refinement phase swarm for Sprint Refinement sessions using SFDIPOT product factors, BDD scenario generation, and requirements validation.
- **quality-metrics**: Measure quality effectively with actionable metrics. Use when establishing quality dashboards, defining KPIs, or evaluating test effectiveness.
- **refactoring-patterns**: Apply safe refactoring patterns to improve code structure without changing behavior. Use when cleaning up code, reducing technical debt, or improving maintainability.
- **regression-testing**: Strategic regression testing with test selection, impact analysis, and continuous regression management. Use when verifying fixes don
- **risk-based-testing**: Focus testing effort on highest-risk areas using risk assessment and prioritization. Use when planning test strategy, allocating testing resources, or making coverage decisions.
- **security-testing**: Test for security vulnerabilities using OWASP principles. Use when conducting security audits, testing auth, or implementing security practices.
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
- **verification-quality**: Comprehensive truth scoring, code quality verification, and automatic rollback system with 0.95 accuracy threshold for ensuring high-quality agent outputs and codebase reliability.
- **visual-testing-advanced**: Advanced visual regression testing with pixel-perfect comparison, AI-powered diff analysis, responsive design validation, and cross-browser visual consistency. Use when detecting UI regressions, validating designs, or ensuring visual consistency.
- **wms-testing-patterns**: Warehouse Management System testing patterns for inventory operations, pick/pack/ship workflows, wave management, EDI X12/EDIFACT compliance, RF/barcode scanning, and WMS-ERP integration. Use when testing WMS platforms (Blue Yonder, Manhattan, SAP EWM).
- **xp-practices**: Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace. Use when implementing agile development practices, improving team collaboration, or adopting technical excellence practices.

## V3 Domain Skills (24)

V3-specific implementation guides for the 12 DDD bounded contexts plus on-demand hooks, investigation runbooks, and measurement tools.

- **pentest-validation**: Orchestrate security finding validation through graduated exploitation. 4-phase pipeline: recon (SAST/DAST), analysis (code review), validation (exploit proof), report (No Exploit, No Report gate). Eliminates false positives by proving exploitability.
- **qe-browser**: Browser automation fleet skill built on Vibium (WebDriver BiDi, ~10MB Go binary, auto-installed by `aqe init`). Ships 5 helpers: typed assertions with 16 check kinds, multi-step batch executor, pixel-perfect visual-diff against baselines, prompt-injection scanner with 14 patterns, and semantic intent scorer with 15 intents (accept_cookies, submit_form, fill_email, etc.). Emits a `skipped` envelope with exit code 2 if vibium isn't installed. Supersedes per-skill browser glue in a11y-ally, e2e-flow-verifier, visual-testing-advanced, and 8 other skills. See [ADR-091](../../../docs/implementation/adrs/ADR-091-qe-browser-skill-vibium-engine.md).
- **qe-chaos-resilience**: Chaos engineering and resilience testing including fault injection, load testing, and system recovery validation.
- **qe-code-intelligence**: Knowledge graph-based code understanding with semantic search and 80% token reduction through intelligent context retrieval.
- **qe-coverage-analysis**: O(log n) sublinear coverage gap detection with risk-weighted analysis and intelligent test prioritization.
- **qe-defect-intelligence**: AI-powered defect prediction, pattern learning, and root cause analysis for proactive quality management.
- **qe-iterative-loop**: Quality Engineering iteration loops for autonomous test improvement, coverage achievement, and quality gate compliance. Use when tests need to pass, coverage targets must be met, quality gates require compliance, or flaky tests need stabilization. Integrates with AQE v3 fleet agents for coordinated quality iteration.
- **qe-learning-optimization**: Transfer learning, metrics optimization, and continuous improvement for AI-powered QE agents.
- **qe-quality-assessment**: Comprehensive quality gates, metrics analysis, and deployment readiness assessment for continuous quality assurance.
- **qe-requirements-validation**: Requirements traceability, acceptance criteria validation, and BDD scenario management for complete requirements coverage.
- **qe-test-execution**: Parallel test execution orchestration with intelligent scheduling, retry logic, and comprehensive result aggregation.
- **qe-test-generation**: AI-powered test generation using pattern recognition, code analysis, and intelligent test synthesis for comprehensive test coverage.
- **qe-visual-accessibility**: Visual regression testing, responsive design validation, and WCAG accessibility compliance testing.

### On-Demand Hooks

- **strict-tdd**: Enforces strict TDD red-green-refactor discipline. Blocks code changes that lack a failing test first.
- **no-skip**: Prevents use of .skip, .only, or xdescribe in test files. Ensures all tests are active.
- **coverage-guard**: Blocks merges when coverage drops below configured thresholds. Enforces coverage-only-goes-up policy.
- **freeze-tests**: Locks the test suite during stabilization periods. Prevents new test additions or modifications.
- **security-watch**: Scans code changes for security anti-patterns (hardcoded secrets, SQL injection, etc.) on every commit.

### Runbook Skills

- **test-failure-investigator**: Automated runbook for investigating test failures. Gathers logs, diffs, recent changes, and flaky-test history to diagnose root cause.
- **coverage-drop-investigator**: Automated runbook for diagnosing coverage drops. Identifies uncovered lines, maps to recent commits, and suggests targeted tests.

### Product Verification

- **e2e-flow-verifier**: End-to-end user flow verification against acceptance criteria. Validates critical paths through the application match expected behavior.

### Data & Analysis

- **test-metrics-dashboard**: Aggregates test results, coverage trends, flaky-test rates, and execution times into a unified dashboard view.

### Measurement

- **skill-stats**: Measures skill usage frequency, success rates, and token costs. Provides data for skill portfolio optimization.

## Platform Skills (30)

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
- reasoningbank-agentdb
- reasoningbank-intelligence
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

*Generated by AQE v3 init on 2026-03-11T09:00:19.526Z*
