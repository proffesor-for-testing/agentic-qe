# Local Testing Guide for QE Engineers

This guide provides practical examples you can run on your local machine to test the Agentic QE Framework with your own projects.

## 🚀 Getting Started

### Prerequisites
- Node.js 14+ installed
- A local project to test (web app, API, etc.)
- Basic JavaScript knowledge

### Installation

```bash
# Create a test directory
mkdir qe-testing
cd qe-testing

# Initialize npm project
npm init -y

# Install Agentic QE
npm install agentic-qe

# Create your test file
touch test-my-project.js
```

## 🧪 Practical Testing Examples

### Example 1: Analyze Your Project's Test Coverage Gaps

Create a file `analyze-coverage.js`:

```javascript
const { AgenticQE } = require('agentic-qe');
const fs = require('fs');

async function analyzeCoverageGaps() {
  const aqe = new AgenticQE();

  // Read your actual test file
  const testCode = fs.readFileSync('./your-tests/login.test.js', 'utf8');

  // Read your actual source code
  const sourceCode = fs.readFileSync('./src/login.js', 'utf8');

  // Get test suggestions
  const suggestions = await aqe.suggestTests(sourceCode);

  console.log('📊 Test Coverage Analysis\n');
  console.log('Missing Test Scenarios:');
  suggestions.missingTests.forEach((test, i) => {
    console.log(`  ${i + 1}. ${test}`);
  });

  console.log('\nNext Priority Test:');
  console.log(`  • ${suggestions.nextTest.description}`);
  console.log(`    Type: ${suggestions.nextTest.type}`);

  console.log('\nCode Improvements:');
  suggestions.refactoring.forEach(improvement => {
    console.log(`  • ${improvement}`);
  });
}

analyzeCoverageGaps();
```

Run it:
```bash
node analyze-coverage.js
```

### Example 2: Risk Assessment for Current Sprint

Create a file `sprint-risk.js`:

```javascript
const { AgenticQE } = require('agentic-qe');
const { execSync } = require('child_process');

async function assessSprintRisk() {
  const aqe = new AgenticQE();

  // Get git statistics for current branch
  const gitDiff = execSync('git diff --stat').toString();
  const linesChanged = parseInt(gitDiff.match(/(\d+) insertions/)?.[1] || 0) +
                       parseInt(gitDiff.match(/(\d+) deletions/)?.[1] || 0);

  // Analyze the changes
  const riskAnalysis = await aqe.assessRisk({
    linesChanged: linesChanged,
    complexity: 10, // Adjust based on your code
    critical: true,  // Is this critical functionality?
    previousBugs: 2  // Bugs found in this area before
  });

  console.log('🔍 Sprint Risk Assessment\n');
  console.log(`Lines Changed: ${linesChanged}`);
  console.log(`Risk Level: ${getRiskLevel(riskAnalysis.overallRisk)}`);
  console.log(`Risk Score: ${(riskAnalysis.overallRisk * 100).toFixed(0)}%\n`);

  console.log('Testing Priorities:');
  riskAnalysis.priorities.forEach((priority, i) => {
    console.log(`  ${i + 1}. ${priority}`);
  });

  console.log('\nRecommendations:');
  riskAnalysis.recommendations.forEach(rec => {
    console.log(`  • ${rec}`);
  });
}

function getRiskLevel(score) {
  if (score > 0.7) return '🔴 HIGH';
  if (score > 0.4) return '🟡 MEDIUM';
  return '🟢 LOW';
}

assessSprintRisk();
```

### Example 3: Generate Test Plan from User Stories

Create a file `story-to-tests.js`:

```javascript
const { AgenticQE } = require('agentic-qe');

async function generateTestPlan() {
  const aqe = new AgenticQE();

  // Your actual user stories
  const userStories = [
    'As a user, I want to reset my password so that I can regain access to my account',
    'As an admin, I want to export user data in CSV format for reporting',
    'As a customer, I want to filter products by price range to find items within my budget'
  ];

  console.log('📝 Test Plan Generation\n');

  for (const story of userStories) {
    console.log(`User Story: "${story}"`);
    console.log('─'.repeat(60));

    // Analyze the story
    const analysis = await aqe.analyzeRequirements([story]);

    // Generate test charters
    if (analysis.charters.length > 0) {
      console.log('Test Charters:');
      analysis.charters.forEach(charter => {
        console.log(`  • ${charter.charter}`);
        console.log(`    Time: ${charter.timeBox} min | Focus: ${charter.focus}`);
      });
    }

    // Identify risks
    if (analysis.risks.length > 0) {
      console.log('\nRisk Areas:');
      analysis.risks.forEach(risk => {
        console.log(`  ⚠️  ${risk.category}: ${risk.term}`);
      });
    }

    console.log('\n');
  }
}

generateTestPlan();
```

