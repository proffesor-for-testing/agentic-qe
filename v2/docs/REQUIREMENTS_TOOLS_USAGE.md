# Requirements Validation Tools - Usage Guide

## Overview

Two production-quality tools for requirements validation and BDD scenario generation have been implemented:

1. **validateRequirements()** - INVEST & SMART criteria validation
2. **generateBddScenarios()** - Gherkin/Cucumber scenario generation

## Tool 1: validateRequirements()

### Purpose
Validates requirements against INVEST and SMART criteria with detailed scoring, issue detection, and actionable recommendations.

### Function Signature
```typescript
async function validateRequirements(
  params: ValidateRequirementsParams
): Promise<QEToolResponse<BatchValidationResult>>
```

### Parameters
```typescript
interface ValidateRequirementsParams {
  requirements: RequirementInput[]
  includeRecommendations?: boolean
  strictMode?: boolean
}

interface RequirementInput {
  id: string
  title: string
  description: string
  acceptanceCriteria?: string[]
  priority?: 'low' | 'medium' | 'high' | 'critical'
  type?: 'functional' | 'non-functional' | 'technical' | 'business'
  dependencies?: string[]
}
```

### Example 1: Basic Requirements Validation
```typescript
const response = await validateRequirements({
  requirements: [
    {
      id: 'US-001',
      title: 'User Authentication',
      description: 'As a user, I want to authenticate with email and password so that I can access my account securely. The system must support 2FA and rate limiting to prevent brute force attacks.',
      acceptanceCriteria: [
        'User can login with valid credentials within 2 seconds',
        'System returns 401 error for invalid credentials',
        'Login attempts are rate limited to 5 per minute',
        '2FA codes expire after 5 minutes',
        'Password encryption uses bcrypt with 12 rounds'
      ],
      priority: 'critical',
      type: 'functional',
      dependencies: ['Password Service', '2FA Provider']
    }
  ],
  strictMode: false,
  includeRecommendations: true
});

if (response.success) {
  console.log('Overall Score:', response.data.results[0].overallScore);
  console.log('Passed:', response.data.results[0].passed);
  console.log('Risk Level:', response.data.results[0].riskLevel);
  console.log('Issues:', response.data.results[0].keyIssues);
  console.log('Recommendations:', response.data.results[0].recommendations);
}
```

### What validateRequirements Checks

#### INVEST Criteria (6 checks)
1. **Independent** - Requirement doesn't have excessive dependencies
2. **Negotiable** - Details are negotiable, outcomes are fixed
3. **Valuable** - Clear business or user value articulated
4. **Estimable** - Specific enough to be estimated
5. **Small** - Fits within one iteration (no scope creep)
6. **Testable** - Has clear acceptance criteria

#### SMART Framework (5 checks)
1. **Specific** - Concrete details, no vague language
2. **Measurable** - Includes quantifiable metrics
3. **Achievable** - Technically feasible
4. **Relevant** - Aligned with business goals
5. **Time-bound** - Performance expectations defined

#### Language Quality
- Detects vague terms (fast, slow, good, bad)
- Identifies ambiguous modals (should, could, might)
- Flags subjective language (user-friendly, intuitive)
- Checks for passive voice constructions

### Output Structure
```typescript
interface RequirementValidationResult {
  requirementId: string
  overallScore: number        // 0-10
  passed: boolean
  investCriteria: InvestCriterionEvaluation[]
  smartAnalysis: SmartAnalysis
  acceptanceCriteria: AcceptanceCriteriaAnalysis
  languageClarity: LanguageClarity
  testabilityScore: number    // 0-10
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  keyIssues: string[]
  recommendations: string[]
  metadata: ValidationMetadata
}
```

### Example 2: Batch Validation with Analysis
```typescript
const allRequirements: RequirementInput[] = [
  // ... multiple requirements
];

const response = await validateRequirements({
  requirements: allRequirements
});

if (response.success) {
  const batch = response.data;

  // Overall metrics
  console.log(`Pass Rate: ${batch.summary.passRate}%`);
  console.log(`Avg INVEST Score: ${batch.summary.avgInvestScore}/2.0`);
  console.log(`Avg SMART Score: ${batch.summary.avgSmartScore}/10`);
  console.log(`Avg Testability: ${batch.summary.avgTestabilityScore}/10`);

  // Common issues across all requirements
  console.log('\nMost Common Issues:');
  batch.summary.commonIssues.forEach(issue => {
    console.log(`  - ${issue}`);
  });

  // Actionable improvements
  console.log('\nTop Recommendations:');
  batch.summary.topRecommendations.forEach(rec => {
    console.log(`  - ${rec}`);
  });
}
```

