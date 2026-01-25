# Domain Events Reference

Complete reference for Agentic QE v3 domain events.

## Event Structure

All events follow this structure:

```typescript
interface DomainEvent<T> {
  id: string;
  type: string;
  timestamp: Date;
  source: string;
  correlationId?: string;
  payload: T;
  metadata: Record<string, unknown>;
}
```

## Test Generation Events

| Event | Payload | Description |
|-------|---------|-------------|
| `TestCaseGenerated` | `{ testId, file, framework, coverage }` | Test case created |
| `TestSuiteCreated` | `{ suiteId, files, testCount }` | Test suite created |
| `PatternLearned` | `{ patternId, type, confidence }` | New pattern learned |
| `GenerationFailed` | `{ error, file, reason }` | Generation failed |

```typescript
// Example
eventBus.publish({
  type: 'TestCaseGenerated',
  payload: {
    testId: 'test-123',
    file: 'src/services/UserService.ts',
    framework: 'jest',
    coverage: 85
  }
});
```

## Test Execution Events

| Event | Payload | Description |
|-------|---------|-------------|
| `TestRunStarted` | `{ runId, testCount, parallel }` | Test run started |
| `TestRunCompleted` | `{ runId, passed, failed, duration }` | Test run completed |
| `TestPassed` | `{ testId, duration }` | Individual test passed |
| `TestFailed` | `{ testId, error, stack }` | Individual test failed |
| `FlakyTestDetected` | `{ testId, flakeRate, history }` | Flaky test identified |
| `RetryTriggered` | `{ testId, attempt, maxAttempts }` | Test retry started |

## Coverage Analysis Events

| Event | Payload | Description |
|-------|---------|-------------|
| `CoverageReportCreated` | `{ reportId, metrics }` | Coverage report generated |
| `CoverageGapDetected` | `{ file, lines, riskScore }` | Gap identified |
| `RiskZoneIdentified` | `{ files, riskLevel, factors }` | High-risk area found |
| `MutationTestCompleted` | `{ score, killed, survived }` | Mutation test done |

## Quality Assessment Events

| Event | Payload | Description |
|-------|---------|-------------|
| `QualityGateEvaluated` | `{ gateId, status, metrics }` | Gate evaluated |
| `DeploymentApproved` | `{ releaseId, confidence }` | Deployment approved |
| `DeploymentBlocked` | `{ releaseId, blockers }` | Deployment blocked |
| `QualityScoreUpdated` | `{ score, trend, dimensions }` | Quality score changed |

## Defect Intelligence Events

| Event | Payload | Description |
|-------|---------|-------------|
| `DefectPredicted` | `{ file, probability, factors }` | Defect predicted |
| `RootCauseIdentified` | `{ failureId, cause, evidence }` | Root cause found |
| `RegressionRiskAnalyzed` | `{ changeId, risk, affectedTests }` | Regression risk assessed |
| `PatternRecognized` | `{ patternId, type, instances }` | Defect pattern found |

## Code Intelligence Events

| Event | Payload | Description |
|-------|---------|-------------|
| `KnowledgeGraphUpdated` | `{ entities, relationships }` | KG updated |
| `ImpactAnalysisCompleted` | `{ changes, affectedFiles }` | Impact calculated |
| `SemanticSearchCompleted` | `{ query, results, duration }` | Search completed |
| `DependencyGraphUpdated` | `{ nodes, edges }` | Deps updated |

## Requirements Validation Events

| Event | Payload | Description |
|-------|---------|-------------|
| `RequirementAnalyzed` | `{ reqId, testability, issues }` | Requirement analyzed |
| `BDDScenariosGenerated` | `{ storyId, scenarios }` | BDD scenarios created |
| `TestabilityScored` | `{ reqId, score, factors }` | Testability scored |
| `TraceabilityUpdated` | `{ matrix, coverage }` | Traceability updated |

## Security Compliance Events

| Event | Payload | Description |
|-------|---------|-------------|
| `VulnerabilityDetected` | `{ vulnId, severity, cve }` | Vulnerability found |
| `SecurityAuditCompleted` | `{ score, findings }` | Audit completed |
| `ComplianceValidated` | `{ standard, status, gaps }` | Compliance checked |
| `SecretDetected` | `{ file, line, type }` | Secret found in code |

## Contract Testing Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ContractViolationDetected` | `{ contractId, violation }` | Contract broken |
| `SchemaValidated` | `{ schemaId, valid, errors }` | Schema validated |
| `APICompatibilityChecked` | `{ oldVersion, newVersion, breaking }` | API compat checked |
| `ContractPublished` | `{ contractId, consumer, provider }` | Contract published |

## Visual Accessibility Events

| Event | Payload | Description |
|-------|---------|-------------|
| `VisualRegressionDetected` | `{ page, diff, threshold }` | Visual change found |
| `AccessibilityIssueFound` | `{ issue, wcag, element }` | A11y issue found |
| `ScreenshotBaselineUpdated` | `{ page, viewport }` | Baseline updated |
| `ResponsiveIssueFound` | `{ viewport, issue }` | Responsive problem |

## Chaos Resilience Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ChaosExperimentStarted` | `{ experimentId, fault }` | Experiment started |
| `ChaosExperimentCompleted` | `{ experimentId, hypothesis, result }` | Experiment done |
| `ResilienceValidated` | `{ service, metrics }` | Resilience confirmed |
| `PerformanceBottleneckFound` | `{ service, metric, value }` | Bottleneck found |

## Learning Optimization Events

| Event | Payload | Description |
|-------|---------|-------------|
| `PatternConsolidated` | `{ patterns, domains }` | Patterns consolidated |
| `TransferCompleted` | `{ from, to, patterns }` | Transfer done |
| `OptimizationApplied` | `{ agent, improvement }` | Optimization applied |
| `ABTestCompleted` | `{ hypothesis, winner, confidence }` | A/B test done |

## Cross-Domain Events

| Event | Payload | Description |
|-------|---------|-------------|
| `AgentSpawned` | `{ agentId, type, domain }` | Agent started |
| `AgentTerminated` | `{ agentId, reason }` | Agent stopped |
| `FleetStatusUpdated` | `{ agents, metrics }` | Fleet status changed |
| `ProtocolTriggered` | `{ protocol, participants }` | Protocol started |
| `ProtocolCompleted` | `{ protocol, result }` | Protocol completed |

## Subscribing to Events

```typescript
// Subscribe to specific event
eventBus.subscribe('TestCaseGenerated', async (event) => {
  console.log('Test generated:', event.payload.testId);
});

// Subscribe to pattern
eventBus.subscribePattern('Test*', async (event) => {
  console.log('Test event:', event.type);
});

// Subscribe to domain events
eventBus.subscribeDomain('coverage-analysis', async (event) => {
  console.log('Coverage event:', event.type);
});
```

## Publishing Events

```typescript
// Publish event
await eventBus.publish({
  type: 'CoverageGapDetected',
  payload: {
    file: 'src/service.ts',
    lines: [45, 67, 89],
    riskScore: 0.8
  }
});

// Publish with correlation
await eventBus.publish({
  type: 'TestFailed',
  correlationId: runId,
  payload: { testId, error }
});
```
