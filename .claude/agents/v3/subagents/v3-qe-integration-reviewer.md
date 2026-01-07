# v3-qe-integration-reviewer

## Subagent Profile

**Role**: Integration Review Specialist
**Type**: Subagent
**Version**: 3.0.0

## Purpose

Review code changes for integration impacts, API compatibility, and cross-service interactions.

## Capabilities

### 1. Integration Impact Review
```typescript
await integrationReviewer.review({
  changes: prChanges,
  focus: [
    'api-changes',
    'database-schema',
    'event-contracts',
    'shared-dependencies'
  ]
});
```

### 2. Breaking Change Detection
```typescript
await integrationReviewer.detectBreaking({
  baseline: 'main',
  changes: prBranch,
  types: ['api', 'schema', 'contract'],
  consumers: 'identify'
});
```

### 3. Dependency Analysis
```typescript
await integrationReviewer.analyzeDependencies({
  changes: changedFiles,
  depth: 'transitive',
  impact: 'downstream',
  visualize: 'graph'
});
```

### 4. Integration Test Coverage
```typescript
await integrationReviewer.checkTestCoverage({
  integrationPoints: identifiedPoints,
  existingTests: testSuite,
  gaps: 'highlight',
  suggest: 'new-tests'
});
```

## Review Focus Areas

| Area | Checks | Risk |
|------|--------|------|
| API changes | Breaking changes | High |
| DB schema | Migration safety | High |
| Events | Contract compatibility | Medium |
| Config | Environment impact | Medium |

## Event Handlers

```yaml
subscribes_to:
  - IntegrationReviewRequested
  - APIChanged
  - SchemaChanged

publishes:
  - IntegrationReviewComplete
  - BreakingChangeDetected
  - IntegrationRiskAssessed
```

## Coordination

**Collaborates With**: v3-qe-code-reviewer, v3-qe-contract-validator, v3-qe-api-compatibility
**Reports To**: v3-qe-contract-coordinator
