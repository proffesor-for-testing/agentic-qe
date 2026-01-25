# Phase 3: Domain-Specific Tool Refactoring - READY FOR IMPLEMENTATION

**Status**: ✅ Architecture Complete - Ready to Start Implementation
**Date**: 2025-11-08
**Architect**: System Architecture Designer Agent
**Estimated Duration**: 7 working days (2 weeks)

---

## 🎯 Quick Start

**For Implementation Agents**: Start with these files in order:

1. **Read the Architecture**: [`phase3-architecture.md`](./phase3-architecture.md) (complete specification)
2. **Follow the Checklist**: [`phase3-checklist.md`](./phase3-checklist.md) (step-by-step tasks)
3. **View Directory Tree**: [`phase3-directory-tree.txt`](./phase3-directory-tree.txt) (visual structure)

---

## 📊 Architecture Summary

### Deliverables

| Metric | Count |
|--------|-------|
| **New Tools** | 15 |
| **Reorganized Tools** | 17 |
| **Total Tools** | 32 |
| **Domains** | 6 |
| **New Type Definitions** | 50+ |
| **New Shared Utilities** | 2 (validators, errors) |

### Domain Breakdown

```
Coverage Domain          6 tools  (4 new + 2 existing)  🔥 CRITICAL
Flaky Detection Domain   4 tools  (3 new + 1 existing)  🔥 HIGH
Performance Domain       4 tools  (2 new + 2 existing)  🟡 MEDIUM
Security Domain          5 tools  (4 new + 1 existing)  🟡 MEDIUM
Visual Testing Domain    3 tools  (2 new + 1 existing)  🟢 LOW
Test Generation Domain   4 tools  (0 new + 4 existing)  🟢 LOW
Quality Gates Domain     5 tools  (0 new + 5 existing)  🟢 LOW
```

---

## 🗂️ File Structure

**Complete directory tree**: See [`phase3-directory-tree.txt`](./phase3-directory-tree.txt)

**Key locations**:
```
src/mcp/tools/qe/
├── coverage/          (6 tools)
├── flaky-detection/   (4 tools)
├── performance/       (4 tools)
├── security/          (5 tools)
├── visual/            (3 tools)
├── test-generation/   (4 tools)
├── quality-gates/     (5 tools)
└── shared/            (types, validators, errors)

src/mcp/tools/
└── deprecated.ts      (15+ backward compatibility wrappers)

docs/migration/
└── phase3-tools.md    (migration guide - TO BE CREATED)
```

---

## 📅 Implementation Timeline

### Week 3 (Implementation)

**Day 1**:
- AM: Create shared utilities (`validators.ts`, `errors.ts`)
- PM: Coverage domain (4 new tools)

**Day 2**:
- Flaky detection domain (3 new tools)

**Day 3**:
- AM: Performance domain (2 new tools)
- PM: Security domain (4 new tools)

**Day 4**:
- AM: Visual testing domain (2 new tools)
- PM: Reorganize test-generation tools

**Day 5**:
- Reorganize quality-gates tools

### Week 4 (Cleanup & Documentation)

**Day 1**:
- Backward compatibility wrappers

**Day 2**:
- Migration guide and documentation

**Day 3**:
- Testing and validation

---

## 🔧 Implementation Order (Priority-Based)

1. ✅ **Shared Utilities** (0.5 days) - FOUNDATION
   - `src/mcp/tools/qe/shared/validators.ts`
   - `src/mcp/tools/qe/shared/errors.ts`
   - Update `src/mcp/tools/qe/shared/types.ts`

2. 🔥 **Coverage Domain** (1.0 days) - CRITICAL PRIORITY
   - `recommend-tests.ts` (NEW)
   - `analyze-critical-paths.ts` (NEW)
   - `calculate-trends.ts` (NEW)
   - `export-report.ts` (NEW)
   - Move existing: `analyze-with-risk-scoring.ts`, `detect-gaps-ml.ts`

3. 🔥 **Flaky Detection Domain** (1.0 days) - HIGH PRIORITY
   - `analyze-patterns.ts` (NEW)
   - `stabilize-auto.ts` (NEW)
   - `track-history.ts` (NEW)
   - Move existing: `detect-statistical.ts`

4. 🟡 **Performance Domain** (0.5 days) - MEDIUM PRIORITY
   - `analyze-bottlenecks.ts` (NEW)
   - `generate-report.ts` (NEW)
   - Move existing: `run-benchmark.ts`, `monitor-realtime.ts`

5. 🟡 **Security Domain** (1.0 days) - MEDIUM PRIORITY
   - `validate-auth.ts` (NEW)
   - `check-authz.ts` (NEW)
   - `scan-dependencies.ts` (NEW)
   - `generate-report.ts` (NEW)
   - Move existing: `scan-comprehensive.ts`

