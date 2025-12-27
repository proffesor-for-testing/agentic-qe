#!/usr/bin/env tsx
/**
 * Test script for keyword-based domain detection
 * Phase 3 Track I - Enhanced auto-loading
 */

import { detectDomainsFromMessage, DOMAIN_KEYWORDS, DOMAIN_RELATIONSHIPS } from '../src/mcp/tool-categories.js';

// Test messages covering various domains
const testMessages = [
  // Security domain
  {
    message: "Run a security scan to check for SQL injection vulnerabilities",
    expected: ['security'],
  },
  {
    message: "Check authentication and verify OWASP compliance",
    expected: ['security'],
  },
  {
    message: "Scan for CVE vulnerabilities in dependencies",
    expected: ['security'],
  },

  // Performance domain
  {
    message: "Run performance benchmarks and identify bottlenecks",
    expected: ['performance'],
  },
  {
    message: "Analyze API latency and response time",
    expected: ['performance'],
  },
  {
    message: "Check memory leak and CPU usage",
    expected: ['performance'],
  },

  // Coverage domain
  {
    message: "Analyze test coverage and find coverage gaps",
    expected: ['coverage'],
  },
  {
    message: "Increase branch coverage to 80%",
    expected: ['coverage'],
  },
  {
    message: "Identify untested code paths",
    expected: ['coverage'],
  },

  // Quality domain
  {
    message: "Check quality gate before deployment",
    expected: ['quality'],
  },
  {
    message: "Analyze code complexity and technical debt",
    expected: ['quality'],
  },
  {
    message: "Run linting and check for code smells",
    expected: ['quality'],
  },

  // Flaky domain
  {
    message: "Detect flaky tests with intermittent failures",
    expected: ['flaky'],
  },
  {
    message: "Analyze test stability and retry patterns",
    expected: ['flaky'],
  },

  // Visual domain
  {
    message: "Check visual regression and accessibility",
    expected: ['visual'],
  },
  {
    message: "Validate WCAG compliance and contrast ratio",
    expected: ['visual'],
  },

  // Requirements domain
  {
    message: "Validate BDD scenarios and acceptance criteria",
    expected: ['requirements'],
  },
  {
    message: "Generate Gherkin feature files from user stories",
    expected: ['requirements'],
  },

  // Multi-domain
  {
    message: "Run security scan, check coverage gaps, and validate quality gate before deployment",
    expected: ['security', 'coverage', 'quality'],
  },
  {
    message: "Analyze performance bottlenecks and check if quality metrics pass",
    expected: ['performance', 'quality'],
  },
];

console.log('🧪 Testing Enhanced Keyword-Based Domain Detection\n');
console.log('=' .repeat(80));

let passed = 0;
let failed = 0;

// Test each message
for (const { message, expected } of testMessages) {
  console.log(`\n📝 Message: "${message}"`);

  // Detect without related domains
  const detected = detectDomainsFromMessage(message, { includeRelated: false });
  console.log(`   Detected: [${detected.join(', ')}]`);
  console.log(`   Expected: [${expected.join(', ')}]`);

  // Check if all expected domains were detected
  const allExpectedFound = expected.every(d => detected.includes(d));
  const noExtraFound = detected.every(d => expected.includes(d));

  if (allExpectedFound && noExtraFound) {
    console.log(`   ✅ PASS`);
    passed++;
  } else {
    console.log(`   ❌ FAIL`);
    failed++;

    const missing = expected.filter(d => !detected.includes(d));
    const extra = detected.filter(d => !expected.includes(d));

    if (missing.length > 0) {
      console.log(`      Missing: [${missing.join(', ')}]`);
    }
    if (extra.length > 0) {
      console.log(`      Extra: [${extra.join(', ')}]`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${testMessages.length} total)\n`);

// Test related domain loading
console.log('🔗 Testing Related Domain Loading\n');
console.log('='.repeat(80));

const relatedTests = [
  {
    message: "Run security scan",
    primary: ['security'],
    related: ['quality'],
  },
  {
    message: "Analyze test coverage",
    primary: ['coverage'],
    related: ['quality'],
  },
  {
    message: "Detect flaky tests",
    primary: ['flaky'],
    related: ['coverage', 'quality'],
  },
];

for (const { message, primary, related } of relatedTests) {
  console.log(`\n📝 Message: "${message}"`);

  const detectedPrimary = detectDomainsFromMessage(message, { includeRelated: false });
  const detectedAll = detectDomainsFromMessage(message, { includeRelated: true });

  console.log(`   Primary: [${detectedPrimary.join(', ')}]`);
  console.log(`   With Related: [${detectedAll.join(', ')}]`);

  const relatedDomains = detectedAll.filter(d => !detectedPrimary.includes(d));
  console.log(`   Related Added: [${relatedDomains.join(', ')}]`);
}

// Show keyword statistics
console.log('\n\n📈 Keyword Statistics\n');
console.log('='.repeat(80));

for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
  console.log(`\n${domain.toUpperCase()}:`);
  console.log(`   Total Keywords: ${keywords.length}`);
  console.log(`   Sample Keywords: ${keywords.slice(0, 5).join(', ')}...`);
}

// Show domain relationships
console.log('\n\n🔗 Domain Relationships\n');
console.log('='.repeat(80));

for (const [domain, related] of Object.entries(DOMAIN_RELATIONSHIPS)) {
  if (related.length > 0) {
    console.log(`   ${domain} → [${related.join(', ')}]`);
  }
}

console.log('\n');

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
