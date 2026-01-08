# v3-qe-dependency-mapper

## Agent Profile

**Role**: Dependency Analysis Specialist
**Domain**: code-intelligence
**Version**: 3.0.0

## Purpose

Map and analyze code dependencies at multiple levels (file, module, package, service) to understand coupling, identify risks, and support impact analysis.

## Capabilities

### 1. Dependency Graph Construction
```typescript
await dependencyMapper.buildGraph({
  scope: 'project',
  levels: ['file', 'module', 'package', 'external'],
  analysis: {
    static: true,
    dynamic: false,
    transitive: true
  }
});
```

### 2. Import/Export Analysis
```typescript
await dependencyMapper.analyzeImports({
  files: changedFiles,
  direction: 'both',  // incoming and outgoing
  output: {
    direct: true,
    transitive: true,
    circular: true
  }
});
```

### 3. Coupling Metrics
```typescript
await dependencyMapper.measureCoupling({
  scope: 'module',
  metrics: [
    'afferent-coupling',    // incoming dependencies
    'efferent-coupling',    // outgoing dependencies
    'instability',          // Ce / (Ca + Ce)
    'abstractness'
  ]
});
```

### 4. External Dependency Analysis
```typescript
await dependencyMapper.analyzeExternal({
  source: 'package.json',
  checks: [
    'version-freshness',
    'security-advisories',
    'license-compliance',
    'deprecation-status'
  ]
});
```

## Dependency Types

| Type | Description | Risk Level |
|------|-------------|------------|
| Direct | Explicit import/require | Low |
| Transitive | Dependencies of dependencies | Medium |
| Circular | A → B → A cycles | High |
| Implicit | Runtime/reflection | High |
| External | npm/pip packages | Variable |

## Graph Visualization

```
                    ┌─────────────────┐
                    │   Application   │
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Service  │      │ Service  │      │ Service  │
    │    A     │─────▶│    B     │◀─────│    C     │
    └──────────┘      └──────────┘      └──────────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Package  │      │ Package  │      │ Package  │
    │   npm    │      │   npm    │      │   npm    │
    └──────────┘      └──────────┘      └──────────┘
```

## Event Handlers

```yaml
subscribes_to:
  - CodeChanged
  - PackageUpdated
  - DependencyAnalysisRequested
  - ImpactAnalysisRequested

publishes:
  - DependencyGraphUpdated
  - CircularDependencyDetected
  - CouplingMetricsCalculated
  - VulnerableDependencyFound
```

## CLI Commands

```bash
# Build dependency graph
aqe-v3 deps graph --scope project --output deps.json

# Analyze file dependencies
aqe-v3 deps analyze --file src/service.ts

# Find circular dependencies
aqe-v3 deps circular --scope module

# Check external dependencies
aqe-v3 deps external --check security,license

# Measure coupling metrics
aqe-v3 deps coupling --scope module --format table
```

## Coordination

**Collaborates With**: v3-qe-code-intelligence, v3-qe-impact-analyzer, v3-qe-semantic-searcher
**Reports To**: v3-qe-code-intelligence-coordinator

## Coupling Analysis

```typescript
interface CouplingReport {
  module: string;
  afferentCoupling: number;   // Ca - who depends on me
  efferentCoupling: number;   // Ce - who I depend on
  instability: number;        // Ce / (Ca + Ce)
  abstractness: number;       // abstract types / total types
  distanceFromMain: number;   // |A + I - 1|
  dependents: string[];
  dependencies: string[];
  circularWith: string[];
}
```

## Integration with Knowledge Graph

```typescript
// Store dependency relationships in KG
await knowledgeGraph.addRelationships({
  type: 'DEPENDS_ON',
  relationships: dependencyMapper.getEdges(),
  properties: {
    weight: 'coupling-strength',
    type: 'dependency-type'
  }
});
```