### Example 4: API Endpoint Testing Strategy

Create a file `api-test-strategy.js`:

```javascript
const { AgenticQE } = require('agentic-qe');

async function planAPITests() {
  const aqe = new AgenticQE();

  // Your API endpoints
  const apiEndpoints = [
    { path: '/api/users', methods: ['GET', 'POST'], auth: true },
    { path: '/api/products', methods: ['GET', 'PUT', 'DELETE'], auth: false },
    { path: '/api/orders', methods: ['POST'], auth: true, critical: true }
  ];

  console.log('🌐 API Testing Strategy\n');

  for (const endpoint of apiEndpoints) {
    console.log(`Endpoint: ${endpoint.path}`);
    console.log(`Methods: ${endpoint.methods.join(', ')}`);
    console.log(`Authentication: ${endpoint.auth ? 'Required' : 'Not required'}`);

    // Assess risk for this endpoint
    const risk = await aqe.assessRisk({
      linesChanged: 100,
      complexity: endpoint.methods.length * 3,
      critical: endpoint.critical || endpoint.auth,
      previousBugs: 0
    });

    console.log(`Risk Level: ${(risk.overallRisk * 100).toFixed(0)}%`);

    console.log('Test Cases:');
    console.log('  • Happy path test');
    console.log('  • Invalid input validation');
    console.log('  • Error handling test');

    if (endpoint.auth) {
      console.log('  • Authentication failure test');
      console.log('  • Authorization boundary test');
    }

    if (risk.overallRisk > 0.5) {
      console.log('  • Load testing');
      console.log('  • Security scanning');
    }

    console.log('─'.repeat(60) + '\n');
  }
}

planAPITests();
```

### Example 5: Exploratory Testing Session Generator

Create a file `exploratory-session.js`:

```javascript
const { AgenticQE } = require('agentic-qe');
const readline = require('readline');

async function startExploratoryTesting() {
  const aqe = new AgenticQE();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🔍 Exploratory Testing Session Generator\n');

  rl.question('What feature do you want to test? ', async (feature) => {
    rl.question('How many minutes do you have? ', async (time) => {
      rl.question('What is your main concern? (security/performance/usability/edge-cases) ', async (concern) => {

        // Map concern to tour type
        const tourMap = {
          'security': 'saboteur',
          'performance': 'all_nighter',
          'usability': 'landmark',
          'edge-cases': 'garbage_collector'
        };

        const session = await aqe.runExploratorySession({
          charter: `Test ${feature} focusing on ${concern}`,
          timeBox: parseInt(time),
          tour: tourMap[concern] || 'landmark'
        });

        console.log('\n📋 Your Exploratory Testing Session\n');
        console.log(`Session ID: ${session.id}`);
        console.log(`Charter: ${session.charter}`);
        console.log(`Duration: ${session.timeBox} minutes`);
        console.log(`Testing Tour: ${session.tour}`);
        console.log(`Start Time: ${session.startTime}`);

        console.log('\n🎯 Testing Focus Areas:');
        const focusAreas = getFocusAreas(session.tour);
        focusAreas.forEach(area => {
          console.log(`  • ${area}`);
        });

        console.log('\n📝 Things to Document:');
        console.log('  • Unexpected behaviors');
        console.log('  • Performance issues');
        console.log('  • UI/UX problems');
        console.log('  • Error messages');
        console.log('  • Edge cases discovered');

        console.log('\n⏰ Timer started! Begin your exploration.\n');

        rl.close();
      });
    });
  });
}

function getFocusAreas(tour) {
  const tours = {
    'saboteur': [
      'Try SQL injection in input fields',
      'Test with malformed data',
      'Attempt privilege escalation',
      'Check for data exposure'
    ],
    'all_nighter': [
      'Test with maximum data loads',
      'Keep sessions open for extended time',
      'Test timeout scenarios',
      'Check memory leaks'
    ],
    'landmark': [
      'Test main user workflows',
      'Check critical features',
      'Verify happy paths',
      'Test common use cases'
    ],
    'garbage_collector': [
      'Test with empty inputs',
      'Use special characters',
      'Test boundary values',
      'Try unexpected combinations'
    ]
  };

  return tours[tour] || tours.landmark;
}

startExploratoryTesting();
```

