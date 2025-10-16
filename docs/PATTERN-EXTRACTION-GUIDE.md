# Pattern Extraction System - Phase 2 (v1.1.0)

## Overview

The Pattern Extraction System provides AST-based pattern extraction from test suites, enabling:
- Automatic identification of test patterns
- Code signature generation for pattern matching
- Reusable test template creation
- Pattern classification and recommendation

## Architecture

### Components

1. **PatternExtractor** - Extracts patterns from test files
2. **CodeSignatureGenerator** - Generates code fingerprints
3. **TestTemplateCreator** - Creates reusable templates
4. **PatternClassifier** - Classifies and recommends patterns

### Supported Pattern Types

- **Edge Cases**: null, undefined, empty, zero values
- **Boundary Conditions**: Range checks, thresholds
- **Error Handling**: Try-catch, error throws
- **Async Patterns**: async/await, Promises
- **Mock Patterns**: Mocks, stubs, spies
- **Assertion Patterns**: Multiple assertions
- **Setup/Teardown**: Before/after hooks
- **Data-Driven**: Parameterized tests

### Supported Frameworks

- Jest
- Mocha
- Cypress
- Vitest
- Jasmine
- AVA

## Usage

### Basic Pattern Extraction

```typescript
import { PatternExtractor } from '@/reasoning';

const extractor = new PatternExtractor({
  frameworks: ['jest', 'mocha'],
  minConfidence: 0.7,
  minFrequency: 2,
  maxPatternsPerFile: 10
});

// Extract from single file
const patterns = await extractor.extractFromFile('/path/to/test.spec.ts');

// Extract from multiple files
const result = await extractor.extractFromFiles([
  '/path/to/test1.spec.ts',
  '/path/to/test2.spec.ts'
]);

console.log(`Extracted ${result.patterns.length} patterns`);
console.log(`Processing time: ${result.statistics.processingTime}ms`);
```

### Code Signature Generation

```typescript
import { CodeSignatureGenerator } from '@/reasoning';

const generator = new CodeSignatureGenerator();

const signature = await generator.generate(`
function validateUser(user: User | null): boolean {
  if (user === null) {
    throw new Error('User cannot be null');
  }
  return user.age >= 18;
}
`);

console.log('Function:', signature.functionSignature);
console.log('Complexity:', signature.complexity);
console.log('Patterns:', signature.patterns);
console.log('Dependencies:', signature.dependencies);
```

### Template Creation

```typescript
import { TestTemplateCreator } from '@/reasoning';
import { TestFramework } from '@/types/pattern.types';

const creator = new TestTemplateCreator();

// Create template from pattern
const template = await creator.createTemplate(pattern);

// Instantiate template with parameters
const testCode = await creator.instantiateTemplate(
  template,
  TestFramework.JEST,
  {
    suiteName: 'User Validation',
    testName: 'should reject null users',
    input: null,
    expectedOutput: false,
    edgeValue: 'null'
  }
);

console.log(testCode);
```

### Pattern Classification

```typescript
import { PatternClassifier } from '@/reasoning';

const classifier = new PatternClassifier();

// Load patterns
classifier.loadPatterns(extractedPatterns);

// Classify a pattern
const classification = await classifier.classify(pattern);
console.log(`Type: ${classification.type}`);
console.log(`Confidence: ${classification.confidence}`);
console.log(`Reasoning: ${classification.reasoning}`);

// Find similar patterns
const similar = await classifier.findSimilarPatterns(
  'pattern-id',
  0.7, // threshold
  5    // limit
);

// Get recommendations for code
const recommendations = await classifier.recommendPatterns(sourceCode, 5);
recommendations.forEach(rec => {
  console.log(`${rec.patternName}: ${rec.score.toFixed(2)} - ${rec.reason}`);
});
```

## Configuration

### Pattern Extraction Config

```typescript
interface PatternExtractionConfig {
  frameworks: TestFramework[];        // Frameworks to support
  minConfidence: number;              // Minimum confidence (0-1)
  minFrequency: number;               // Minimum frequency for inclusion
  maxPatternsPerFile: number;         // Max patterns per file
  parallel: boolean;                  // Enable parallel processing
  astOptions: ASTAnalysisOptions;     // AST parsing options
  patternTypeFilters?: PatternType[]; // Filter specific types
}
```

### AST Analysis Options

```typescript
interface ASTAnalysisOptions {
  includeComments?: boolean;  // Parse comments
  typescript?: boolean;       // Parse TypeScript
  jsx?: boolean;             // Parse JSX/TSX
  maxDepth?: number;         // Max AST depth
}
```

## Performance Benchmarks

- **Pattern Extraction**: 100+ files in < 5 seconds
- **Accuracy**: > 85% pattern extraction accuracy
- **Code Signature**: < 50ms per generation
- **Template Instantiation**: < 10ms per template

## Integration with ReasoningBank

