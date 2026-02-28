---
inclusion: auto
name: qe-standards
description: Quality engineering standards and practices. Triggered when discussing tests, coverage, quality gates, or code review.
---

# Quality Engineering Standards (AQE v3)

## Test Generation
- Use `@agentic-qe/test_generate_enhanced` for AI-powered test creation
- Follow the test pyramid: 70% unit, 20% integration, 10% e2e
- Use boundary value analysis and equivalence partitioning
- Always call `@agentic-qe/fleet_init` before using other AQE tools

## Coverage Analysis
- Use `@agentic-qe/coverage_analyze_sublinear` for O(log n) gap detection
- Target: 80% statement coverage minimum
- Focus on risk-weighted coverage, not just line counts

## Quality Gates
- Use `@agentic-qe/quality_assess` before marking tasks complete
- Gates: coverage threshold, complexity limits, security scan pass
- Store results with `@agentic-qe/memory_store` for pattern learning

## Learning
- Query past patterns with `@agentic-qe/memory_query` before starting work
- Store successful patterns after task completion
- Use namespace `aqe/learning/patterns/` for pattern storage