### Example 6: Production Monitoring Alert

Create a file `monitor-prod.js`:

```javascript
const { AgenticQE } = require('agentic-qe');

async function monitorProduction() {
  const aqe = new AgenticQE();

  // Simulate getting metrics from your monitoring tool
  // In real use, you'd fetch these from Datadog, New Relic, etc.
  const metrics = {
    errorRate: 0.03,      // 3% error rate
    latencyP99: 1200,     // 1200ms p99 latency
    traffic: 1500,        // requests per second
    saturation: 0.75      // 75% resource usage
  };

  const analysis = await aqe.monitorProduction(metrics);

  console.log('🚨 Production Monitoring Report\n');
  console.log('Current Metrics:');
  console.log(`  • Error Rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
  console.log(`  • P99 Latency: ${metrics.latencyP99}ms`);
  console.log(`  • Traffic: ${metrics.traffic} req/s`);
  console.log(`  • Saturation: ${(metrics.saturation * 100).toFixed(0)}%\n`);

  if (analysis.anomalies.length > 0) {
    console.log('⚠️  Anomalies Detected:');
    analysis.anomalies.forEach(anomaly => {
      console.log(`  • ${anomaly.type.toUpperCase()}: ${anomaly.value} (${anomaly.severity})`);
    });
    console.log('');
  }

  if (analysis.testGaps.length > 0) {
    console.log('📝 Test Coverage Gaps:');
    analysis.testGaps.forEach(gap => {
      console.log(`  • ${gap}`);
    });
    console.log('');
  }

  if (analysis.alerts.length > 0) {
    console.log('🔔 Action Required:');
    analysis.alerts.forEach(alert => {
      console.log(`  [${alert.level.toUpperCase()}] ${alert.message}`);
      console.log(`  → ${alert.action}`);
    });
  } else {
    console.log('✅ All systems operating normally');
  }
}

// Run monitoring check every 5 minutes
monitorProduction();
setInterval(monitorProduction, 5 * 60 * 1000);

console.log('Monitoring started. Press Ctrl+C to stop.\n');
```

## 🎯 Testing Your Own Application

### Step 1: Create a Project Configuration

Create `my-project-config.js`:

```javascript
module.exports = {
  project: {
    name: 'My E-Commerce App',
    type: 'web',
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    testingTools: ['Jest', 'Cypress', 'Postman']
  },

  requirements: [
    'Users can browse products without logging in',
    'Checkout process must be completed in under 3 steps',
    'Payment processing should be PCI compliant',
    'Search results should load within 2 seconds'
  ],

  testEnvironments: {
    local: 'http://localhost:3000',
    staging: 'https://staging.myapp.com',
    production: 'https://myapp.com'
  },

  criticalFlows: [
    'user-registration',
    'product-search',
    'add-to-cart',
    'checkout',
    'payment'
  ]
};
```

### Step 2: Create a Comprehensive Test Suite

Create `run-full-analysis.js`:

```javascript
const { AgenticQE } = require('agentic-qe');
const config = require('./my-project-config');

