# Skills Mapping - QE Fleet vs Claude Flow

**Date**: October 20, 2025
**Purpose**: Define which skills belong to Agentic QE Fleet vs Claude Flow platform

## QE Fleet Skills (17 Total)

These are the **only skills** that should be initialized during `aqe init`.

### Core Quality Practices (5 skills)

| Skill Name | Status | Description |
|------------|--------|-------------|
| `holistic-testing-pact` | ✅ Exists | Evolved framework combining holistic testing with PACT principles |
| `context-driven-testing` | ✅ Exists | RST techniques and contextual best practices |
| `agentic-quality-engineering` | ✅ Exists | AI agents amplifying human judgment in QE |
| `exploratory-testing-advanced` | ✅ Exists | Deep RST heuristics, SBTM, test tours |
| `risk-based-testing` | ✅ Exists | Focus testing where failure hurts most |

### Development Methodologies (3 skills)

| Skill Name | Status | Description |
|------------|--------|-------------|
| `tdd-london-chicago` | ✅ Exists | Both TDD approaches, when to use each |
| `xp-practices` | ✅ Exists | Pair/ensemble programming patterns |
| `refactoring-patterns` | ✅ Exists | Safe code improvements from 12+ years in quality |

### Testing Specializations (4 skills)

| Skill Name | Status | Description |
|------------|--------|-------------|
| `api-testing-patterns` | ✅ Exists | REST, GraphQL, contract testing |
| `performance-testing` | ✅ Exists | Load, stress, soak strategies |
| `security-testing` | ✅ Exists | OWASP Top 10, vulnerability patterns |
| `test-automation-strategy` | ✅ Exists | When/how to automate, avoiding theater |

### Communication & Process (3 skills)

| Skill Name | Status | Description |
|------------|--------|-------------|
| `technical-writing` | ✅ Exists | Clear content for practitioners (conference talks) |
| `bug-reporting-excellence` | ✅ Exists | What makes bug reports actionable |
| `code-review-quality` | ✅ Exists | Code reviews that teach and improve |

### Professional Skills (2 skills)

| Skill Name | Status | Description |
|------------|--------|-------------|
| `consultancy-practices` | ✅ Exists | Assessment, transformation, advisory work |
| `quality-metrics` | ✅ Exists | Meaningful metrics vs vanity metrics |

## Status Summary

- **All Skills Exist**: 17/17 (100%) ✅
- **Need to Optimize**: 17/17 using skill-builder

### All 17 Skills Verified Present

All skills exist in `.claude/skills/` and only need optimization with skill-builder.

## Claude Flow Skills (NOT part of QE Fleet)

These skills are **excluded** from `aqe init` and are part of the Claude Flow platform:

### Flow Nexus (8 skills)
- ❌ `flow-nexus-swarm` - AI swarm orchestration
- ❌ `flow-nexus-neural` - Neural network training
- ❌ `flow-nexus-workflow` - Event-driven workflows
- ❌ `flow-nexus-challenges` - Coding challenges
- ❌ `flow-nexus-sandbox` - E2B sandbox management
- ❌ `flow-nexus-app-store` - App marketplace
- ❌ `flow-nexus-payments` - Credit management
- ❌ `flow-nexus-auth` - Authentication

### GitHub Integration (5 skills)
- ❌ `github-code-review` - GitHub PR reviews
- ❌ `github-multi-repo` - Multi-repo coordination
- ❌ `github-project-management` - Project boards
- ❌ `github-release-management` - Release automation
- ❌ `github-workflow-automation` - GitHub Actions

### AgentDB (5 skills)
- ❌ `agentdb-advanced` - Advanced AgentDB features
- ❌ `agentdb-learning` - AI learning plugins
- ❌ `agentdb-memory-patterns` - Persistent memory
- ❌ `agentdb-optimization` - Performance optimization
- ❌ `agentdb-vector-search` - Semantic search

### Other Platform Skills (15+ skills)
- ❌ `swarm-orchestration` - Multi-agent swarms
- ❌ `stream-chain` - JSON chaining
- ❌ `sparc-methodology` - SPARC development
- ❌ `reasoningbank-*` - ReasoningBank features
- ❌ `skill-builder` - Skill creation (meta-skill)
- ❌ `hooks-automation` - Hook management
- ❌ `pair-programming` - AI pair programming modes
- ❌ `verification-quality` - Truth scoring
- ❌ And more...

**Total Claude Flow Skills**: 35+ (excluded from QE Fleet)

## Integration Rules

### For `aqe init` Command

**Only initialize these 17 QE skills**:

```typescript
// src/cli/commands/init.ts
private static readonly QE_FLEET_SKILLS = [
  // Core Quality Practices
  'holistic-testing-pact',
  'context-driven-testing',
  'agentic-quality-engineering',
  'exploratory-testing-advanced',
  'risk-based-testing',

  // Development Methodologies
  'tdd-london-chicago',
  'xp-practices',
  'refactoring-patterns',

  // Testing Specializations
  'api-testing-patterns',
  'performance-testing',
  'security-testing',
  'test-automation-strategy',

  // Communication & Process
  'technical-writing',
  'bug-reporting-excellence',
  'code-review-quality',

  // Professional Skills
  'consultancy-practices',
  'quality-metrics'
];
```

### Skill-Agent Mapping

Each QE agent should reference relevant skills:

| Agent | Primary Skills |
|-------|----------------|
| `qe-test-generator` | agentic-quality-engineering, api-testing-patterns, tdd-london-chicago |
| `qe-coverage-analyzer` | agentic-quality-engineering, quality-metrics |
| `qe-flaky-test-hunter` | exploratory-testing-advanced, risk-based-testing |
| `qe-performance-tester` | performance-testing, quality-metrics |
| `qe-security-scanner` | security-testing, risk-based-testing |
| `qe-quality-gate` | quality-metrics, risk-based-testing |
| `qe-api-contract-validator` | api-testing-patterns |
| `qe-test-executor` | test-automation-strategy |
| All agents | agentic-quality-engineering (core skill) |

## Extension Strategy

To add new skills in the future:

1. **Create skill using `skill-builder`**:
   ```bash
   Skill("skill-builder")
   # Follow prompts to create new skill
   ```

2. **Add to QE_FLEET_SKILLS list**:
   ```typescript
   // src/cli/commands/init.ts
   private static readonly QE_FLEET_SKILLS = [
     // ... existing skills ...
     'new-skill-name'  // Add here
   ];
   ```

3. **Update SKILLS-MAPPING.md**: Document the new skill

4. **Map to relevant agents**: Update agent definitions

## Implementation Priority

### Phase 4: Skill & Agent Optimization

**Priority 1 - Optimize All 17 Existing Skills**:
- Use `skill-builder` to enhance ALL 17 skills
- Add progressive disclosure structure
- Improve examples and documentation
- Add QE agent integration patterns
- Ensure proper YAML frontmatter

**Priority 2 - Agent Integration**:
- Update all 17 agent definitions with `skills:` field
- Map relevant skills to each agent (per AGENT_SKILLS_MAP)
- Add skill usage examples in agent docs
- Add Q-learning observability documentation

## Success Metrics

- ✅ `aqe init` creates only 17 QE skills (not 45)
- ✅ All 17 skills exist and are valid
- ✅ All 17 agents reference relevant skills
- ✅ `aqe skills list` shows exactly 17 skills
- ✅ No Claude Flow skills in QE fleet initialization

---

**Last Updated**: October 20, 2025
**Owner**: Agentic QE Fleet Team
**Next Review**: After Phase 4 completion
