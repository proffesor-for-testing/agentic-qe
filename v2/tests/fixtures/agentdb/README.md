# AgentDB Test Fixtures

This directory contains test data for AgentDB integration tests.

## Files

### `sample-patterns.json`
Sample test patterns with metadata for testing pattern storage and retrieval.

**Structure:**
```json
{
  "patterns": [
    {
      "id": "unique-id",
      "type": "test-generation | coverage-analysis | etc",
      "domain": "unit-testing | integration-testing | etc",
      "text": "Human-readable pattern description",
      "metadata": {
        "framework": "jest | playwright | k6",
        "category": "authentication | api | etc",
        "complexity": "low | medium | high",
        "testCount": number
      },
      "confidence": 0.0-1.0,
      "usage_count": number,
      "success_count": number
    }
  ],
  "embeddings": {
    "pattern-id": "Description of embedding model used"
  }
}
```

### `sample-experiences.json`
Sample RL experiences for testing neural training.

**Structure:**
```json
{
  "experiences": [
    {
      "id": "exp-id",
      "state": {
        "taskComplexity": 0.0-1.0,
        "capabilities": ["list", "of", "capabilities"],
        "contextFeatures": { "key": "value" },
        "resourceAvailability": 0.0-1.0,
        "previousAttempts": number
      },
      "action": {
        "type": "parallel | sequential | adaptive",
        "parameters": { "key": "value" }
      },
      "reward": number,
      "nextState": { ... },
      "done": boolean
    }
  ]
}
```

## Usage

### In Tests

```typescript
import * as samplePatterns from './sample-patterns.json';
import * as sampleExperiences from './sample-experiences.json';

// Use in tests
const patterns = samplePatterns.patterns;
const experiences = sampleExperiences.experiences;
```

### Generating Embeddings

For actual tests, embeddings are generated using the MiniLM model:

```typescript
const embedding = await agentDBManager.generateEmbedding(pattern.text);
```

## Test Database Files

Test databases are created in this directory during test execution:
- `test-*.db` - Service tests
- `vector-test-*.db` - Vector search tests
- `quic-test-*.db` - QUIC sync tests
- `neural-test-*.db` - Neural training tests
- `e2e-*.db` - End-to-end tests

These files are automatically cleaned up after tests complete.

## Adding New Fixtures

To add new test fixtures:

1. Create a new JSON file following the structure above
2. Document the structure in this README
3. Use in tests by importing the file
4. Ensure fixtures represent realistic test scenarios

## Notes

- Embeddings in fixtures are placeholders; real embeddings are generated during tests
- All test databases use SQLite
- Test data is designed to be realistic but minimal for fast test execution
- Fixtures should cover common patterns and edge cases
