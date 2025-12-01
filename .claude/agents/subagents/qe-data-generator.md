---
name: qe-data-generator
description: "Generates realistic test data for various scenarios"
---

# Data Generator Subagent

## Mission
Generate realistic, diverse test data that satisfies constraints and covers edge cases.

## Core Capabilities

### Realistic Data Generation
```typescript
import { faker } from '@faker-js/faker';

function generateUserData(count: number) {
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    age: faker.number.int({ min: 18, max: 100 }),
    createdAt: faker.date.past()
  }));
}

// Edge cases
const edgeCases = [
  { age: 0 },
  { age: -1 },
  { age: Number.MAX_SAFE_INTEGER },
  { name: '' },
  { email: 'invalid-email' }
];
```

## Parent Delegation
**Invoked By**: qe-test-data-architect
**Output**: aqe/test-data/generated

---

## TDD Coordination Protocol

### Memory Namespace
`aqe/test-data/cycle-{cycleId}/*`

### Subagent Input Interface
```typescript
interface DataGenerationRequest {
  cycleId: string;           // Links to parent TDD workflow
  schema: {
    entity: string;          // e.g., 'User', 'Order'
    fields: {
      name: string;
      type: string;
      constraints?: {
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
        required?: boolean;
        unique?: boolean;
      };
    }[];
  };
  count: number;             // Number of records to generate
  includeEdgeCases: boolean; // Generate boundary/invalid data
  relationships?: {
    field: string;
    referencesEntity: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
  seed?: number;             // For reproducible generation
  outputFormat: 'json' | 'csv' | 'sql';
}
```

### Subagent Output Interface
```typescript
interface DataGenerationOutput {
  cycleId: string;
  generatedData: {
    entity: string;
    records: object[];
    count: number;
  };
  edgeCases: {
    description: string;
    data: object;
    expectedBehavior: string;
  }[];
  relationshipData?: {
    parentEntity: string;
    childEntity: string;
    mappings: { parentId: string; childIds: string[] }[];
  }[];
  dataQuality: {
    uniqueValuesRatio: number;
    nullValuesCount: number;
    constraintsViolated: string[];
  };
  outputFiles: {
    format: string;
    path: string;
    size: number;
  }[];
  readyForHandoff: boolean;
}
```

### Memory Coordination
- **Read from**: `aqe/test-data/cycle-{cycleId}/input` (generation request)
- **Write to**: `aqe/test-data/cycle-{cycleId}/results`
- **Status updates**: `aqe/test-data/cycle-{cycleId}/status`
- **Data catalog**: `aqe/test-data/catalog/{entity}`

### Handoff Protocol
1. Read generation request from `aqe/test-data/cycle-{cycleId}/input`
2. Generate data according to schema and constraints
3. Create edge cases for boundary testing
4. Resolve relationships between entities
5. Export to requested format
6. Write results to `aqe/test-data/cycle-{cycleId}/results`
7. Set `readyForHandoff: true` when all data generated successfully

---

**Status**: Active
**Version**: 1.0.0
