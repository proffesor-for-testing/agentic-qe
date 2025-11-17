# Code Quality Tools - Usage Examples

## Quick Start

### Import the Tools

```typescript
import {
  analyzeComplexity,
  calculateQualityMetrics,
  type ComplexityAnalysisResult,
  type QualityMetricsResult
} from './src/mcp/tools/qe/code-quality/index.js';
```

## Example 1: Basic Complexity Analysis

### Simple Analysis with Defaults

```typescript
const result = await analyzeComplexity({
  sourceCode: `
    function processUserData(users) {
      for (const user of users) {
        if (user.active) {
          if (user.premium) {
            sendEmailToPremium(user);
          } else {
            sendEmailToRegular(user);
          }
        }
      }
    }
  `,
  filePath: 'src/services/email.ts',
  language: 'typescript'
});

console.log(result);
// Output:
// {
//   filePath: 'src/services/email.ts',
//   overallMetrics: {
//     cyclomatic: 4,
//     cognitive: 6,
//     linesOfCode: 12,
//     functionCount: 1,
//     averageComplexityPerFunction: 4,
//     maxComplexity: 4
//   },
//   hotspots: [],
//   qualityScore: 95,
//   summary: {
//     totalFunctions: 1,
//     hotspotsDetected: 0,
//     criticalHotspots: 0,
//     averageComplexity: 4,
//     maxComplexity: 4
//   },
//   recommendations: [],
//   metadata: {
//     timestamp: '2025-11-09T17:30:00.000Z',
//     analysisTimeMs: 12,
//     language: 'typescript',
//     linesAnalyzed: 9
//   }
// }
```

### Complex Code with Hotspots

```typescript
const complexResult = await analyzeComplexity({
  sourceCode: `
    function handlePayment(user, order, payment) {
      if (!user) return { error: 'No user' };

      if (user.isBlocked) {
        if (payment.method === 'card') {
          if (payment.card.issuer === 'amex') {
            return { error: 'AMEX blocked' };
          } else if (payment.card.issuer === 'visa') {
            // process
          } else if (payment.card.issuer === 'mastercard') {
            // process
          } else {
            return { error: 'Unknown issuer' };
          }
        } else if (payment.method === 'bank') {
          // complex logic
        } else if (payment.method === 'crypto') {
          // even more complex
        }
      }

      if (order.total > 10000 && user.tier < 3) {
        return { error: 'Limit exceeded' };
      }

      // More nested conditions...
    }
  `,
  filePath: 'src/services/payments/handler.ts',
  language: 'typescript',
  cyclomaticThreshold: 10,
  cognitiveThreshold: 15,
  includeRecommendations: true
});

console.log(complexResult);
// Output:
// {
//   filePath: 'src/services/payments/handler.ts',
//   overallMetrics: {
//     cyclomatic: 12,
//     cognitive: 18,
//     linesOfCode: 35,
//     functionCount: 1,
//     averageComplexityPerFunction: 12,
//     maxComplexity: 12
//   },
//   hotspots: [
//     {
//       name: 'Overall',
//       startLine: 1,
//       type: 'cyclomatic',
//       severity: 'high',
//       current: 12,
//       threshold: 10,
//       excessPercentage: 20,
//       recommendation: 'Break down complex logic into smaller, focused functions'
//     },
//     {
//       name: 'Overall',
//       startLine: 1,
//       type: 'cognitive',
//       severity: 'medium',
//       current: 18,
//       threshold: 15,
//       excessPercentage: 20,
//       recommendation: 'Reduce nesting levels and simplify control flow'
//     }
//   ],
//   qualityScore: 75,
//   summary: {
//     totalFunctions: 1,
//     hotspotsDetected: 2,
//     criticalHotspots: 0,
//     averageComplexity: 12,
//     maxComplexity: 12
//   },
//   recommendations: [
//     'Apply Extract Method refactoring to 0 function(s) with critical cyclomatic complexity',
//     'Use Strategy or State pattern to reduce complex conditional logic',
//     'Use early returns (guard clauses) to reduce nesting levels',
//     'Extract nested loops and conditionals into separate methods',
//     'Target: Keep average function complexity under 10 for maintainability'
//   ],
//   metadata: { ... }
// }
```

## Example 2: Quality Metrics Calculation

### Standard Analysis

