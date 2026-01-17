# Reasoning Bank - Practical Examples

Complete examples for using the QE Reasoning Bank to store, retrieve, and share test patterns across projects.

## Table of Contents

- [Quick Start](#quick-start)
- [Pattern Extraction](#pattern-extraction)
- [Pattern Matching](#pattern-matching)
- [Cross-Project Sharing](#cross-project-sharing)
- [Template Usage](#template-usage)
- [Advanced Scenarios](#advanced-scenarios)

---

## Quick Start

### Basic Pattern Extraction

Extract patterns from your existing test suite:

```typescript
import { QEReasoningBank } from 'agentic-qe';

// Initialize the Reasoning Bank
const bank = new QEReasoningBank({
  databasePath: './.aqe/reasoning-bank.db',
  cacheSize: 1000,
  enableMLMatching: true
});

await bank.initialize();

// Extract patterns from test files
const patterns = await bank.extractPatterns({
  testFiles: ['./tests/**/*.test.ts'],
  framework: 'jest',
  projectId: 'user-service',
  minQuality: 0.7  // Only extract high-quality patterns
});

console.log(`✅ Extracted ${patterns.length} patterns`);

patterns.forEach(pattern => {
  console.log(`\n📋 Pattern: ${pattern.metadata.name}`);
  console.log(`   Type: ${pattern.patternType}`);
  console.log(`   Quality: ${(pattern.metadata.quality.coverage * 100).toFixed(1)}%`);
  console.log(`   Usage: ${pattern.metadata.usage.totalUses} times`);
});
```

**Expected Output**:
```
✅ Extracted 12 patterns

📋 Pattern: Null User Validation
   Type: edge-case
   Quality: 92.5%
   Usage: 0 times

📋 Pattern: API Timeout Handling
   Type: error-handling
   Quality: 88.3%
   Usage: 0 times

📋 Pattern: Concurrent Request Test
   Type: integration
   Quality: 95.1%
   Usage: 0 times
```

### CLI Usage

```bash
# Extract patterns from tests
aqe patterns extract --path tests/ --framework jest --min-quality 0.7

# List all stored patterns
aqe patterns list

# Export patterns for backup
aqe patterns export --output patterns-backup.json
```

---

## Pattern Extraction

### Example 1: Extract from Multiple Frameworks

```typescript
import { QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({
  databasePath: './.aqe/reasoning-bank.db'
});

await bank.initialize();

// Extract Jest patterns
const jestPatterns = await bank.extractPatterns({
  testFiles: ['./tests/unit/**/*.test.ts'],
  framework: 'jest',
  projectId: 'my-app'
});

// Extract Cypress patterns
const cypressPatterns = await bank.extractPatterns({
  testFiles: ['./tests/e2e/**/*.cy.ts'],
  framework: 'cypress',
  projectId: 'my-app'
});

// Extract Mocha patterns
const mochaPatterns = await bank.extractPatterns({
  testFiles: ['./tests/integration/**/*.spec.js'],
  framework: 'mocha',
  projectId: 'my-app'
});

console.log(`Total patterns: ${jestPatterns.length + cypressPatterns.length + mochaPatterns.length}`);
console.log(`  Jest: ${jestPatterns.length}`);
console.log(`  Cypress: ${cypressPatterns.length}`);
console.log(`  Mocha: ${mochaPatterns.length}`);
```

### Example 2: Extract with Custom Filters

```typescript
// Extract only high-quality edge-case patterns
const edgeCasePatterns = await bank.extractPatterns({
  testFiles: ['./tests/**/*.test.ts'],
  framework: 'jest',
  projectId: 'my-app',
  minQuality: 0.85,  // High quality threshold
  excludePatterns: ['skip', 'todo', 'wip']  // Exclude incomplete tests
});

// Filter by pattern type
const integrationPatterns = edgeCasePatterns.filter(
  p => p.patternType === 'integration'
);

console.log(`Found ${integrationPatterns.length} high-quality integration patterns`);
```

### Example 3: Extract and Store Custom Metadata

```typescript
import { PatternExtractor, CodeSignatureGenerator } from 'agentic-qe';

const extractor = new PatternExtractor();
const sigGenerator = new CodeSignatureGenerator();

// Extract patterns with custom metadata
const patterns = await extractor.extractFromFiles([
  './tests/user-service.test.ts'
]);

for (const pattern of patterns) {
  // Generate code signature
  const signature = await sigGenerator.generateSignature(pattern.sourceCode);

  // Add custom metadata
  pattern.metadata.author = 'qa-team';
  pattern.metadata.tags = ['authentication', 'critical'];
  pattern.metadata.version = '1.0.0';
  pattern.metadata.examples = [
    {
      code: pattern.testTemplate.code,
      description: 'Example usage for user authentication'
    }
  ];

  // Store pattern
  const patternId = await bank.storePattern(pattern);
  console.log(`Stored pattern: ${patternId}`);
}
```

---

## Pattern Matching

### Example 1: Find Similar Patterns for New Code

```typescript
import { CodeSignatureGenerator, QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
const sigGenerator = new CodeSignatureGenerator();

await bank.initialize();

// Read target file
const targetCode = await fs.readFile('src/payment-service.ts', 'utf-8');

// Generate code signature
const signature = await sigGenerator.generateSignature(targetCode);

// Find matching patterns
const matches = await bank.findPatterns({
  codeSignature: signature,
  framework: 'jest',
  minSimilarity: 0.8,
  limit: 10,
  sortBy: 'similarity'
});

console.log(`\n🔍 Found ${matches.length} matching patterns for PaymentService\n`);

matches.forEach((match, idx) => {
  console.log(`${idx + 1}. ${match.pattern.metadata.name}`);
  console.log(`   Similarity: ${(match.similarityScore * 100).toFixed(1)}%`);
  console.log(`   Type: ${match.pattern.patternType}`);
  console.log(`   Quality: ${(match.pattern.metadata.quality.coverage * 100).toFixed(1)}%`);
  console.log(`   Match Details:`);
  console.log(`     - Structure: ${(match.matchDetails.structureSimilarity * 100).toFixed(1)}%`);
  console.log(`     - Identifiers: ${(match.matchDetails.identifierSimilarity * 100).toFixed(1)}%`);
  console.log(`     - Metadata: ${(match.matchDetails.metadataSimilarity * 100).toFixed(1)}%`);
  console.log();
});
```

**Expected Output**:
```
🔍 Found 5 matching patterns for PaymentService

1. Transaction Validation
   Similarity: 92.3%
   Type: edge-case
   Quality: 95.1%
   Match Details:
     - Structure: 94.5%
     - Identifiers: 88.2%
     - Metadata: 91.0%

2. Payment Error Handling
   Similarity: 87.5%
   Type: error-handling
   Quality: 89.3%
   Match Details:
     - Structure: 89.1%
     - Identifiers: 85.0%
     - Metadata: 88.0%
```

### Example 2: Match by Pattern Type and Tags

```typescript
// Find all error-handling patterns with specific tags
const errorPatterns = await bank.findPatterns({
  patternType: 'error-handling',
  tags: ['api', 'timeout'],
  framework: 'jest',
  minSimilarity: 0.7,
  limit: 20
});

console.log(`Found ${errorPatterns.length} error-handling patterns for API timeouts`);

// Find boundary condition patterns
const boundaryPatterns = await bank.findPatterns({
  patternType: 'boundary',
  framework: 'jest',
  sortBy: 'quality'  // Sort by quality score
});

console.log(`Found ${boundaryPatterns.length} boundary condition patterns`);
```

### Example 3: Pattern Similarity Analysis

```typescript
// Compare two patterns
const patternA = 'abc123';  // Pattern ID
const patternB = 'def456';  // Pattern ID

const similarity = await bank.computeSimilarity(patternA, patternB);

console.log(`Pattern Similarity: ${(similarity * 100).toFixed(1)}%`);

if (similarity > 0.9) {
  console.log('⚠️  These patterns are very similar - consider merging');
} else if (similarity > 0.7) {
  console.log('ℹ️  These patterns share common characteristics');
} else {
  console.log('✅ These patterns are distinct');
}
```

---

## Cross-Project Sharing

### Example 1: Share Patterns Between Projects

```typescript
import { QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
await bank.initialize();

// Find high-quality patterns from project A
const project A_patterns = await bank.findPatterns({
  framework: 'jest',
  minSimilarity: 0.0,  // Get all patterns
  sortBy: 'quality'
});

// Get top 10 patterns
const topPatterns = projectA_patterns
  .slice(0, 10)
  .map(m => m.pattern.id);

// Share with project B
await bank.sharePattern(
  topPatterns[0],  // Pattern ID
  ['project-b', 'project-c'],  // Target projects
  {
    // Optional framework translation rules
    importMappings: {
      'jest': 'mocha',
      '@testing-library/react': 'enzyme'
    },
    assertionMappings: {
      'expect().toBe()': 'assert.equal()',
      'expect().toEqual()': 'assert.deepEqual()'
    }
  }
);

console.log(`✅ Shared ${topPatterns.length} patterns with project-b and project-c`);
```

### Example 2: Export/Import for Team Sharing

```typescript
// Export patterns from one project
const exportData = await bank.exportPatterns({
  framework: 'jest',
  minQuality: 0.8,
  projectId: 'project-a'
});

// Save to file for sharing
await fs.writeFile('team-patterns.json', exportData);

console.log('✅ Exported patterns to team-patterns.json');

// ===== On another machine/project =====

// Import patterns
const importData = await fs.readFile('team-patterns.json', 'utf-8');
const importedCount = await bank.importPatterns(importData);

console.log(`✅ Imported ${importedCount} patterns`);
```

### Example 3: Cross-Framework Translation

```typescript
// Extract Jest patterns
const jestPatterns = await bank.extractPatterns({
  testFiles: ['./tests/**/*.test.ts'],
  framework: 'jest',
  projectId: 'project-a'
});

// Translate to Mocha and share
for (const pattern of jestPatterns) {
  await bank.sharePattern(
    pattern.id,
    ['project-b'],  // Mocha-based project
    {
      importMappings: {
        'jest': 'mocha',
        '@testing-library/react': 'chai'
      },
      identifierMappings: {
        'test': 'it',
        'expect': 'assert'
      },
      assertionMappings: {
        'toBe': 'equal',
        'toEqual': 'deepEqual',
        'toThrow': 'throw'
      }
    }
  );
}

console.log(`✅ Translated ${jestPatterns.length} Jest patterns to Mocha`);
```

---

## Template Usage

### Example 1: Create and Instantiate Templates

```typescript
import { TestTemplateCreator, QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
const templateCreator = new TestTemplateCreator();

await bank.initialize();

// Find a pattern
const matches = await bank.findPatterns({
  patternType: 'edge-case',
  framework: 'jest',
  limit: 1
});

const pattern = matches[0].pattern;

// Create reusable template
const template = await templateCreator.createTemplate(pattern);

console.log(`\n📝 Template: ${template.metadata.name}`);
console.log(`   Placeholders: ${template.placeholders.length}`);

template.placeholders.forEach(ph => {
  console.log(`   - ${ph.name}: ${ph.type} (${ph.description})`);
});

// Instantiate template for new code
const testCode = await templateCreator.instantiateTemplate(
  template,
  'jest',
  {
    functionName: 'validatePayment',
    parameterName: 'payment',
    parameterType: 'Payment',
    expectedBehavior: 'throw ValidationError'
  }
);

console.log(`\n✅ Generated Test Code:\n`);
console.log(testCode);
```

**Expected Output**:
```
📝 Template: Null Parameter Validation
   Placeholders: 4
   - functionName: identifier (Name of the function to test)
   - parameterName: identifier (Name of the parameter to validate)
   - parameterType: type (Type of the parameter)
   - expectedBehavior: value (Expected behavior description)

✅ Generated Test Code:

describe('validatePayment', () => {
  it('should throw ValidationError when payment is null', () => {
    expect(() => validatePayment(null)).toThrow(ValidationError);
  });

  it('should throw ValidationError when payment is undefined', () => {
    expect(() => validatePayment(undefined)).toThrow(ValidationError);
  });
});
```

### Example 2: Multi-Framework Template Generation

```typescript
// Create template from Jest pattern
const jestPattern = matches[0].pattern;
const template = await templateCreator.createTemplate(jestPattern);

const params = {
  functionName: 'processOrder',
  parameterName: 'order',
  parameterType: 'Order'
};

// Generate Jest version
const jestCode = await templateCreator.instantiateTemplate(
  template,
  'jest',
  params
);

// Generate Mocha version
const mochaCode = await templateCreator.instantiateTemplate(
  template,
  'mocha',
  params
);

// Generate Cypress version
const cypressCode = await templateCreator.instantiateTemplate(
  template,
  'cypress',
  params
);

console.log('=== Jest ===');
console.log(jestCode);
console.log('\n=== Mocha ===');
console.log(mochaCode);
console.log('\n=== Cypress ===');
console.log(cypressCode);
```

### Example 3: Template Validation

```typescript
// Validate template parameters before instantiation
const validationResult = await templateCreator.validateTemplate(
  template,
  {
    functionName: 'processOrder',
    parameterName: 'order',
    // Missing parameterType - should fail
  }
);

if (!validationResult.valid) {
  console.log('❌ Validation Failed:');
  validationResult.errors.forEach(err => {
    console.log(`   - ${err.field}: ${err.message}`);
  });
} else {
  console.log('✅ Validation Passed');

  // Safe to instantiate
  const code = await templateCreator.instantiateTemplate(
    template,
    'jest',
    validationResult.params
  );
}
```

---

## Advanced Scenarios

### Example 1: Pattern Quality Tracking

```typescript
import { QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
await bank.initialize();

// Track pattern usage
async function trackPatternUsage(patternId: string, testResult: any) {
  await bank.updateUsage(patternId, 'my-project', {
    success: testResult.passed,
    coverageGain: testResult.coverageIncrease,
    executionTime: testResult.duration
  });
}

// Get pattern statistics
const patternId = 'abc123';
const stats = await bank.getPatternStats(patternId);

console.log(`\n📊 Pattern Statistics: ${stats.patternId}`);
console.log(`   Total Uses: ${stats.totalUses}`);
console.log(`   Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
console.log(`   Avg Coverage Gain: ${(stats.avgCoverageGain * 100).toFixed(1)}%`);
console.log(`   Project Count: ${stats.projectCount}`);
console.log(`   Last Used: ${stats.lastUsed.toISOString()}`);
console.log(`   Trend: ${stats.trend}`);
```

### Example 2: Pattern Cleanup and Maintenance

```typescript
// Cleanup old or unused patterns
const deletedCount = await bank.cleanup({
  olderThan: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),  // 90 days
  minUsage: 5,  // Minimum 5 uses
  minQuality: 0.7,  // Minimum 70% quality
  dryRun: true  // Preview before deleting
});

console.log(`Would delete ${deletedCount} patterns`);

// Confirm deletion
const actualDeleted = await bank.cleanup({
  olderThan: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  minUsage: 5,
  minQuality: 0.7,
  dryRun: false  // Actually delete
});

console.log(`✅ Deleted ${actualDeleted} unused patterns`);
```

### Example 3: Integration with Test Generator

```typescript
import { QEReasoningBank, TestGeneratorAgent } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
const testGen = new TestGeneratorAgent({
  framework: 'jest',
  targetCoverage: 95,
  usePatterns: true,  // Enable pattern-based generation
  reasoningBank: bank
});

await bank.initialize();

// Generate tests using patterns
const result = await testGen.generateTests({
  sourceFile: 'src/order-service.ts'
});

console.log(`\n✅ Generated ${result.testsGenerated} tests`);
console.log(`   Patterns Used: ${result.patternsUsed.length}`);
console.log(`   Coverage: ${(result.coverage * 100).toFixed(1)}%`);

// Show which patterns were used
result.patternsUsed.forEach((pattern, idx) => {
  console.log(`\n   ${idx + 1}. ${pattern.name}`);
  console.log(`      Similarity: ${(pattern.similarity * 100).toFixed(1)}%`);
  console.log(`      Tests: ${pattern.testsGenerated}`);
});

// Extract new patterns from generated tests
const newPatterns = await bank.extractPatterns({
  testFiles: [result.testFilePath],
  framework: 'jest',
  projectId: 'my-app',
  minQuality: 0.8
});

console.log(`\n✅ Extracted ${newPatterns.length} new patterns from generated tests`);
```

### Example 4: Pattern Discovery and Analysis

```typescript
import { PatternClassifier, QEReasoningBank } from 'agentic-qe';

const bank = new QEReasoningBank({ databasePath: './.aqe/reasoning-bank.db' });
const classifier = new PatternClassifier();

await bank.initialize();

// Classify a new pattern
const pattern = await bank.findPatterns({ limit: 1 })[0].pattern;
const classification = await classifier.classify(pattern);

console.log(`\n🔍 Pattern Classification`);
console.log(`   Type: ${classification.type}`);
console.log(`   Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
console.log(`   Category: ${classification.category}`);
console.log(`   Subcategories: ${classification.subcategories.join(', ')}`);

// Find similar patterns
const similar = await classifier.findSimilarPatterns(
  pattern.id,
  0.8,  // 80% similarity threshold
  10    // Top 10 results
);

console.log(`\n📋 Similar Patterns (${similar.length}):`);
similar.forEach((sim, idx) => {
  console.log(`   ${idx + 1}. ${sim.pattern.metadata.name}`);
  console.log(`      Similarity: ${(sim.similarity * 100).toFixed(1)}%`);
  console.log(`      Structural: ${(sim.breakdown.structural * 100).toFixed(1)}%`);
  console.log(`      Semantic: ${(sim.breakdown.semantic * 100).toFixed(1)}%`);
});

// Get pattern recommendations for source code
const recommendations = await classifier.recommendPatterns(
  'src/user-service.ts',
  5  // Top 5 recommendations
);

console.log(`\n💡 Pattern Recommendations:`);
recommendations.forEach((rec, idx) => {
  console.log(`   ${idx + 1}. ${rec.pattern.metadata.name}`);
  console.log(`      Match: ${(rec.matchScore * 100).toFixed(1)}%`);
  console.log(`      Reason: ${rec.reason}`);
  console.log(`      Benefit: ${rec.expectedBenefit}`);
});
```

---

## CLI Reference

### Pattern Extraction

```bash
# Extract patterns from tests
aqe patterns extract --path tests/ --framework jest

# Extract with quality filter
aqe patterns extract --path tests/ --min-quality 0.8

# Extract and tag
aqe patterns extract --path tests/ --tags api,critical
```

### Pattern Search

```bash
# Find patterns by type
aqe patterns find --type edge-case --framework jest

# Find patterns for source file
aqe patterns find --file src/user-service.ts --min-similarity 0.8

# List all patterns
aqe patterns list --framework jest --sort-by quality
```

### Pattern Management

```bash
# View pattern details
aqe patterns show --id abc123

# Update pattern metadata
aqe patterns update --id abc123 --tags auth,critical

# Delete pattern
aqe patterns delete --id abc123

# Cleanup old patterns
aqe patterns cleanup --older-than 90d --min-usage 5
```

### Import/Export

```bash
# Export patterns
aqe patterns export --output patterns.json --framework jest

# Import patterns
aqe patterns import --input patterns.json

# Export with filter
aqe patterns export --min-quality 0.8 --tags critical --output critical-patterns.json
```

---

## Best Practices

### 1. Pattern Quality

**DO:**
- ✅ Extract patterns from well-tested, high-coverage code
- ✅ Review patterns before sharing across projects
- ✅ Tag patterns with descriptive metadata
- ✅ Track pattern usage and effectiveness

**DON'T:**
- ❌ Extract patterns from flaky or failing tests
- ❌ Over-extract similar patterns
- ❌ Share untested patterns
- ❌ Ignore pattern quality metrics

### 2. Pattern Organization

**DO:**
- ✅ Use consistent naming conventions
- ✅ Organize by pattern type and framework
- ✅ Maintain pattern versioning
- ✅ Document pattern usage examples

**DON'T:**
- ❌ Mix patterns from different quality levels
- ❌ Duplicate similar patterns
- ❌ Skip pattern metadata
- ❌ Forget to update pattern statistics

### 3. Performance

**DO:**
- ✅ Use pattern caching for frequently accessed patterns
- ✅ Set appropriate similarity thresholds
- ✅ Limit search results to top matches
- ✅ Clean up unused patterns regularly

**DON'T:**
- ❌ Extract patterns on every test run
- ❌ Search with very low similarity thresholds
- ❌ Keep unlimited pattern history
- ❌ Skip database optimization

---

## Troubleshooting

### Issue: Pattern Extraction Returns Empty Results

**Solutions**:
```bash
# Check test file syntax
npx tsc --noEmit tests/*.test.ts

# Lower quality threshold
aqe patterns extract --min-quality 0.5

# Verify framework support
aqe patterns frameworks

# Enable verbose logging
aqe patterns extract --verbose
```

### Issue: Pattern Matching Is Slow

**Solutions**:
```typescript
// Increase cache size
const bank = new QEReasoningBank({
  databasePath: './.aqe/reasoning-bank.db',
  cacheSize: 2000  // Up from 1000
});

// Use more specific queries
const matches = await bank.findPatterns({
  framework: 'jest',  // Specify framework
  patternType: 'edge-case',  // Specify type
  limit: 10  // Limit results
});

// Pre-compute similarity index
await bank.buildSimilarityIndex();
```

---

## Next Steps

- [Learning System Examples](LEARNING-SYSTEM-EXAMPLES.md)
- [Flaky Detection ML Examples](FLAKY-DETECTION-ML-EXAMPLES.md)
- [Complete API Reference](../API-REFERENCE-V1.1.md)
- [Phase 2 User Guide](../PHASE2-USER-GUIDE.md)

---

**Reasoning Bank Examples** | [Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
