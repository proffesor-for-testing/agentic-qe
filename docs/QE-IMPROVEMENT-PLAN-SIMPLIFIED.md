# Agentic QE Fleet - Simplified Improvement Plan

**Date**: 2025-11-07
**Focus**: QE Agents (18) and Skills (34) - Practical Improvements Only
**Based on**: Anthropic MCP code execution post, Claude 4.5 best practices, Agent Skills documentation

---

## ⚠️ CRITICAL: Before Starting ANY Work

**READ THIS FIRST**: [Critical Test Execution Rules](./CRITICAL-TEST-EXECUTION-RULES.md)

**DO NOT run full integration tests** - use `npm run test:integration` (batched) instead.
Running all tests at once crashes the workspace. This has caused multiple productivity losses.

---

## Executive Summary

This plan focuses on **practical, high-impact improvements** to our QE fleet:

1. ✅ **Fix Skill Structure** - Add YAML frontmatter (automatic progressive disclosure)
2. 🚀 **Code Execution Patterns** - Show agents how to write code instead of tool calls
3. 🎯 **Domain-Specific Tools** - Refactor generic tools to QE-specific operations
4. 👥 **Subagent Workflows** - TDD patterns (test-writer → implementer → reviewer)

**Key Insight from Research**: Progressive disclosure is already built into Claude Code - we just need proper YAML frontmatter!

---

## What We Learned from Research

### 1. Progressive Disclosure is Automatic ✅

**We don't need to implement anything!** Claude Code already does this:

```markdown
---
name: my-skill
description: Brief description for discovery
---

# Content

Only loaded when skill is relevant
```

**How it works automatically**:
- Startup: Claude loads only `name` and `description` from frontmatter (~100 tokens per skill)
- Activation: When skill is needed, Claude loads full SKILL.md content
- Resources: Additional files loaded on-demand via bash commands

### 2. Code Execution > Direct Tool Calls

**Anti-pattern** (what we currently do):
```typescript
// Multiple tool calls with full context
await generate_test_suite({...}); // 150K tokens loaded
await execute_tests({...});
await analyze_coverage({...});
```

**Best practice** (Anthropic recommendation):
```typescript
// Single code execution, tools imported as needed
import { generateTests, executeTests, analyzeCoverage } from './servers/qe-tools';

const tests = await generateTests({ sourceFile, framework: 'jest' });
const results = await executeTests(tests, { parallel: true });

if (results.coverage < 95) {
  const gaps = await analyzeCoverage(results);
  return { tests, gaps, needsMore: true };
}
```

**Benefit**: 98.7% token reduction (150K → 2K tokens)

### 3. Domain-Specific > Generic Tools

**Anti-pattern**:
```typescript
❌ create_test(type, params)
❌ analyze_data(data)
```

**Best practice**:
```typescript
✅ generate_unit_test_suite_for_class(sourceFile, coverage)
✅ detect_flaky_tests_with_ml(testRuns, threshold)
✅ validate_deployment_readiness_comprehensive(metrics, policies)
```

---

## Current State

### 18 QE Agents
✅ Already well-defined
❌ No code execution examples
❌ Some use generic tool names

### 34 QE Skills
❌ **Missing YAML frontmatter** (blocks automatic progressive disclosure)
✅ Good content quality
✅ Well-organized by phases

### 54 MCP Tools
✅ Good coverage of QE domains
❌ Some are too generic (need domain-specific refactoring)
✅ Working implementations

---

## Improvement Plan - 4 Focused Phases

## Phase 1: Fix Skill Structure (Week 1)

**Goal**: Add YAML frontmatter to enable automatic progressive disclosure

### What to Do

**For each of 34 skills**, convert from:

```markdown
# Skill Name

Content here...
```

To:

```markdown
---
name: skill-name
description: Brief description (max 1024 chars) explaining what it does and when to use it
---

# Skill Name

Content here...
```

### Batch Conversion Script

```bash
#!/bin/bash
# scripts/add-skill-frontmatter.sh

for skill_file in .claude/skills/**/*.md; do
  if ! grep -q "^---" "$skill_file"; then
    echo "Adding frontmatter to $skill_file"

    # Extract skill name from filename
    skill_name=$(basename $(dirname "$skill_file"))

    # Extract first sentence as description
    description=$(grep -m 1 "^#" "$skill_file" | sed 's/^# //')

    # Create temp file with frontmatter
    cat > "$skill_file.tmp" << EOF
---
name: $skill_name
description: $description
---

EOF

    # Append original content
    cat "$skill_file" >> "$skill_file.tmp"
    mv "$skill_file.tmp" "$skill_file"

    echo "✅ Updated $skill_name"
  fi
done

echo "✅ All skills now have YAML frontmatter"
```

