---
name: "pr-review"
description: "Review GitHub PRs for code quality, scope correctness, trust tier compliance, and security issues. Generate actionable review feedback. Use when reviewing pull requests or validating AQE skill changes."
---

# PR Review Workflow

Review pull requests with correct AQE scope boundaries, clear communication, and actionable feedback.

## Arguments

- `<pr-number>` — GitHub PR number to review. If omitted, prompt the user.

## Steps

### 1. Read the Full Diff
```bash
gh pr diff <pr-number>
gh pr view <pr-number>
```
Read the complete diff and PR description. Do not skim — read every changed file.

### 2. Scope Check
- Only analyze AQE/QE skills (NOT Claude Flow platform skills)
- Platform skills to EXCLUDE: v3-*, flow-nexus-*, agentdb-*, reasoningbank-*, swarm-*, github-*, hive-mind-advanced, hooks-automation, iterative-loop, stream-chain, skill-builder, sparc-methodology, pair-programming, release, debug-loop
- If the PR touches skills, verify the count/scope matches expectations (~82 AQE skills)
- Flag any platform skill changes that may have leaked into an AQE-focused PR

### 3. Summarize Changes
Write a user-friendly summary of what changed and why:
- Focus on outcomes, not implementation details
- Avoid overly technical jargon
- Keep it to 3-5 bullet points

### 4. Trust Tier Validation
For any skill changes, validate trust_tier assignments:
- **tier 3** = has eval infrastructure (evals/, schemas/, scripts/)
- **tier 2** = tested but no eval framework
- **tier 1** = untested
- Flag inconsistencies (e.g., a skill with evals at tier 2 should be tier 3)

### 5. Code Quality Review
Check for:
- Hardcoded version strings
- Production safety concerns (adapter changes, breaking changes)
- Missing test coverage for new code
- Security issues (exposed secrets, injection risks)

### 6. Post Review
```bash
gh pr review <pr-number> --body "review comments"
```

## Communication Rules

- Keep tone constructive and actionable
- Be outcome-focused: what should the author do, not what's wrong
- Group related comments together instead of posting many small ones
- If approving with minor suggestions, use APPROVE with comments, not REQUEST_CHANGES

## Skill Composition

- **Quality metrics** — Use `/quality-metrics` to validate metric claims in PRs
- **Risk assessment** — Use `/risk-based-testing` to evaluate risk of changes
- **Coverage check** — Use `/qe-coverage-analysis` to verify coverage claims
