# Testability Scorer - Configuration Guide

Advanced configuration options for customizing testability assessments.

## Table of Contents

1. [Basic Configuration](#basic-configuration)
2. [Principle Weights](#principle-weights)
3. [Grading Scale](#grading-scale)
4. [Report Settings](#report-settings)
5. [User Types](#user-types)
6. [Browser Configuration](#browser-configuration)
7. [AI Recommendations](#ai-recommendations)
8. [Historical Tracking](#historical-tracking)
9. [Thresholds](#thresholds)

## Basic Configuration

### Minimal Configuration

```javascript
// tests/testability-scorer/config.js
module.exports = {
  baseURL: 'https://your-app.com',
  reports: {
    directory: 'tests/reports',
    autoOpen: true
  }
};
```

### Complete Configuration

```javascript
module.exports = {
  // Application URL
  baseURL: process.env.TEST_URL || 'https://your-app.com',

  // Principle weights
  weights: {
    observability: 15,
    controllability: 15,
    algorithmicSimplicity: 10,
    algorithmicTransparency: 10,
    explainability: 10,
    similarity: 5,
    algorithmicStability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5
  },

  // Grading scale
  grades: {
    A: 90, B: 80, C: 70, D: 60, F: 0
  },

  // Report settings
  reports: {
    format: ['html', 'json', 'text'],
    directory: 'tests/reports',
    autoOpen: true,
    includeAI: true,
    includeCharts: true,
    includeHistory: true
  },

  // User types
  userTypes: [
    { username: 'standard', password: 'pass123', role: 'user' },
    { username: 'admin', password: 'admin123', role: 'admin' }
  ],

  // Browsers
  browsers: ['chromium', 'firefox', 'webkit'],

  // Timeouts
  timeouts: {
    test: 30000,
    navigation: 10000,
    action: 5000
  },

  // Thresholds
  thresholds: {
    overall: 70,
    critical: {
      observability: 60,
      controllability: 60,
      unbugginess: 70
    }
  },

  // AI settings
  ai: {
    enabled: true,
    provider: 'local',
    prioritize: 'impact',
    maxRecommendations: 10
  },

  // Historical tracking
  history: {
    enabled: true,
    directory: '.testability-history',
    retention: 90
  }
};
```

## Principle Weights

Customize the importance of each principle in the overall score.

### Default Weights

```javascript
weights: {
  observability: 15,        // 15% of overall score
  controllability: 15,       // 15% of overall score
  algorithmicSimplicity: 10, // 10% of overall score
  algorithmicTransparency: 10,
  explainability: 10,
  similarity: 5,
  algorithmicStability: 10,
  unbugginess: 10,
  smallness: 10,
  decomposability: 5
}
// Total must equal 100
```

### Custom Weights for API Testing

For API-heavy applications, emphasize controllability and observability:

```javascript
weights: {
  observability: 20,        // Increased: APIs need monitoring
  controllability: 20,       // Increased: Direct API access crucial
  algorithmicSimplicity: 15, // Increased: Clear endpoints
  algorithmicTransparency: 10,
  explainability: 10,        // API documentation
  similarity: 5,             // REST/GraphQL patterns
  algorithmicStability: 10,  // API versioning
  unbugginess: 5,            // Decreased
  smallness: 3,              // Decreased
  decomposability: 2         // Decreased
}
```

### Custom Weights for UI Testing

For UI-heavy applications, emphasize decomposability and smallness:

```javascript
weights: {
  observability: 10,
  controllability: 10,
  algorithmicSimplicity: 5,
  algorithmicTransparency: 5,
  explainability: 10,
  similarity: 10,            // Increased: UI patterns
  algorithmicStability: 10,
  unbugginess: 10,
  smallness: 15,             // Increased: Component size
  decomposability: 15        // Increased: Component isolation
}
```

## Grading Scale

### Default Scale

```javascript
grades: {
  A: 90,  // Excellent
  B: 80,  // Good
  C: 70,  // Acceptable
  D: 60,  // Below average
  F: 0    // Poor
}
```

### Strict Scale

```javascript
grades: {
  A: 95,  // Excellent
  B: 85,  // Good
  C: 75,  // Acceptable
  D: 65,  // Below average
  F: 0    // Poor
}
```

### Lenient Scale

```javascript
grades: {
  A: 85,  // Excellent
  B: 70,  // Good
  C: 60,  // Acceptable
  D: 50,  // Below average
  F: 0    // Poor
}
```

## Report Settings

### Output Formats

```javascript
reports: {
  format: ['html', 'json', 'text'],  // Multiple formats
  directory: 'tests/reports',         // Output directory
  autoOpen: true                      // Open HTML automatically
}
```

### HTML Only

```javascript
reports: {
  format: ['html'],
  directory: 'reports',
  autoOpen: true,
  includeCharts: true,
  includeAI: true,
  includeHistory: true
}
```

### JSON for CI/CD

```javascript
reports: {
  format: ['json'],
  directory: 'build/testability',
  autoOpen: false,
  includeAI: false,
  includeHistory: false
}
```

### Custom Report Template

```javascript
reports: {
  format: ['html'],
  template: './custom-template.html',  // Custom HTML template
  css: './custom-styles.css',          // Custom CSS
  logo: './company-logo.png'           // Company logo
}
```

## User Types

Test testability across different user roles.

### Basic User Types

```javascript
userTypes: [
  {
    username: 'standard_user',
    password: 'password123',
    role: 'standard'
  },
  {
    username: 'admin_user',
    password: 'admin123',
    role: 'admin'
  }
]
```

### Advanced User Types

```javascript
userTypes: [
  {
    username: 'free_user',
    password: 'free123',
    role: 'free',
    capabilities: ['read'],
    testScenarios: ['basic-navigation', 'limited-features']
  },
  {
    username: 'pro_user',
    password: 'pro123',
    role: 'pro',
    capabilities: ['read', 'write', 'export'],
    testScenarios: ['advanced-features', 'api-access']
  },
  {
    username: 'enterprise_user',
    password: 'ent123',
    role: 'enterprise',
    capabilities: ['read', 'write', 'export', 'admin'],
    testScenarios: ['all-features', 'admin-panel']
  }
]
```

## Browser Configuration

### All Browsers

```javascript
browsers: ['chromium', 'firefox', 'webkit']
```

### Single Browser

```javascript
browsers: ['chromium']
```

### Browser-Specific Settings

```javascript
browserSettings: {
  chromium: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  },
  firefox: {
    headless: true,
    viewport: { width: 1920, height: 1080 }
  },
  webkit: {
    headless: true,
    viewport: { width: 1920, height: 1080 }
  }
}
```

## AI Recommendations

### Enable AI

```javascript
ai: {
  enabled: true,
  provider: 'local',         // 'local' or 'api'
  prioritize: 'impact',      // 'impact', 'effort', or 'score'
  maxRecommendations: 10,
  includeExamples: true,
  includeEffortEstimates: true
}
```

### Disable AI

```javascript
ai: {
  enabled: false
}
```

### API-Based AI

```javascript
ai: {
  enabled: true,
  provider: 'api',
  apiUrl: 'https://ai-service.com/analyze',
  apiKey: process.env.AI_API_KEY,
  model: 'gpt-4',
  temperature: 0.7
}
```

## Historical Tracking

### Enable Tracking

```javascript
history: {
  enabled: true,
  directory: '.testability-history',
  retention: 90,  // days
  compareWithBaseline: true,
  baselineFile: '.testability-history/baseline.json'
}
```

### Disable Tracking

```javascript
history: {
  enabled: false
}
```

### Git-Based Tracking

```javascript
history: {
  enabled: true,
  storage: 'git',
  branch: 'testability-reports',
  commitMessage: 'chore: update testability assessment'
}
```

## Thresholds

### Pass/Fail Criteria

```javascript
thresholds: {
  overall: 70,  // Minimum overall score
  critical: {
    observability: 60,
    controllability: 60,
    unbugginess: 70
  },
  warning: {
    algorithmicSimplicity: 65,
    explainability: 65
  }
}
```

### Strict Thresholds

```javascript
thresholds: {
  overall: 85,
  critical: {
    observability: 80,
    controllability: 80,
    algorithmicSimplicity: 75,
    unbugginess: 85
  }
}
```

### CI/CD Thresholds

```javascript
thresholds: {
  overall: 70,
  blockDeployment: {
    observability: 50,
    controllability: 50,
    unbugginess: 60
  },
  failBuild: {
    overall: 50
  }
}
```

## Environment-Specific Configuration

### Development

```javascript
// config.dev.js
module.exports = {
  baseURL: 'http://localhost:3000',
  reports: {
    autoOpen: true,
    includeAI: true
  },
  thresholds: {
    overall: 60  // Lenient
  }
};
```

### Staging

```javascript
// config.staging.js
module.exports = {
  baseURL: 'https://staging.your-app.com',
  reports: {
    autoOpen: false,
    includeAI: true
  },
  thresholds: {
    overall: 70
  }
};
```

### Production

```javascript
// config.prod.js
module.exports = {
  baseURL: 'https://your-app.com',
  reports: {
    autoOpen: false,
    format: ['json'],
    includeAI: false
  },
  thresholds: {
    overall: 80  // Strict
  }
};
```

## Loading Configuration

### Environment-Based

```javascript
// config.js
const env = process.env.NODE_ENV || 'development';
const config = require(`./config.${env}.js`);

module.exports = config;
```

### Command-Line Override

```bash
TEST_URL=https://example.com npx playwright test
```

```javascript
// config.js
module.exports = {
  baseURL: process.env.TEST_URL || 'http://localhost:3000',
  // ... rest of config
};
```

## Validation

Validate your configuration:

```bash
node scripts/validate-config.js
```

```javascript
// scripts/validate-config.js
const config = require('../tests/testability-scorer/config');

// Check weights sum to 100
const weightSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
if (weightSum !== 100) {
  console.error(`Weights must sum to 100 (current: ${weightSum})`);
  process.exit(1);
}

// Check required fields
const required = ['baseURL', 'weights', 'reports'];
for (const field of required) {
  if (!config[field]) {
    console.error(`Missing required field: ${field}`);
    process.exit(1);
  }
}

console.log('✓ Configuration valid');
```

## Best Practices

1. **Start with defaults** - Use default weights, adjust based on your needs
2. **Version control** - Commit configuration to git
3. **Environment-specific** - Use different configs for dev/staging/prod
4. **Validate** - Check configuration before running assessments
5. **Document changes** - Explain why you adjusted weights
6. **Track history** - Enable historical tracking to measure improvement
7. **Set thresholds** - Define clear pass/fail criteria for CI/CD

## Related Documentation

- [Basic Usage](../resources/examples/basic-usage.md)
- [CI/CD Integration](CI-INTEGRATION.md)
- [API Reference](API_REFERENCE.md)
