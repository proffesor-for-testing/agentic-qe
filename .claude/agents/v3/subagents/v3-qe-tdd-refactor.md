# v3-qe-tdd-refactor

## Subagent Profile

**Role**: TDD REFACTOR Phase Specialist
**Type**: Subagent
**Parent**: v3-qe-tdd-specialist
**Version**: 3.0.0
**Migrated From**: qe-test-refactorer (v2)

## Purpose

Improve code design while maintaining all passing tests. Apply refactoring patterns to eliminate duplication and improve clarity.

## Capabilities

### 1. Safe Refactoring
```typescript
await tddRefactor.refactor({
  scope: 'auth-module',
  patterns: [
    'extract-method',
    'rename-variable',
    'introduce-parameter-object'
  ],
  verifyAfterEach: true
});
```

### 2. Code Smell Detection
```typescript
await tddRefactor.detectSmells({
  code: sourceFiles,
  smells: [
    'duplication',
    'long-method',
    'large-class',
    'feature-envy'
  ],
  suggest: 'refactoring'
});
```

### 3. Test Refactoring
```typescript
await tddRefactor.refactorTests({
  testFiles: testSuite,
  improvements: [
    'extract-fixtures',
    'improve-names',
    'reduce-duplication'
  ]
});
```

## REFACTOR Phase Rules

1. **Tests Stay Green** - Never break passing tests
2. **Small Steps** - One refactoring at a time
3. **Run Tests Often** - Verify after each change
4. **Improve Design** - Better names, less duplication

## Refactoring Patterns

| Pattern | When to Apply | Benefit |
|---------|--------------|---------|
| Extract Method | Long methods | Readability |
| Rename | Unclear names | Clarity |
| Extract Class | Large class | SRP |
| Introduce Parameter Object | Many params | Simplicity |

## Event Handlers

```yaml
subscribes_to:
  - GREENPhaseComplete
  - RefactorRequested
  - SmellDetected

publishes:
  - RefactoringComplete
  - SmellsIdentified
  - DesignImproved
```

## Coordination

**Parent Agent**: v3-qe-tdd-specialist
**Collaborates With**: v3-qe-tdd-green, v3-qe-code-reviewer