```typescript
import { PatternExtractor } from '@/reasoning';

const extractor = new PatternExtractor();

// Extract patterns
const result = await extractor.extractFromFiles(testFiles);

// Store in ReasoningBank via memory
await memoryStore.store('phase2/extracted-patterns', {
  patterns: result.patterns,
  statistics: result.statistics,
  timestamp: new Date()
}, {
  partition: 'reasoning',
  ttl: 86400 // 24 hours
});

// Retrieve patterns
const stored = await memoryStore.retrieve('phase2/extracted-patterns', {
  partition: 'reasoning'
});
```

## Examples

### Example 1: Extract Edge Case Patterns

```typescript
const testFile = `
describe('Calculator', () => {
  it('handles null', () => {
    expect(calc(null)).toBeNull();
  });

  it('handles undefined', () => {
    expect(calc(undefined)).toBeUndefined();
  });

  it('handles empty string', () => {
    expect(calc('')).toBe(0);
  });
});
`;

const patterns = await extractor.extractFromFile(testFile);
// Output: 3 EDGE_CASE patterns with confidence > 0.85
```

### Example 2: Generate Template for Error Handling

```typescript
const errorPattern = patterns.find(p => p.type === 'error-handling');
const template = await creator.createTemplate(errorPattern);

// Generate Jest test
const jestCode = await creator.instantiateTemplate(
  template,
  TestFramework.JEST,
  {
    suiteName: 'API Service',
    testName: 'should throw on invalid ID',
    input: 'invalid-id',
    expectedOutput: null,
    errorType: 'ValidationError',
    errorMessage: 'Invalid ID format'
  }
);

// Generate Mocha test
const mochaCode = await creator.instantiateTemplate(
  template,
  TestFramework.MOCHA,
  { /* same params */ }
);
```

### Example 3: Recommend Patterns for New Code

```typescript
const sourceCode = `
async function createUser(data: UserData | null): Promise<User> {
  if (data === null) {
    throw new Error('User data required');
  }

  if (data.age < 0 || data.age > 150) {
    throw new Error('Invalid age');
  }

  return await userRepository.create(data);
}
`;

const recommendations = await classifier.recommendPatterns(sourceCode);

// Recommended patterns:
// 1. EDGE_CASE (null handling) - score: 0.92
// 2. ERROR_HANDLING (validation errors) - score: 0.88
// 3. BOUNDARY_CONDITION (age range) - score: 0.85
// 4. ASYNC_PATTERN (async operation) - score: 0.83
```

## API Reference

### PatternExtractor

- `extractFromFile(filePath: string): Promise<TestPattern[]>`
- `extractFromFiles(filePaths: string[]): Promise<PatternExtractionResult>`
- `getPatterns(): TestPattern[]`

### CodeSignatureGenerator

- `generate(sourceCode: string, options?: ASTAnalysisOptions): Promise<CodeSignature>`

### TestTemplateCreator

- `createTemplate(pattern: TestPattern): Promise<TestTemplate>`
- `createTemplates(patterns: TestPattern[]): Promise<TestTemplate[]>`
- `validateTemplate(template: TestTemplate, params: Record<string, any>): Promise<ValidationResult>`
- `instantiateTemplate(template: TestTemplate, framework: TestFramework, params: Record<string, any>): Promise<string>`

### PatternClassifier

- `loadPatterns(patterns: TestPattern[]): void`
- `classify(pattern: TestPattern): Promise<PatternClassificationResult>`
- `calculateSimilarity(pattern1Id: string, pattern2Id: string): Promise<PatternSimilarity>`
- `recommendPatterns(sourceCode: string, limit?: number): Promise<PatternRecommendation[]>`
- `findSimilarPatterns(patternId: string, threshold?: number, limit?: number): Promise<PatternSimilarity[]>`
- `getPattern(id: string): TestPattern | undefined`
- `getPatterns(): TestPattern[]`

## Best Practices

1. **Pattern Extraction**
   - Start with high confidence threshold (0.7+)
   - Process multiple files for better pattern detection
   - Review extracted patterns for relevance

2. **Code Signatures**
   - Use for change detection and pattern matching
   - Cache signatures for performance
   - Update when code changes

3. **Templates**
   - Validate parameters before instantiation
   - Test generated code
   - Customize for specific needs

4. **Pattern Classification**
   - Load sufficient patterns for accurate classification
   - Use similarity scores for deduplication
   - Combine multiple recommendation signals

## Troubleshooting

### Low Pattern Extraction Rate

- Decrease `minConfidence` threshold
- Increase `maxPatternsPerFile` limit
- Check framework detection

### Template Validation Errors

- Verify all required parameters provided
- Check parameter constraints
- Review validation rules

### Poor Recommendations

- Load more patterns for better classification
- Adjust applicability conditions
- Review code signature accuracy

## Future Enhancements

- Machine learning-based pattern classification
- Cross-framework pattern translation
- Pattern mutation testing
- Automated pattern optimization
- Pattern library marketplace

## Support

For issues or questions:
- GitHub Issues: https://github.com/proffesor-for-testing/agentic-qe/issues
- Documentation: /docs
- Examples: /examples/pattern-extraction
