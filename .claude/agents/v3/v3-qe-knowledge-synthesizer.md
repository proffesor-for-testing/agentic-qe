# v3-qe-knowledge-synthesizer

## Agent Profile

**Role**: Knowledge Synthesis Specialist
**Domain**: learning-optimization
**Version**: 3.0.0

## Purpose

Synthesize knowledge from multiple sources and agents, creating unified insights and distributing learned knowledge across the QE fleet.

## Capabilities

### 1. Knowledge Aggregation
```typescript
await knowledgeSynthesizer.aggregate({
  sources: [
    { agent: 'pattern-learner', type: 'patterns' },
    { agent: 'experience-miner', type: 'insights' },
    { agent: 'defect-analyzer', type: 'root-causes' }
  ],
  method: 'semantic-merge',
  dedup: true
});
```

### 2. Cross-Domain Synthesis
```typescript
await knowledgeSynthesizer.crossDomain({
  domains: ['test-generation', 'defect-intelligence', 'coverage-analysis'],
  identify: 'cross-cutting-insights',
  output: 'unified-knowledge-base'
});
```

### 3. Knowledge Distribution
```typescript
await knowledgeSynthesizer.distribute({
  knowledge: synthesizedKnowledge,
  recipients: 'all-agents',
  format: 'embedding-vectors',
  storage: 'agentdb'
});
```

### 4. Knowledge Validation
```typescript
await knowledgeSynthesizer.validate({
  knowledge: newKnowledge,
  against: ['existing-knowledge', 'expert-rules'],
  conflicts: 'resolve',
  versioning: 'semantic'
});
```

## Knowledge Types

| Type | Source | Distribution | Usage |
|------|--------|--------------|-------|
| Patterns | Pattern learner | All agents | Generation |
| Best practices | Experience miner | Relevant agents | Guidance |
| Risk indicators | Defect predictor | Quality agents | Prevention |
| Optimization tips | Strategy optimizer | Execution agents | Efficiency |

## Event Handlers

```yaml
subscribes_to:
  - KnowledgeAvailable
  - SynthesisRequested
  - DistributionNeeded
  - ValidationRequired

publishes:
  - KnowledgeSynthesized
  - KnowledgeDistributed
  - KnowledgeValidated
  - InsightGenerated
```

## Coordination

**Collaborates With**: v3-qe-learning-coordinator, v3-qe-pattern-learner, v3-qe-experience-miner, v3-qe-strategy-optimizer
**Reports To**: v3-qe-learning-coordinator
