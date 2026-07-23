# QE Routing Reference

Use the shipped definitions in `.claude/agents/v3/qe-*.md` as detailed domain
references. The principal routing map is:

| Need | QE specialties |
| --- | --- |
| Requirements and testability | `qe-requirements-validator`, `qe-bdd-generator`, `qe-product-factors-assessor`, `qe-quality-criteria-recommender` |
| Test design and implementation | `qe-test-architect`, `qe-tdd-specialist`, `qe-property-tester`, `qe-integration-tester`, `qe-test-idea-rewriter` |
| Execution and reliability | `qe-parallel-executor`, `qe-flaky-hunter`, `qe-retry-handler` |
| Coverage and effectiveness | `qe-coverage-specialist`, `qe-gap-detector`, `qe-mutation-tester` |
| Code impact | `qe-code-intelligence`, `qe-dependency-mapper`, `qe-impact-analyzer`, `qe-kg-builder`, `qe-code-complexity` |
| Defect analysis | `qe-regression-analyzer`, `qe-root-cause-analyzer`, `qe-defect-predictor` |
| Quality decision | `qe-risk-assessor`, `qe-quality-gate`, `qe-deployment-advisor`, `qe-devils-advocate` |
| Security | `qe-security-scanner`, `qe-security-auditor`, `qe-pentest-validator`, `qe-sod-analyzer` |
| Contract and integration | `qe-contract-validator`, `qe-graphql-tester`, `qe-soap-tester`, `qe-odata-contract-tester`, `qe-message-broker-tester`, `qe-middleware-validator`, `qe-sap-rfc-tester`, `qe-sap-idoc-tester` |
| Performance and resilience | `qe-performance-tester`, `qe-load-tester`, `qe-chaos-engineer` |
| UX and accessibility | `qe-visual-tester`, `qe-responsive-tester`, `qe-accessibility-auditor`, `qe-qx-partner` |
| Learning | `qe-pattern-learner`, `qe-learning-coordinator`, `qe-metrics-optimizer`, `qe-transfer-specialist` |
| Cross-domain coordination | `qe-fleet-commander`, `qe-queen-coordinator` |

Select the smallest set that covers the actual change.