---

## Tool 2: generateBddScenarios()

### Purpose
Generates comprehensive Gherkin-formatted Cucumber scenarios from requirements, including happy path, negative cases, edge cases, and data-driven scenario outlines.

### Function Signature
```typescript
async function generateBddScenarios(
  params: GenerateBddScenariosParams
): Promise<QEToolResponse<BatchBddGenerationResult>>
```

### Parameters
```typescript
interface GenerateBddScenariosParams {
  requirements: RequirementForBdd[]
  includeEdgeCases?: boolean
  includeNegativeCases?: boolean
  dataVariations?: boolean
  language?: 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'zh'
}

interface RequirementForBdd {
  id: string
  title: string
  description: string
  acceptanceCriteria?: string[]
  priority?: 'low' | 'medium' | 'high' | 'critical'
  type?: 'functional' | 'non-functional' | 'technical' | 'business'
}
```

### Example 1: Generate BDD Scenarios
```typescript
const response = await generateBddScenarios({
  requirements: [
    {
      id: 'US-002',
      title: 'Create User Account',
      description: 'User can create a new account with email and password. The system validates input, checks for duplicates, and sends confirmation email.',
      acceptanceCriteria: [
        'Email must be valid format (RFC 5322)',
        'Password must be at least 12 characters',
        'Account creation succeeds with valid inputs',
        'Duplicate email returns error message',
        'Confirmation email is sent within 5 seconds'
      ],
      priority: 'high',
      type: 'functional'
    }
  ],
  includeEdgeCases: true,
  includeNegativeCases: true,
  dataVariations: true,
  language: 'en'
});

if (response.success) {
  response.data.features.forEach(feature => {
    console.log(feature.gherkinContent); // Print complete .feature file
  });
}
```

### Generated Scenario Types

#### 1. Happy Path Scenario
```gherkin
Scenario: Successfully create Create User Account
  Given a user with valid credentials
  And the system is in a valid state
  When the user initiates create operation
  And the request is submitted with valid data
  Then the operation completes successfully
  And a success response is returned
  And the data is persisted correctly
```

#### 2. Negative Scenarios
- **Invalid Input** - Handles validation failures
- **Unauthorized Access** - Denies access without permissions
- **Service Unavailability** - Handles external service failures
- **Resource Not Found** - 404 handling

#### 3. Edge Case Scenarios
- **Boundary Values** - Min/max testing
- **Empty/Null Input** - Null safety
- **Concurrent Operations** - Race condition handling
- **Large Dataset** - Performance/volume testing
- **Special Characters** - Injection attack prevention

#### 4. Scenario Outlines (Data-Driven)
```gherkin
Scenario Outline: Validation with various inputs
  Given a request with <input> data
  When the validation is performed
  Then the system returns <expectedResult>
  And the error message is <errorMessage>

  Examples: Various input types
    | input           | expectedResult | errorMessage                    |
    | valid data      | success        | none                            |
    | empty string    | error          | Input cannot be empty           |
    | null value      | error          | Input is required               |
    | invalid format  | error          | Invalid format                  |
    | maximum length  | success        | none                            |
```

### Output Structure
```typescript
interface BatchBddGenerationResult {
  requirementsProcessed: number
  featuresGenerated: number
  totalScenarios: number
  totalTestCases: number    // Including scenario outline combinations
  features: GeneratedFeature[]
  summary: {
    avgScenariosPerRequirement: number
    avgTestCasesPerRequirement: number
    commonScenarioPatterns: string[]
    edgeCasesCovered: number
    dataVariationCoverage: number
  }
}

interface GeneratedFeature {
  featureName: string
  narrative: FeatureNarrative  // "As a user, I want..., So that..."
  background?: GherkinBackground
  scenarios: GherkinScenario[]
  gherkinContent: string       // Complete Gherkin file content
}
```

### Example 2: Using Generated Scenarios
```typescript
const response = await generateBddScenarios({
  requirements: [
    {
      id: 'US-003',
      title: 'Update User Profile',
      description: 'User can update their profile information including name, email, and avatar. Changes are validated and persisted.',
      acceptanceCriteria: [
        'Name field accepts 2-100 characters',
        'Email must be unique',
        'Avatar upload supports JPEG/PNG up to 5MB',
        'Changes save within 1 second',
        'User receives confirmation of update'
      ],
      priority: 'medium',
      type: 'functional'
    }
  ],
  includeEdgeCases: true,
  includeNegativeCases: true,
  dataVariations: true
});

if (response.success) {
  const feature = response.data.features[0];

  console.log(`Feature: ${feature.featureName}`);
  console.log(`Generated ${feature.scenarios.length} scenarios`);
  console.log(`Projecting ${feature.metadata.totalTestCases} test cases`);

  // Save the complete Gherkin file
  const fs = require('fs');
  fs.writeFileSync(
    `features/${feature.featureName.replace(/ /g, '_').toLowerCase()}.feature`,
    feature.gherkinContent
  );
}
```

