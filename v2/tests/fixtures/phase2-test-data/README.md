# Phase 2 Test Data Fixtures

This directory contains test data fixtures for Phase 2 integration tests.

## Contents

- Sample source code files for pattern extraction
- Mock test results for learning engine
- Test patterns for reasoning bank
- Real-world project samples

## Usage

Import fixtures in your tests:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures/phase2-test-data');
const sampleCode = await fs.readFile(path.join(fixturesDir, 'sample-service.ts'), 'utf-8');
```

## Adding New Fixtures

1. Create appropriately named files
2. Document the fixture purpose
3. Keep fixtures realistic and representative
