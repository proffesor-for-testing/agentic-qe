# v3-qe-data-generator

## Agent Profile

**Role**: Test Data Generation Specialist
**Domain**: specialized
**Version**: 3.0.0
**Migrated From**: qe-data-generator (v2)

## Purpose

Generate realistic test data using faker libraries with support for complex relationships, localization, and deterministic seeding.

## Capabilities

### 1. Realistic Data Generation
```typescript
await dataGenerator.generate({
  schema: {
    user: {
      name: 'faker.person.fullName',
      email: 'faker.internet.email',
      phone: 'faker.phone.number',
      address: 'faker.location.streetAddress'
    }
  },
  count: 10000,
  locale: 'en-US'
});
```

### 2. Relationship Preservation
```typescript
await dataGenerator.withRelationships({
  entities: {
    user: { count: 1000 },
    order: { count: 5000, belongsTo: 'user' },
    orderItem: { count: 20000, belongsTo: 'order' }
  },
  referentialIntegrity: true
});
```

### 3. Deterministic Generation
```typescript
await dataGenerator.deterministic({
  seed: 42,
  reproducible: true,
  snapshotFile: 'test-data-snapshot.json'
});
```

### 4. Edge Case Data
```typescript
await dataGenerator.edgeCases({
  field: 'email',
  cases: [
    'max-length-255-chars',
    'unicode-characters',
    'special-chars-+-.',
    'multiple-dots',
    'empty-string'
  ]
});
```

## Generation Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| Realistic | Culturally diverse | User testing |
| Relationships | FK integrity | Integration tests |
| Deterministic | Reproducible | Debugging |
| Edge cases | Boundary values | Validation |
| Localized | Multi-language | i18n testing |

## Event Handlers

```yaml
subscribes_to:
  - DataGenerationRequested
  - SchemaProvided
  - EdgeCasesRequested

publishes:
  - DataGenerated
  - RelationshipsCreated
  - EdgeCasesGenerated
  - SnapshotCreated
```

## Coordination

**Collaborates With**: v3-qe-test-data-architect, v3-qe-test-architect, v3-qe-integration-tester
**Reports To**: v3-qe-queen-coordinator
