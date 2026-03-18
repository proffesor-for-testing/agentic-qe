# Jest Unit Test Scaffold

## Class Under Test Pattern
```typescript
import { {{ClassName}} } from '../src/{{path}}';

describe('{{ClassName}}', () => {
  let sut: {{ClassName}};

  beforeEach(() => {
    sut = new {{ClassName}}(/* dependencies */);
  });

  describe('{{methodName}}', () => {
    it('should return expected result for valid input', () => {
      // Arrange
      const input = /* valid input */;

      // Act
      const result = sut.{{methodName}}(input);

      // Assert
      expect(result).toBe(/* expected */);
    });

    it('should throw for invalid input', () => {
      expect(() => sut.{{methodName}}(null)).toThrow();
    });

    it('should handle edge case: empty input', () => {
      const result = sut.{{methodName}}(/* empty */);
      expect(result).toBe(/* expected for empty */);
    });

    it('should handle edge case: boundary value', () => {
      const result = sut.{{methodName}}(/* boundary */);
      expect(result).toBe(/* expected at boundary */);
    });
  });
});
```

## Integration Test Pattern
```typescript
describe('{{Feature}} Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('should complete the full workflow', async () => {
    // Step 1: Create
    const created = await service.create(validPayload);
    expect(created.id).toBeDefined();

    // Step 2: Read
    const fetched = await service.getById(created.id);
    expect(fetched).toMatchObject(validPayload);

    // Step 3: Update
    const updated = await service.update(created.id, changes);
    expect(updated.field).toBe(changes.field);

    // Step 4: Delete
    await service.delete(created.id);
    await expect(service.getById(created.id)).rejects.toThrow('Not found');
  });
});
```
