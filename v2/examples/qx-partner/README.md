# QX Partner Agent Examples

This directory contains practical examples demonstrating how to use the QX Partner Agent to analyze Quality Experience (QX) by combining Quality Advocacy (QA) and User Experience (UX) perspectives.

## What is QX?

**Quality Experience (QX)** is the marriage of:
- **QA (Quality Advocacy)**: Ensuring the product works correctly and meets requirements
- **UX (User Experience)**: Ensuring the product is usable, accessible, and delightful

QX recognizes that "quality is value to someone who matters" - and multiple stakeholders matter simultaneously (users, business, support teams, etc.).

## Examples

### 1. Basic Full Analysis
**File**: `basic-analysis.ts`

Performs a comprehensive QX analysis covering all aspects:
- Problem understanding (Rule of Three)
- User needs analysis
- Business needs analysis
- Oracle problem detection
- Impact analysis (visible & invisible)
- UX heuristics application (25+ heuristics)
- Testability integration
- Contextual recommendations

```bash
# Analyze a website
npx ts-node examples/qx-partner/basic-analysis.ts https://www.saucedemo.com

# Use default URL (saucedemo)
npx ts-node examples/qx-partner/basic-analysis.ts
```

**What you'll learn:**
- How to initialize and configure the agent
- How to perform a full QX analysis
- How to interpret comprehensive results
- Overall QX score and grading
- Top recommendations for improvement

### 2. Oracle Problem Detection
**File**: `oracle-detection.ts`

Focuses specifically on detecting oracle problems - situations where quality criteria are unclear or conflicting.

Oracle problems include:
- User vs business conflicts
- Missing information
- Stakeholder conflicts
- Unclear acceptance criteria
- Technical constraints

```bash
# Detect oracle problems
npx ts-node examples/qx-partner/oracle-detection.ts https://www.saucedemo.com
```

**What you'll learn:**
- How to detect unclear quality criteria
- Five types of oracle problems
- Severity classification (critical/high/medium/low)
- Resolution approaches for each problem
- How to prioritize oracle problem fixes

### 3. User vs Business Balance Analysis
**File**: `balance-analysis.ts`

Analyzes the balance between user needs and business needs, identifying if the feature favors one over the other.

```bash
# Analyze user-business balance
npx ts-node examples/qx-partner/balance-analysis.ts https://www.saucedemo.com
```

**What you'll learn:**
- How to measure user needs alignment
- How to measure business needs alignment
- How to identify imbalances
- Whether the feature favors users or business
- Recommendations for achieving balance
- Action items based on the analysis

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

## Running Examples

### Using ts-node (Development)
```bash
npx ts-node examples/qx-partner/basic-analysis.ts [url]
```

### Using compiled JavaScript (Production)
```bash
# Build first
npm run build

# Run compiled version
node dist/examples/qx-partner/basic-analysis.js [url]
```

### Via MCP (Model Context Protocol)
```bash
# Spawn agent
aqe-mcp spawn qx-partner

# Execute analysis (replace AGENT_ID with actual ID)
aqe-mcp execute AGENT_ID --task '{"type":"full-analysis","target":"https://www.saucedemo.com"}'
```

## Example Output

### Basic Analysis Output
```
🔍 QX Partner Agent - Basic Analysis
=====================================

Target: https://www.saucedemo.com

⚙️  Initializing QX Partner Agent...
✅ Agent initialized

🔬 Performing full QX analysis...

📊 ANALYSIS RESULTS
==================

Overall QX Score: 75/100 (Grade: C)
Analysis Date: 12/1/2024, 10:30:00 AM

📋 Problem Understanding:
  Problem Definition: E-commerce login and checkout flow
  Clarity Score: 80/100
  Potential Failure Modes:
    1. Login credentials validation
    2. Cart state persistence
    3. Checkout process completion

👤 User Needs Analysis:
  Alignment Score: 78/100
  Must-Have Features: 5
  Should-Have Features: 3
  Nice-to-Have Features: 7

💼 Business Needs Analysis:
  Alignment Score: 72/100
  Primary Goal: conversion
  KPI Impact: High - directly affects checkout completion rate

⚠️  Oracle Problems Detected:
  1. [MEDIUM] user-vs-business
     Conflict between ease of use and security requirements
     Resolution: Balance security with UX through progressive disclosure

📈 Impact Analysis:
  Overall Impact Score: 70/100
  Visible Impact Score: 85/100
  Invisible Impact Score: 55/100
  Immutable Requirements: 3

💡 TOP RECOMMENDATIONS:
=======================

1. [HIGH] Improve password field visibility
   Add show/hide password toggle for better usability
   Category: ux | Impact: high | Effort: low
   Priority Score: 85

...
```

### Oracle Detection Output
```
🔍 QX Partner Agent - Oracle Problem Detection
===============================================

Target: https://www.saucedemo.com

📊 ORACLE PROBLEMS DETECTED
===========================

Found 3 oracle problem(s):

🚨 CRITICAL PROBLEMS:
===================

1. USER VS BUSINESS CONFLICT
   Severity: CRITICAL
   Description: Conflicting requirements between user ease-of-use and business security
   Impact: Affects user satisfaction and security compliance
   Affected Stakeholders: users, security-team, business
   Resolution Approach: Facilitate stakeholder meeting to align priorities

...
```

