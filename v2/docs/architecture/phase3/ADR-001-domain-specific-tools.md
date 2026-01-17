# ADR-001: Domain-Specific QE Tools with Strict TypeScript Types

**Status**: Proposed
**Date**: 2025-11-07
**Deciders**: System Architecture Designer, QE Team Lead
**Affected Components**: MCP Tools, Handlers, Agent Coordination

---

## Context and Problem Statement

The Agentic QE Fleet currently has 54 MCP tools with generic interfaces using `any` types, making them error-prone and difficult to maintain. Developer experience suffers from:

1. **Type Unsafety**: `params: any` allows invalid parameters at runtime
2. **Poor IDE Support**: No autocomplete or inline documentation
3. **Scattered Logic**: Test generation split across 3+ files
4. **Inconsistent Naming**: Mix of `test_generate` vs `test-generate`
5. **No Deprecation Strategy**: Breaking changes required for improvements

**Example Problem**:
```typescript
// Current (bad): No type safety
mcp__agentic_qe__test_generate({
  spec: {
    coverageTarget: 150 // Invalid! But TypeScript doesn't catch it
  }
});
```

---

## Decision Drivers

* **Developer Experience**: Must improve IDE support and reduce errors
* **Type Safety**: Eliminate runtime type errors with compile-time checks
* **Maintainability**: Reduce code duplication, easier to extend
* **Backward Compatibility**: Cannot break existing integrations
* **Performance**: Minimal overhead (<5%) for type validation

---

## Considered Options

### Option 1: Keep Generic Types (Status Quo)

**Pros**:
- No migration needed
- No breaking changes
- Fastest short-term

**Cons**:
- Continues current problems
- Technical debt increases
- Poor developer experience
- High error rate (15% invalid calls)

**Verdict**: ❌ Rejected - Technical debt unsustainable

### Option 2: Add Types Without Refactoring

**Pros**:
- Incremental improvement
- No restructuring
- Faster implementation

**Cons**:
- Doesn't fix scattered logic
- Still 54 files to maintain
- Naming inconsistencies remain
- Partial solution

**Verdict**: ❌ Rejected - Insufficient improvement

### Option 3: Domain-Specific Tools with Strict Types (CHOSEN)

**Pros**:
- ✅ **100% type safety** with strict TypeScript
- ✅ **Organized by domain** (8 clear directories)
- ✅ **Shared type library** reduces duplication by 30%
- ✅ **Clear naming**: `generate_unit_test_suite_for_class()`
- ✅ **Backward compatible** via deprecation wrappers
- ✅ **Better IDE support** (autocomplete, inline docs)

**Cons**:
- ⚠️ 13-week implementation timeline
- ⚠️ Requires team training
- ⚠️ 3-month deprecation period

**Verdict**: ✅ **CHOSEN** - Best long-term solution

---

## Decision Outcome

**We will refactor all 54 MCP tools into domain-specific tools with strict TypeScript types.**

### Architectural Changes

#### 1. Directory Structure

```
src/mcp/tools/qe/
├── shared/
│   ├── types.ts              # 2,000+ lines of strict types
│   ├── validation.ts         # Zod runtime validation
│   ├── errors.ts             # Domain errors
│   └── utils.ts              # Utilities
├── test-generation/          # 8 tools
├── coverage/                 # 6 tools
├── quality-gates/            # 5 tools
├── flaky-detection/          # 4 tools
├── performance/              # 4 tools
├── security/                 # 5 tools
├── coordination/             # 12 tools
└── advanced/                 # 10 tools
```

#### 2. Type System

**Before**:
```typescript
interface TestGenerateArgs {
  spec: any; // ❌ No type safety
  agentId?: string;
}
```

**After**:
```typescript
interface UnitTestGenerationParams {
  sourceCode: SourceCodeInfo;
  targetClass?: string;
  framework: TestFramework; // Enum
  coverageTarget: number; // Validated 0-100
  includeEdgeCases: boolean;
  generateMocks: boolean;
  testPatterns: TestPattern[]; // Enum array
}
```

#### 3. Backward Compatibility Layer

```typescript
export function createDeprecatedTool<TOld, TNew>(
  oldName: string,
  newName: string,
  newHandler: (params: TNew) => Promise<any>,
  mapper: (oldParams: TOld) => TNew,
  deprecationDate: string,
  removalDate: string
) {
  return async function deprecatedHandler(oldParams: TOld) {
    console.warn(`DEPRECATED: ${oldName} → ${newName} (removal: ${removalDate})`);
    const newParams = mapper(oldParams);
    return newHandler(newParams);
  };
}
```

### Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 3.1: Foundation | Week 1 | Shared types, validation, errors, utils |
| 3.2: Test Generation | Week 2 | 8 domain-specific tools + deprecation |
| 3.3: Coverage | Week 3 | 6 domain-specific tools |
| 3.4: Quality Gates | Week 4 | 5 domain-specific tools |
| 3.5: Remaining | Weeks 5-8 | 35 domain-specific tools |
| 3.6: Testing | Weeks 9-10 | Integration tests, docs |
| 3.7: Rollout | Weeks 11-12 | Internal migration, warnings |
| 3.8: Cleanup | Week 13 | Remove old tools |

---

## Consequences

### Positive Consequences

1. **Type Safety**: 100% compile-time type checking (vs 0% current)
2. **Error Reduction**: Expected <1% invalid calls (vs 15% current)
3. **Developer Experience**: Full IDE autocomplete and inline docs
4. **Code Quality**: 30% code reduction via shared utilities
5. **Maintainability**: Clear domain organization (8 directories vs 1)
6. **Performance**: <5% overhead for runtime validation (Zod)
7. **Backward Compatible**: 3-month deprecation period

### Negative Consequences

1. **Implementation Time**: 13 weeks (1 architect + 2 developers)
2. **Learning Curve**: Team needs training on new tool names
3. **Migration Burden**: Internal agents need updates
4. **Deprecation Management**: 3 months of maintaining both systems

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | 3-month deprecation + backward compatibility layer |
| Type errors | Strict TypeScript + Zod runtime validation |
| Performance regression | Benchmark tests + profiling |
| Adoption resistance | Clear migration guides + support channels |

---

## Compliance

### Standards Compliance

- ✅ **TypeScript Strict Mode**: All types use strict mode
- ✅ **Zod Validation**: Runtime validation for MCP inputs
- ✅ **ESLint**: Enforces type safety rules
- ✅ **JSDoc**: Full inline documentation
- ✅ **OpenAPI/JSON Schema**: MCP tools export to OpenAPI

### Testing Requirements

- ✅ **Unit Tests**: 90% coverage for all new tools
- ✅ **Integration Tests**: End-to-end tool execution
- ✅ **Type Tests**: TypeScript compilation tests
- ✅ **Regression Tests**: Backward compatibility validation

---

## Related Decisions

- **ADR-002**: Zod vs Joi for Runtime Validation (Zod chosen)
- **ADR-003**: Deprecation Timeline (3 months chosen)
- **ADR-004**: Tool Naming Convention (`verb_noun_detail` format)

---

## References

- **Phase 3 Refactoring Plan**: `docs/architecture/phase3/tool-refactoring-plan.md`
- **Type Definitions**: `src/mcp/tools/qe/shared/types.ts`
- **Validation Schemas**: `src/mcp/tools/qe/shared/validation.ts`
- **Migration Guide**: `docs/migration/phase3-tool-migration.md` (TBD)

---

**Status**: ✅ Approved for Implementation
**Next Review**: 2025-11-14
**Approved By**: System Architecture Designer