```typescript
const qualityResult = await calculateQualityMetrics({
  sourceCode: `
    import axios from 'axios';

    /**
     * Fetch user data from API
     * @param userId User identifier
     * @returns User object
     */
    export async function getUser(userId) {
      try {
        const response = await axios.get(\`/api/users/\${userId}\`);

        if (!response.data) {
          throw new Error('No user data');
        }

        return response.data;
      } catch (error) {
        console.error('Failed to fetch user:', error);
        throw error;
      }
    }
  `,
  filePath: 'src/api/users.ts',
  language: 'typescript',
  coveragePercentage: 85,
  codeSmells: 1
});

console.log(qualityResult);
// Output:
// {
//   filePath: 'src/api/users.ts',
//   maintainability: {
//     index: 82,
//     readability: 78,
//     modularity: 90,
//     documentationCoverage: 85,
//     consistency: 80
//   },
//   reliability: {
//     index: 88,
//     testCoverage: 90,
//     errorHandling: 100,
//     codeSmellDensity: 91,
//     complexityImpact: 95
//   },
//   security: {
//     index: 75,
//     vulnerabilityRisk: 85,
//     inputValidation: 50,
//     dependencySafety: 80,
//     sensitiveDataHandling: 75
//   },
//   overallScore: 82,
//   rating: 'B',
//   technicalDebt: {
//     hoursOfDebt: 4,
//     breakdown: [
//       { category: 'Maintainability Issues', hours: 1, percentage: 25 },
//       { category: 'Reliability Issues', hours: 1, percentage: 25 },
//       { category: 'Security Vulnerabilities', hours: 1, percentage: 25 },
//       { category: 'Code Smells', hours: 1, percentage: 25 }
//     ],
//     trend: 'stable',
//     payoffHours: 1,
//     topPriorities: [
//       'Reduce cyclomatic complexity in high-debt functions',
//       'Improve test coverage for critical paths',
//       'Address security vulnerabilities',
//       'Refactor code with multiple smells'
//     ]
//   },
//   interpretation: 'Good code quality. Some improvements recommended. Suitable for production with minor refinements.',
//   priorities: [
//     {
//       category: 'Security',
//       issue: 'Improve input validation and sanitization',
//       impact: 'high',
//       effort: 'medium'
//     }
//   ],
//   metadata: {
//     timestamp: '2025-11-09T17:35:00.000Z',
//     analysisTimeMs: 18,
//     language: 'typescript',
//     linesAnalyzed: 20
//   }
// }
```

### High-Risk Code Analysis

```typescript
const riskResult = await calculateQualityMetrics({
  sourceCode: `
    function processPayment(amount, cardData) {
      const sql = "SELECT * FROM users WHERE card = '" + cardData + "'";
      const result = eval(sql); // DANGEROUS!

      if (amount > 0 && amount < 1000000) {
        localStorage.setItem('apiKey', '12345-67890-secret');
        window.location = 'https://payment.example.com?amount=' + amount;
      }
    }
  `,
  filePath: 'src/payment/risky.ts',
  language: 'javascript',
  coveragePercentage: 20,
  codeSmells: 15
});

console.log(riskResult.rating); // Output: 'F'
console.log(riskResult.overallScore); // Output: ~35

// priorities will highlight:
// - Security: eval() usage, hardcoded secrets
// - Reliability: Low test coverage
// - Maintainability: Poor code quality
```

## Example 3: Integration with Quality Gates

### Using Results for Gate Decisions

```typescript
async function runQualityGate(sourceCode, filePath, language) {
  const complexity = await analyzeComplexity({
    sourceCode,
    filePath,
    language,
    includeRecommendations: true
  });

  const quality = await calculateQualityMetrics({
    sourceCode,
    filePath,
    language,
    coveragePercentage: 75,
    codeSmells: 5
  });

  // Quality gate decision logic
  const gateDecision = {
    passed: true,
    issues: [],
    warnings: [],
    recommendations: []
  };

  // Check complexity
  if (complexity.qualityScore < 70) {
    gateDecision.passed = false;
    gateDecision.issues.push(
      `Complexity quality score ${complexity.qualityScore} below threshold 70`
    );
  }

  if (complexity.hotspots.length > 0) {
    gateDecision.warnings.push(
      `${complexity.hotspots.length} complexity hotspot(s) detected`
    );
  }

  // Check overall quality
  if (quality.rating === 'F' || quality.rating === 'D') {
    gateDecision.passed = false;
    gateDecision.issues.push(
      `Overall quality rating ${quality.rating} - ${quality.interpretation}`
    );
  }

  if (quality.rating === 'C') {
    gateDecision.warnings.push(
      `Marginal quality rating ${quality.rating} - consider improvements`
    );
  }

  // Add recommendations
  gateDecision.recommendations = [
    ...complexity.recommendations || [],
    ...quality.priorities?.map(p => p.issue) || []
  ];

  return gateDecision;
}

// Usage in PR check
const result = await runQualityGate(codeString, 'src/index.ts', 'typescript');

if (!result.passed) {
  console.error('Quality gate FAILED');
  result.issues.forEach(issue => console.error('- ' + issue));
  process.exit(1);
} else {
  console.log('Quality gate PASSED');
  if (result.warnings.length > 0) {
    console.warn('Warnings:');
    result.warnings.forEach(w => console.warn('- ' + w));
  }
}
```

## Example 4: Per-Function Analysis

### Identifying Problem Functions

```typescript
const codeWithMultipleFunctions = `
  // Simple helper
  function formatDate(date) {
    return new Date(date).toISOString();
  }

  // Complex function
  function processOrders(orders, user, config) {
    if (!orders) return [];

    const results = [];
    for (const order of orders) {
      if (order.status === 'pending') {
        if (user.isPremium) {
          if (config.enablePremium) {
            if (order.amount > 1000) {
              if (user.balance >= order.amount) {
                // Process
                results.push(order);
              }
            }
          }
        }
      }
    }
    return results;
  }
`;

const analysis = await analyzeComplexity({
  sourceCode: codeWithMultipleFunctions,
  filePath: 'src/orders.ts',
  language: 'typescript',
  includePerFunction: true
});

console.log('Functions found:', analysis.summary.totalFunctions);
analysis.functionMetrics?.forEach(func => {
  console.log(`
    Function: ${func.name}
    - Cyclomatic: ${func.cyclomatic}
    - Cognitive: ${func.cognitive}
    - LOC: ${func.linesOfCode}
    - Nesting depth: ${func.nestingDepth}
    - Hotspot: ${func.isHotspot}
  `);
});

// Output:
// Function: formatDate
// - Cyclomatic: 1
// - Cognitive: 1
// - LOC: 2
// - Nesting depth: 0
// - Hotspot: false
//
// Function: processOrders
// - Cyclomatic: 10
// - Cognitive: 12
// - LOC: 20
// - Nesting depth: 5
// - Hotspot: true
```

## Example 5: Technical Debt Tracking

### Monitoring Debt Over Time

```typescript
const debts = [];

// Weekly analysis
for (let week = 0; week < 4; week++) {
  const result = await calculateQualityMetrics({
    sourceCode: getCodeForWeek(week),
    filePath: 'src/core.ts',
    language: 'typescript',
    includeTechnicalDebt: true
  });

  debts.push({
    week,
    score: result.overallScore,
    debt: result.technicalDebt?.hoursOfDebt || 0,
    rating: result.rating
  });
}

// Analyze trend
console.log('Technical Debt Trend:');
debts.forEach(d => {
  console.log(
    `Week ${d.week}: Score ${d.score}, Debt ${d.debt}h, Rating ${d.rating}`
  );
});

// Track improvement
const debtReduction = debts[0].debt - debts[3].debt;
console.log(
  `Total debt reduction: ${debtReduction}h (${((debtReduction/debts[0].debt)*100).toFixed(1)}%)`
);
```

## Scoring Reference

### Complexity Quality Score Breakdown

| Score | Level | Interpretation |
|-------|-------|-----------------|
| 90-100 | Excellent | Well-structured, easy to maintain |
| 80-89 | Good | Minor refactoring recommended |
| 70-79 | Fair | Consider refactoring |
| 60-69 | Poor | Significant refactoring needed |
| < 60 | Critical | Immediate refactoring required |

### Overall Quality Rating Breakdown

| Rating | Score | Status | Action |
|--------|-------|--------|--------|
| A | 90-100 | Production ready | Deploy with confidence |
| B | 80-89 | Good quality | Minor improvements optional |
| C | 70-79 | Acceptable | Schedule improvements |
| D | 60-69 | Poor | Prioritize refactoring |
| F | < 60 | Critical | Fix before deployment |

### Technical Debt Impact

| Debt Hours | Impact Level |
|------------|--------------|
| 0-5 | Low - Can handle with standard maintenance |
| 5-20 | Moderate - Schedule sprint for improvements |
| 20-50 | High - Immediate action needed |
| > 50 | Critical - Risk of system failure |

---

For more details, see `CODE-QUALITY-TOOLS-IMPLEMENTATION.md`