### Balance Analysis Output
```
⚖️  QX Partner Agent - User vs Business Balance Analysis
=======================================================

Target: https://www.saucedemo.com

📊 BALANCE ANALYSIS RESULTS
===========================

⚠️ Balance Status: IMBALANCED

👤 USER NEEDS ANALYSIS:
======================

Alignment Score: 65/100

Must-Have Features:
  1. Clear login instructions
  2. Error messages for invalid credentials
  3. Password reset option

💼 BUSINESS NEEDS ANALYSIS:
==========================

Alignment Score: 82/100

Primary Goal: maximize-conversion
KPI Impact: High - directly affects conversion rate

⚖️  BALANCE DETAILS:
==================

User Alignment:     65/100
Business Alignment: 82/100
Gap:                17 points

📊 Analysis: Currently FAVORING BUSINESS NEEDS
   Business needs are 17 points higher than user needs.
   This may indicate strong business alignment but potential UX issues.

💡 RECOMMENDATION:
=================

Consider increasing focus on user needs to achieve better balance.
Current gap of 17 points suggests business optimization may be
overshadowing user experience. Review UX heuristics and consider
usability improvements.

...
```

## Common Use Cases

### 1. Feature Quality Assessment
Run basic analysis before releasing a new feature to ensure both QA and UX aspects are covered.

### 2. Oracle Problem Prevention
Run oracle detection early in development to identify unclear requirements before they cause issues.

### 3. Stakeholder Alignment
Use balance analysis to demonstrate whether a feature is properly aligned with both user and business needs.

### 4. Continuous Quality Monitoring
Integrate QX analysis into your CI/CD pipeline to track quality trends over time.

### 5. Design Review
Run QX analysis during design reviews to validate UX decisions against QA principles.

## Configuration Options

All examples support these configuration options in the agent initialization:

```typescript
{
  analysisMode: 'full' | 'quick',        // Analysis depth
  integrateTestability: boolean,          // Include testability assessment
  detectOracleProblems: boolean,          // Detect oracle problems
  minOracleSeverity: 'low' | 'medium' | 'high' | 'critical',
  heuristics: {
    enabledHeuristics: QXHeuristic[],     // Which heuristics to apply (empty = all)
    minConfidence: number                  // Minimum confidence threshold (0-1)
  },
  thresholds: {
    minQXScore: number,                    // Minimum acceptable QX score
    minProblemClarity: number,             // Minimum problem clarity score
    minUserNeedsAlignment: number,         // Minimum user needs score
    minBusinessAlignment: number           // Minimum business needs score
  }
}
```

## Tips for Best Results

1. **Provide Context**: Include feature name, user role, and business goal in task parameters for more accurate analysis
2. **Run Full Analysis First**: Start with basic-analysis.ts to get comprehensive results
3. **Focus on Critical Issues**: Use oracle-detection.ts to identify blocking quality criteria issues
4. **Check Balance Regularly**: Use balance-analysis.ts to ensure features serve both users and business
5. **Iterate**: Run analyses multiple times during development to track improvements
6. **Combine with Other Agents**: Use Visual Tester (UX) and Quality Analyzer (QA) agents for deeper insights
7. **Save Results**: Store analysis results for trend tracking and comparison

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run QX Analysis
  run: |
    npx ts-node examples/qx-partner/basic-analysis.ts ${{ secrets.STAGING_URL }} > qx-report.txt
    
- name: Check QX Score
  run: |
    score=$(grep "Overall QX Score" qx-report.txt | grep -oP '\d+')
    if [ $score -lt 70 ]; then
      echo "QX score too low: $score/100"
      exit 1
    fi
```

### Jenkins Pipeline Example
```groovy
stage('QX Analysis') {
  steps {
    sh 'npx ts-node examples/qx-partner/basic-analysis.ts ${STAGING_URL} > qx-report.txt'
    script {
      def score = sh(script: "grep 'Overall QX Score' qx-report.txt | grep -oP '\\d+'", returnStdout: true).trim()
      if (score.toInteger() < 70) {
        error "QX score too low: ${score}/100"
      }
    }
  }
}
```

## Next Steps

1. Run the examples on your own applications
2. Customize the configuration for your specific needs
3. Integrate QX analysis into your development workflow
4. Explore the full agent capabilities in `docs/agents/QX-PARTNER-AGENT.md`
5. Contribute your own examples back to the project!

## Support

- Documentation: `/docs/agents/QX-PARTNER-AGENT.md`
- Source Code: `/src/agents/QXPartnerAgent.ts`
- Type Definitions: `/src/types/qx.ts`
- Unit Tests: `/tests/unit/agents/QXPartnerAgent.test.ts`

## License

MIT License - see LICENSE file for details
