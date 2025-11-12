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

**Status**: Active
**Version**: 1.0.0