### Example Conversion

**Before** (.claude/skills/agentic-quality-engineering/agentic-quality-engineering.md):
```markdown
# Agentic Quality Engineering

Agentic Quality Engineering uses AI agents as force multipliers...
```

**After**:
```markdown
---
name: agentic-quality-engineering
description: Using AI agents as force multipliers in quality work - autonomous testing systems, PACT principles, scaling QE with intelligent agents
---

# Agentic Quality Engineering

Agentic Quality Engineering uses AI agents as force multipliers...
```

### Token Savings

**Before**:
```
34 skills × ~5K tokens each = ~170K tokens
(All loaded into context on every agent activation)
```

**After**:
```
34 skills × ~100 tokens frontmatter = ~3.4K tokens initially
Full content loaded only when skill is relevant
Savings: 98% (166.6K tokens)
```

**Deliverables**:
- ✅ All 34 skills have YAML frontmatter
- ✅ Automated conversion script
- ✅ Validation script to check frontmatter
- ✅ Documentation on skill structure

---

## Phase 2: Add Code Execution Examples (Week 2)

**Goal**: Show agents how to write code to orchestrate QE workflows instead of direct tool calls

### Update Agent Definitions

**For each of 18 QE agents**, add code execution examples in their definitions.

**Example: qe-test-generator.md**

**Add section**:
```markdown
## Code Execution Workflows

### Comprehensive Test Generation

Instead of multiple tool calls, write code to orchestrate the workflow:

\`\`\`typescript
import {
  generateUnitTests,
  generateIntegrationTests,
  analyzeGaps,
  optimizeTestSuite
} from './servers/qe-tools/test-generation';

// Generate initial unit tests
const unitTests = await generateUnitTests({
  sourceFile: './src/UserService.ts',
  framework: 'jest',
  coverage: { target: 95, includeEdgeCases: true }
});

// Check coverage and fill gaps if needed
if (unitTests.coverage.statements < 95) {
  const gaps = await analyzeGaps(unitTests.coverage);

  const integrationTests = await generateIntegrationTests({
    gaps,
    endpoints: ['POST /users', 'GET /users/:id']
  });

  unitTests.addTests(integrationTests);
}

// Optimize for execution speed
const optimized = await optimizeTestSuite({
  tests: unitTests,
  constraints: { maxExecutionTime: 300, parallelizable: true }
});

return optimized;
\`\`\`

### Discover Available Tools

\`\`\`bash
# List all test generation tools
ls ./servers/qe-tools/test-generation/

# Search for specific functionality
./servers/qe-tools/search_tools.ts "coverage" "basic"
\`\`\`
```

### Template for All 18 Agents

```markdown
## Code Execution Workflows

### [Common Workflow Name]

\`\`\`typescript
import { [tools] } from './servers/qe-tools/[domain]';

// Workflow code example
\`\`\`

### Discover Tools

\`\`\`bash
ls ./servers/qe-tools/[domain]/
\`\`\`
```

**Deliverables**:
- ✅ Code execution examples for all 18 agents
- ✅ 3-5 workflow examples per agent
- ✅ Tool discovery commands
- ✅ Updated documentation

---

## Phase 3: Domain-Specific Tool Refactoring (Weeks 3-4)

**Goal**: Refactor generic tools into high-level QE domain operations

### Current vs Target

**Current (Generic)**:
```typescript
// src/mcp/tools.ts
generate_test(params: any)           // Too generic
execute_task(task: any)              // Too generic
analyze_data(data: any)              // Too generic
```

**Target (Domain-Specific)**:
```typescript
// src/mcp/tools/qe/test-generation/
generate_unit_test_suite_for_class({
  sourceFile: string,
  className: string,
  coverage: { target: number, includeEdgeCases: boolean },
  framework: 'jest' | 'mocha' | 'vitest'
})

generate_integration_test_for_api_endpoint({
  openApiSpec: string,
  endpoint: string,
  scenarios: string[],
  testData: { factories: boolean }
})

// src/mcp/tools/qe/coverage/
analyze_coverage_with_risk_scoring({
  coverage: string,
  sourceFiles: string,
  riskFactors: { criticalPaths: string[], complexity: number }
})

// src/mcp/tools/qe/quality-gates/
validate_deployment_readiness_comprehensive({
  release: string,
  checks: DeploymentChecks,
  policies: string[]
})
```