6. 🟢 **Visual Testing Domain** (0.5 days) - LOW PRIORITY
   - `compare-screenshots.ts` (NEW)
   - `validate-accessibility.ts` (NEW)
   - Move existing: `detect-regression.ts`

7. 🟢 **Test Generation Reorganization** (0.5 days)
   - Move 4 existing tools to new location

8. 🟢 **Quality Gates Reorganization** (0.5 days)
   - Rename and move 5 existing tools

9. 🔄 **Backward Compatibility** (0.5 days)
   - Create `src/mcp/tools/deprecated.ts` with 15+ wrappers

10. 📝 **Documentation & Testing** (1.0 days)
    - Migration guide
    - Tool catalog
    - Unit tests (75 tests)
    - Integration tests (19 tests)

---

## 📚 Key Documents

### Architecture & Planning
- **[phase3-architecture.md](./phase3-architecture.md)** - Complete technical specification (13,000+ lines)
  - Directory structure
  - TypeScript type definitions (50+ new types)
  - Tool specifications (all 32 tools)
  - Implementation order
  - Integration points
  - Backward compatibility strategy
  - Testing strategy

- **[phase3-checklist.md](./phase3-checklist.md)** - Step-by-step implementation tasks
  - Prioritized checklist format
  - Task-by-task breakdown
  - Success criteria
  - Timeline

- **[phase3-directory-tree.txt](./phase3-directory-tree.txt)** - Visual directory structure
  - Complete file tree
  - File move mapping
  - Tool counts by domain

### Source Documents
- **[QE-IMPROVEMENT-PLAN-SIMPLIFIED.md](../QE-IMPROVEMENT-PLAN-SIMPLIFIED.md)** - Original improvement plan
  - Lines 317-416: Phase 3 details

---

## 🎯 Success Criteria

### Must Have ✅
- [ ] All 15 new tools implemented
- [ ] All 17 existing tools reorganized
- [ ] 100% backward compatibility maintained
- [ ] All unit tests pass (75 tests)
- [ ] All integration tests pass (19 tests)
- [ ] TypeScript build succeeds
- [ ] Migration guide created

### Should Have ✅
- [ ] Zero `any` types in new code
- [ ] JSDoc documentation for all tools
- [ ] Agent code execution examples updated (7 agents)
- [ ] Tool catalog generated
- [ ] Deprecation warnings logged

### Nice to Have ✨
- [ ] Interactive tool selector CLI
- [ ] Auto-generated tool documentation
- [ ] Usage analytics integration
- [ ] Performance benchmarks

---

## 🔒 Backward Compatibility

**Strategy**: 100% backward compatibility with deprecated wrappers

**Timeline**:
- **v1.5.0** (November 2025): Release with deprecation warnings
- **v2.0.0** (December 2025): Warnings become errors in dev mode
- **v2.5.0** (January 2026): Deprecated tools throw errors
- **v3.0.0** (February 2026): **REMOVAL** - Deprecated tools deleted

**Example Wrapper**:
```typescript
/**
 * @deprecated Use analyzeCoverageWithRiskScoring() instead
 * Will be removed in v3.0.0 (scheduled for February 2026)
 */
export async function test_coverage_detailed(params: any) {
  console.warn(
    '⚠️  test_coverage_detailed() is deprecated.\n' +
    '   Use analyzeCoverageWithRiskScoring() from coverage domain.\n' +
    '   Migration: docs/migration/phase3-tools.md'
  );
  return coverage.analyzeCoverageWithRiskScoring(params);
}
```

---

## 🧪 Testing Strategy

### Unit Tests (75 tests)
- 15 new tools × 4 tests/tool = 60 tests
- 2 shared utilities × 5 tests/util = 10 tests
- 1 deprecated wrapper × 5 tests = 5 tests

### Integration Tests (19 tests)
- 6 domains × 2 workflow tests/domain = 12 tests
- 1 end-to-end workflow = 1 test
- 6 backward compatibility scenarios = 6 tests

### Test Execution
```bash
# Sequential batched execution (to avoid OOM)
npm run test:unit -- tests/unit/tools/qe/coverage
npm run test:unit -- tests/unit/tools/qe/flaky-detection
npm run test:unit -- tests/unit/tools/qe/performance
npm run test:unit -- tests/unit/tools/qe/security
npm run test:unit -- tests/unit/tools/qe/visual
npm run test:integration -- tests/integration/tools/qe/
npm run test:integration -- tests/integration/tools/deprecated/
```

---

## 🚨 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | CRITICAL | 100% backward compatibility with wrappers |
| Migration confusion | HIGH | Comprehensive migration guide with examples |
| Test failures | HIGH | Incremental testing after each domain |
| Performance regression | MEDIUM | Benchmark before/after |
| Type safety issues | MEDIUM | Strict TypeScript mode |
| Memory leaks | HIGH | Memory profiling, proper cleanup |

---

## 📦 Deliverables Checklist