---

## Integration Examples

### Example 1: Validate Then Generate
```typescript
// Step 1: Validate requirements
const validationResponse = await validateRequirements({
  requirements: requirements,
  strictMode: false
});

if (validationResponse.success) {
  // Step 2: Generate scenarios only for validated requirements
  const validRequirements = validationResponse.data.results
    .filter(r => r.passed)
    .map(r => ({
      id: r.requirementId,
      title: r.smartAnalysis.specific.details,
      description: r.acceptanceCriteria.enhancedCriteria.join(' '),
      acceptanceCriteria: r.acceptanceCriteria.enhancedCriteria
    }));

  if (validRequirements.length > 0) {
    const bddResponse = await generateBddScenarios({
      requirements: validRequirements,
      includeEdgeCases: true,
      includeNegativeCases: true,
      dataVariations: true
    });

    if (bddResponse.success) {
      // All generated feature files are ready for Cucumber execution
      console.log(`Generated ${bddResponse.data.totalTestCases} test cases`);
    }
  }
}
```

### Example 2: Quality Report Generation
```typescript
const response = await validateRequirements({
  requirements: requirements,
  includeRecommendations: true
});

if (response.success) {
  const data = response.data;

  // Create summary report
  const report = {
    timestamp: new Date().toISOString(),
    total: data.requirementsValidated,
    passed: data.passCount,
    failed: data.failCount,
    passRate: `${data.summary.passRate}%`,
    metrics: {
      investAverage: data.summary.avgInvestScore,
      smartAverage: data.summary.avgSmartScore,
      testabilityAverage: data.summary.avgTestabilityScore
    },
    issues: data.summary.commonIssues,
    recommendations: data.summary.topRecommendations,
    details: data.results.map(r => ({
      id: r.requirementId,
      score: r.overallScore,
      passed: r.passed,
      riskLevel: r.riskLevel
    }))
  };

  // Save as JSON report
  fs.writeFileSync('requirements-validation-report.json', JSON.stringify(report, null, 2));
}
```

---

## Performance Characteristics

### validateRequirements()
- **Time Complexity**: O(n) where n = number of requirements
- **Space Complexity**: O(n)
- **Parallel Processing**: Uses Promise.all() for concurrent validation
- **Typical Performance**: ~100-200ms per requirement

### generateBddScenarios()
- **Time Complexity**: O(n·m) where n = requirements, m = scenarios per requirement
- **Space Complexity**: O(n·s) where s = scenario steps
- **Typical Performance**: ~50-100ms per feature

---

## Error Handling

Both tools return standardized error responses:

```typescript
interface QEToolResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    stack?: string
  }
  metadata: {
    requestId: string
    timestamp: string
    executionTime: number
    agent: string
    version: string
  }
}
```

Example error handling:
```typescript
const response = await validateRequirements({ requirements: [] });

if (!response.success) {
  console.error(`Error [${response.error?.code}]: ${response.error?.message}`);
  // Handle error appropriately
} else {
  // Process results
}
```

---

## Best Practices

1. **Validate Before Generation** - Always validate requirements before generating scenarios
2. **Use Strict Mode for Critical** - Enable `strictMode: true` for critical/high-priority requirements
3. **Include Edge Cases** - Always include edge cases for thorough test coverage
4. **Review Recommendations** - Implement top recommendations before development
5. **Batch Processing** - Validate multiple requirements in single call for efficiency
6. **Store Results** - Save validation and BDD generation results for traceability

---

## Files Location

- **validate-requirements.ts**: `/workspaces/agentic-qe-cf/src/mcp/tools/qe/requirements/validate-requirements.ts`
- **generate-bdd-scenarios.ts**: `/workspaces/agentic-qe-cf/src/mcp/tools/qe/requirements/generate-bdd-scenarios.ts`
- **Index exports**: `/workspaces/agentic-qe-cf/src/mcp/tools/qe/requirements/index.ts`

---

**Version**: 1.0.0
**Author**: Agentic QE Team - Phase 3
**Date**: 2025-11-09