async function runFullAnalysis() {
  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      enableAuditLogging: true
    }
  });

  console.log(`🔍 Analyzing: ${config.project.name}\n`);

  // 1. Analyze Requirements
  console.log('📋 Requirements Analysis');
  const reqAnalysis = await aqe.analyzeRequirements(config.requirements);
  console.log(`  • Ambiguities: ${reqAnalysis.ambiguities.length}`);
  console.log(`  • Risks: ${reqAnalysis.risks.length}`);
  console.log(`  • Test Charters: ${reqAnalysis.charters.length}\n`);

  // 2. Risk Assessment
  console.log('⚠️  Risk Assessment');
  const risk = await aqe.assessRisk({
    linesChanged: 1000,
    complexity: 15,
    critical: true,
    previousBugs: 5
  });
  console.log(`  • Overall Risk: ${(risk.overallRisk * 100).toFixed(0)}%`);
  console.log(`  • Top Priority: ${risk.priorities[0]}\n`);

  // 3. Security Check
  console.log('🔒 Security Analysis');
  const security = aqe.createAgent('security-sentinel');
  const secScan = await security.perceive({
    endpoints: config.criticalFlows.map(f => `/api/${f}`),
    authentication: 'JWT'
  });
  console.log(`  • Security Score: ${(secScan.securityScore || 0.8) * 10}/10`);
  console.log(`  • Vulnerabilities: ${secScan.vulnerabilities?.length || 0}\n`);

  // 4. Performance Assessment
  console.log('⚡ Performance Check');
  const perfAgent = aqe.createAgent('performance-hunter');
  const perfCheck = await perfAgent.perceive({
    metrics: {
      cpuUsage: 45,
      memoryUsage: 60,
      responseTime: 350
    }
  });
  console.log(`  • Bottlenecks: ${perfCheck.bottlenecks?.length || 0}`);
  console.log(`  • Optimization Opportunities: ${perfCheck.recommendations?.length || 3}\n`);

  // 5. Generate Test Plan
  console.log('📝 Test Plan Summary');
  console.log('  Priority 1: ' + risk.priorities[0]);
  console.log('  Priority 2: ' + risk.priorities[1]);
  console.log('  Priority 3: ' + risk.priorities[2]);

  // 6. Security Report
  const securityReport = aqe.getSecurityReport();
  console.log('\n🛡️  Security Report');
  console.log(`  • Validations: ${securityReport.totalValidations}`);
  console.log(`  • Issues: ${securityReport.securityIssues.length}`);
  console.log(`  • Audit Entries: ${securityReport.auditLog.length}`);

  console.log('\n✅ Analysis Complete!');
}

runFullAnalysis();
```

## 🏃 Running the Examples

1. **Basic Test**: Start with a simple example
   ```bash
   node analyze-coverage.js
   ```

2. **Risk Check**: Assess your current changes
   ```bash
   node sprint-risk.js
   ```

3. **Generate Tests**: Create test plans from stories
   ```bash
   node story-to-tests.js
   ```

4. **API Testing**: Plan API test strategy
   ```bash
   node api-test-strategy.js
   ```

5. **Exploratory**: Start an exploratory session
   ```bash
   node exploratory-session.js
   ```

6. **Monitor**: Run production monitoring
   ```bash
   node monitor-prod.js
   ```

## 💡 Tips for QE Engineers

1. **Start Small**: Begin with one agent and one feature
2. **Use Real Data**: Replace example data with your actual project data
3. **Iterate**: Run analyses regularly, especially before releases
4. **Document Findings**: Keep track of what the agents discover
5. **Customize**: Adjust thresholds and parameters for your context

## 🆘 Troubleshooting

### Common Issues

**Issue**: "Cannot find module 'agentic-qe'"
```bash
# Solution: Install the package
npm install agentic-qe
```

**Issue**: "ENOENT: no such file or directory"
```bash
# Solution: Update file paths to match your project structure
const testCode = fs.readFileSync('./path/to/your/actual/file.js', 'utf8');
```

**Issue**: "Risk score always shows 0%"
```bash
# Solution: Provide actual metrics
const risk = await aqe.assessRisk({
  linesChanged: 500,  // Get from git diff
  complexity: 12,     // Calculate from your code
  critical: true,     // Based on component importance
  previousBugs: 3     // From your bug tracker
});
```

## 📚 Next Steps

1. Read the [QUICK_START.md](../QUICK_START.md) for more examples
2. Explore [ADVANCED_FEATURES.md](../ADVANCED_FEATURES.md) for complex scenarios
3. Check [examples/](../examples/) for complete working scripts
4. Join the community and share your experiences

---

Remember: The Agentic QE Framework is designed to augment your testing, not replace your expertise. Use it as a powerful assistant in your quality engineering journey!