### Code
- [ ] 6 domain directories with tools
- [ ] 15 new tool implementations
- [ ] 17 reorganized/renamed tools
- [ ] 2 new shared utilities (validators, errors)
- [ ] 50+ new TypeScript types
- [ ] 15+ backward compatibility wrappers
- [ ] 32 MCP tool registrations

### Documentation
- [ ] Migration guide (`docs/migration/phase3-tools.md`)
- [ ] Tool catalog (`docs/tools/catalog.md`)
- [ ] Updated README.md
- [ ] Updated CLAUDE.md
- [ ] Updated 7 agent code execution examples
- [ ] CHANGELOG.md entry

### Tests
- [ ] 75 unit tests
- [ ] 19 integration tests
- [ ] TypeScript build verification
- [ ] Linting verification

---

## 🔗 Integration Points

### MCP Tool Registration
- **File**: `src/mcp/tools.ts`
- **Action**: Add 32 tool definitions with `mcp__agentic_qe__<domain>__<action>` naming

### Agent Code Execution Examples
**Update 7 agent definitions**:
1. `.claude/agents/qe-coverage-analyzer.md`
2. `.claude/agents/qe-flaky-test-hunter.md`
3. `.claude/agents/qe-performance-tester.md`
4. `.claude/agents/qe-security-scanner.md`
5. `.claude/agents/qe-visual-tester.md`
6. `.claude/agents/qe-test-generator.md`
7. `.claude/agents/qe-quality-gate.md`

**Pattern**:
```typescript
// BEFORE
import { executeTool } from './servers/mcp/tools.js';
const result = await executeTool('test_coverage_detailed', params);

// AFTER
import { analyzeCoverageWithRiskScoring } from './servers/qe-tools/coverage/index.js';
const result = await analyzeCoverageWithRiskScoring(params);
```

### Memory/AgentDB Integration
**Flaky detection tools** use AgentDB:
```typescript
import { AgentDB } from '@/lib/agentdb/index.js';
const db = new AgentDB({ path: '.agentic-qe/db/flaky-tests.db' });
```

---

## 💡 Quick Reference: New Tools by Domain

### Coverage (4 new)
1. `recommend-tests.ts` - Recommend tests for coverage gaps
2. `analyze-critical-paths.ts` - Analyze critical execution paths
3. `calculate-trends.ts` - Calculate coverage trends over time
4. `export-report.ts` - Export coverage reports in multiple formats

### Flaky Detection (3 new)
1. `analyze-patterns.ts` - Analyze flaky test patterns (timing, env, race conditions)
2. `stabilize-auto.ts` - Auto-stabilize flaky tests
3. `track-history.ts` - Track flaky test history

### Performance (2 new)
1. `analyze-bottlenecks.ts` - Identify performance bottlenecks
2. `generate-report.ts` - Generate performance reports

### Security (4 new)
1. `validate-auth.ts` - Validate authentication flows
2. `check-authz.ts` - Check authorization rules
3. `scan-dependencies.ts` - Scan dependencies for vulnerabilities
4. `generate-report.ts` - Generate security reports

### Visual (2 new)
1. `compare-screenshots.ts` - Compare screenshots with AI
2. `validate-accessibility.ts` - Validate WCAG accessibility

---

## 🚀 Getting Started

### For Implementation Agents

1. **Read the complete architecture**: [`phase3-architecture.md`](./phase3-architecture.md)
2. **Start with Priority 1**: Shared utilities (validators, errors)
3. **Follow the checklist**: [`phase3-checklist.md`](./phase3-checklist.md)
4. **Use batched testing**: Avoid running all tests at once (OOM risk)

### For Code Reviewers

1. **Check type safety**: No `any` types, all strict TypeScript
2. **Verify backward compatibility**: All deprecated wrappers work
3. **Test incrementally**: Domain by domain
4. **Review migration guide**: Ensure clarity for users

### For QA/Testing Agents

1. **Run unit tests per domain**: Sequential execution
2. **Run integration tests**: Batched execution
3. **Test backward compatibility**: All deprecated wrappers
4. **Verify builds**: TypeScript compilation succeeds

---

## 📞 Support & Questions

**Architecture Questions**: Refer to [`phase3-architecture.md`](./phase3-architecture.md) Section X
**Implementation Questions**: Check [`phase3-checklist.md`](./phase3-checklist.md)
**Original Requirements**: See [`QE-IMPROVEMENT-PLAN-SIMPLIFIED.md`](../QE-IMPROVEMENT-PLAN-SIMPLIFIED.md) lines 317-416

---

**Status**: ✅ READY FOR IMPLEMENTATION
**Next Action**: Begin implementation with Priority 1 (Shared Utilities)
**Estimated Completion**: 7 working days from start date

---

*Generated by System Architecture Designer Agent*
*Date: 2025-11-08*
*Version: 1.0.0*