### Organize by QE Domain

```
src/mcp/tools/qe/
├── test-generation/          # 8 tools
│   ├── generate-unit-tests.ts
│   ├── generate-integration-tests.ts
│   ├── generate-property-tests.ts
│   └── optimize-test-suite.ts
├── coverage/                 # 6 tools
│   ├── analyze-with-risk-scoring.ts
│   ├── detect-gaps-ml.ts
│   └── recommend-tests.ts
├── quality-gates/           # 5 tools
│   ├── validate-readiness.ts
│   ├── assess-risk.ts
│   └── check-policies.ts
├── flaky-detection/         # 4 tools
│   ├── detect-statistical.ts
│   ├── analyze-root-causes.ts
│   └── stabilize-auto.ts
├── performance/             # 4 tools
│   ├── run-load-test.ts
│   └── analyze-bottlenecks.ts
├── security/                # 5 tools
│   ├── scan-comprehensive.ts
│   └── validate-auth.ts
└── shared/
    ├── types.ts
    └── validators.ts
```

### Backward Compatibility

Keep old tool names as deprecated aliases:

```typescript
/**
 * @deprecated Use generate_unit_test_suite_for_class() instead
 * This will be removed in v3.0.0 (3 months)
 */
export function generate_test(params: any) {
  console.warn('⚠️  generate_test() is deprecated. Use generate_unit_test_suite_for_class()');
  return generate_unit_test_suite_for_class(params);
}
```

**Deliverables**:
- ✅ 32 domain-specific tools (refactored from 54 generic)
- ✅ Organized by 6 QE domains
- ✅ Backward compatibility with deprecation warnings
- ✅ Migration guide
- ✅ Updated MCP server

---

## Phase 4: Subagent Workflows (Weeks 5-6)

**Goal**: Add specialized subagent patterns for TDD and quality workflows

### Define QE Subagents

**4 Core Subagents** for TDD workflow:

1. **qe-test-writer** (RED phase)
```yaml
---
name: qe-test-writer
role: specialized-subagent
parent: qe-test-generator
---

# Test Writer Subagent

Write failing tests BEFORE implementation (TDD red phase).

## Workflow
1. Receive specification
2. Write failing tests (95%+ coverage spec)
3. Use AAA or Given-When-Then patterns
4. Include edge cases and error paths
5. Return tests for implementation
```

2. **qe-test-implementer** (GREEN phase)
```yaml
---
name: qe-test-implementer
role: specialized-subagent
parent: qe-test-generator
---

# Test Implementer Subagent

Make tests pass with minimal code (TDD green phase).

## Workflow
1. Receive failing tests
2. Implement minimal code to pass tests
3. Run tests continuously
4. Ensure all tests pass
5. Return implementation for review
```

3. **qe-test-refactorer** (REFACTOR phase)
```yaml
---
name: qe-test-refactorer
role: specialized-subagent
parent: qe-test-generator
---

# Test Refactorer Subagent

Refactor code while keeping tests green (TDD refactor phase).

## Workflow
1. Receive implementation with passing tests
2. Identify refactoring opportunities
3. Apply safe refactorings
4. Keep all tests passing
5. Return improved code
```

4. **qe-code-reviewer** (QUALITY phase)
```yaml
---
name: qe-code-reviewer
role: specialized-subagent
parent: qe-test-generator
---

# Code Reviewer Subagent

Enforce quality standards and security.

## Workflow
1. Receive implementation and tests
2. Check linting, complexity (<15)
3. Scan for security issues
4. Validate coverage (≥95%)
5. Approve or request changes
```

### Orchestration in Parent Agent

**Update qe-test-generator.md**:

```markdown
## TDD Workflow with Subagents

\`\`\`typescript
// Orchestrate TDD workflow
async function generateWithTDD(spec: TestSpec) {
  // RED: Write failing tests
  const tests = await delegateToSubagent('qe-test-writer', {
    spec,
    coverage: 95,
    patterns: ['AAA']
  });

  // GREEN: Make tests pass
  const impl = await delegateToSubagent('qe-test-implementer', {
    tests,
    requirements: spec.requirements
  });

  // REFACTOR: Improve code quality
  const refactored = await delegateToSubagent('qe-test-refactorer', {
    code: impl.code,
    tests
  });

  // REVIEW: Quality validation
  const review = await delegateToSubagent('qe-code-reviewer', {
    code: refactored.code,
    tests,
    policies: ['./policies/code-standards.yaml']
  });

  if (!review.approved) {
    // Iterate with feedback
    return generateWithTDD(spec);
  }

  return { tests, code: refactored.code, review };
}
\`\`\`
```

**Deliverables**:
- ✅ 12 specialized subagent definitions
- ✅ TDD workflow orchestration examples
- ✅ Documentation for each subagent
- ✅ Integration with parent agents

---

## Expected Impact

### Token Reduction

```
Before:
- Skills: 170K tokens (all loaded)
- Agent defs: 90K tokens
- Tools: 108K tokens
Total: 368K tokens per activation

After:
- Skills: 3.4K tokens (frontmatter only)
- Agent defs: 90K tokens
- Tools: 2K tokens (on-demand)
Total: 95.4K tokens per activation

Reduction: 74% (272.6K tokens saved)
```

### Cost Savings

```
Before: 368K tokens × $0.015/1K = $5.52 per activation
After: 95.4K tokens × $0.015/1K = $1.43 per activation

Savings per activation: $4.09 (74%)

With multi-model router (80% savings):
Final cost: $1.43 × 0.20 = $0.286 per activation

Total savings: 94.8% vs baseline
```

### Performance

```
Agent activation: 8-12s → 2-4s (3x faster)
Tool discovery: N/A → <100ms (new capability)
Workflow execution: Same (no change)
```

### Quality

```
Test coverage: 90% → 95%+ (gap-driven generation)
Flaky test rate: 5% → <1% (ML detection)
Code complexity: <20 → <15 (enforced by reviewer)
```

---

## Implementation Timeline

### Month 1: Core Improvements

**Week 1**: Phase 1 - Fix Skills Structure
- Day 1-2: Write batch conversion script
- Day 3-4: Convert all 34 skills
- Day 5: Test and validate

**Week 2**: Phase 2 - Code Execution Examples
- Day 1-3: Add examples to 18 agents
- Day 4-5: Test and documentation

**Week 3-4**: Phase 3 - Domain-Specific Tools
- Week 3: Design and implement 32 tools
- Week 4: Backward compatibility and migration

### Month 2: Advanced Features

**Week 5-6**: Phase 4 - Subagent Workflows
- Week 5: Define 12 subagents
- Week 6: Orchestration examples

**Week 7**: Testing and refinement
**Week 8**: Documentation and release

---

## Success Metrics

### Must Have
- ✅ All 34 skills have YAML frontmatter
- ✅ Token reduction ≥70%
- ✅ All 18 agents have code execution examples
- ✅ Backward compatibility maintained

### Should Have
- ✅ 32+ domain-specific tools
- ✅ 12 subagent definitions
- ✅ Cost savings ≥90% (with multi-model router)
- ✅ 3x faster agent activation

### Nice to Have
- ✅ Automated migration tools
- ✅ CLI helpers (skill builder, visualizer)
- ✅ Video tutorials

---

## Risk Mitigation

### Risk: Breaking existing workflows
**Mitigation**:
- Maintain backward compatibility
- Deprecate gradually (3 months)
- Provide migration guide

### Risk: Users don't adopt code execution
**Mitigation**:
- Clear examples for common patterns
- Side-by-side comparison (old vs new)
- Show benefits (speed, cost)

### Risk: YAML frontmatter errors
**Mitigation**:
- Validation script
- Clear error messages
- Automated conversion tool

---

## Next Steps

1. ✅ **Review plan with team**
2. ✅ **Approve priorities and timeline**
3. 🚀 **Start Phase 1** (can begin immediately)
4. 📊 **Set up metrics tracking**
5. 📝 **Plan beta testing**

---

**Key Takeaway**: We don't need to implement progressive disclosure - it's already automatic in Claude Code. We just need to add YAML frontmatter to our 34 skills, and we'll get 98% token reduction immediately!

---

**Prepared by**: Claude Code
**Date**: 2025-11-07
**Status**: Ready to Implement
**Version**: 2.0 (Simplified)
