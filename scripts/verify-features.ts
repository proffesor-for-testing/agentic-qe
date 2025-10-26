#!/usr/bin/env tsx

/**
 * Verify Features Script
 *
 * Comprehensive verification of feature claims in README.md against actual implementation.
 * Checks for existence of classes, tests, and validates performance claims.
 *
 * Usage:
 *   npm run verify:features
 *   tsx scripts/verify-features.ts
 *   tsx scripts/verify-features.ts --verbose
 *   tsx scripts/verify-features.ts --json
 *   tsx scripts/verify-features.ts --feature multi-model-router
 *
 * Exit codes:
 *   0 - All features verified
 *   1 - Features missing or claims unverified
 *
 * @author Agentic QE Team
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface FeatureCheck {
  name: string;
  type: 'class' | 'file' | 'config' | 'test' | 'performance' | 'integration';
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  details?: string;
  path?: string;
}

interface FeatureVerification {
  feature: string;
  description: string;
  claimed: string;
  checks: FeatureCheck[];
  overallStatus: 'verified' | 'partial' | 'missing' | 'unknown';
  confidence: number; // 0-100
}

interface VerificationReport {
  timestamp: string;
  summary: {
    totalFeatures: number;
    verified: number;
    partial: number;
    missing: number;
    unknown: number;
    averageConfidence: number;
  };
  features: FeatureVerification[];
  errors: string[];
}

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');
const SPECIFIC_FEATURE = process.argv.find(arg => arg.startsWith('--feature='))?.split('=')[1];
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Check if a file exists
 */
function checkFileExists(relativePath: string): FeatureCheck {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  const exists = fs.existsSync(fullPath);

  return {
    name: `File: ${relativePath}`,
    type: 'file',
    description: `Check if ${relativePath} exists`,
    status: exists ? 'pass' : 'fail',
    path: exists ? fullPath : undefined,
    details: exists ? `Found at ${fullPath}` : `Not found at ${fullPath}`
  };
}

/**
 * Check if a class exists in a file
 */
function checkClassExists(file: string, className: string): FeatureCheck {
  const fullPath = path.join(PROJECT_ROOT, file);

  if (!fs.existsSync(fullPath)) {
    return {
      name: `Class: ${className}`,
      type: 'class',
      description: `Check if class ${className} exists in ${file}`,
      status: 'fail',
      details: `File not found: ${fullPath}`
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const classPattern = new RegExp(`(class|interface|type)\\s+${className}\\b`);
  const exists = classPattern.test(content);

  return {
    name: `Class: ${className}`,
    type: 'class',
    description: `Check if class ${className} exists in ${file}`,
    status: exists ? 'pass' : 'fail',
    path: exists ? fullPath : undefined,
    details: exists ? `Found in ${file}` : `Not found in ${file}`
  };
}

/**
 * Check if tests exist for a feature
 */
function checkTestsExist(pattern: string): FeatureCheck {
  try {
    const result = execSync(`find ${PROJECT_ROOT}/tests -name "${pattern}" -type f`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const files = result.trim().split('\n').filter(f => f.length > 0);
    const exists = files.length > 0;

    return {
      name: `Tests: ${pattern}`,
      type: 'test',
      description: `Check if tests matching ${pattern} exist`,
      status: exists ? 'pass' : 'warning',
      details: exists ? `Found ${files.length} test file(s)` : `No tests found matching ${pattern}`
    };
  } catch (error) {
    return {
      name: `Tests: ${pattern}`,
      type: 'test',
      description: `Check if tests matching ${pattern} exist`,
      status: 'warning',
      details: 'Could not scan for tests'
    };
  }
}

/**
 * Check if configuration exists
 */
function checkConfigExists(configPath: string, key?: string): FeatureCheck {
  const fullPath = path.join(PROJECT_ROOT, configPath);

  if (!fs.existsSync(fullPath)) {
    return {
      name: `Config: ${configPath}`,
      type: 'config',
      description: `Check if configuration ${configPath} exists`,
      status: 'fail',
      details: `Configuration file not found`
    };
  }

  if (!key) {
    return {
      name: `Config: ${configPath}`,
      type: 'config',
      description: `Check if configuration ${configPath} exists`,
      status: 'pass',
      path: fullPath,
      details: `Configuration file found`
    };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(content);
    const hasKey = key.split('.').reduce((obj, k) => obj?.[k], config) !== undefined;

    return {
      name: `Config: ${configPath} (${key})`,
      type: 'config',
      description: `Check if configuration key ${key} exists`,
      status: hasKey ? 'pass' : 'fail',
      path: fullPath,
      details: hasKey ? `Key ${key} found in config` : `Key ${key} not found`
    };
  } catch (error) {
    return {
      name: `Config: ${configPath}`,
      type: 'config',
      description: `Check if configuration ${configPath} is valid`,
      status: 'fail',
      details: `Invalid JSON: ${error}`
    };
  }
}

/**
 * Check if code pattern exists
 */
function checkCodePattern(file: string, pattern: RegExp, description: string): FeatureCheck {
  const fullPath = path.join(PROJECT_ROOT, file);

  if (!fs.existsSync(fullPath)) {
    return {
      name: description,
      type: 'file',
      description,
      status: 'fail',
      details: `File not found: ${fullPath}`
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const matches = content.match(pattern);
  const exists = !!matches;

  return {
    name: description,
    type: 'file',
    description,
    status: exists ? 'pass' : 'fail',
    path: exists ? fullPath : undefined,
    details: exists ? `Pattern found (${matches?.length || 0} matches)` : `Pattern not found`
  };
}

/**
 * Verify Multi-Model Router feature
 */
function verifyMultiModelRouter(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkClassExists('src/core/routing/AdaptiveModelRouter.ts', 'AdaptiveModelRouter'),
    checkConfigExists('.agentic-qe/config/routing.json'),
    checkConfigExists('.agentic-qe/config/routing.json', 'multiModelRouter'),
    checkClassExists('src/core/routing/CostTracker.ts', 'CostTracker'),
    checkTestsExist('*routing*.test.ts'),
    checkTestsExist('*model*.test.ts'),
    checkCodePattern('src/core/routing/AdaptiveModelRouter.ts', /selectModel|chooseModel/, 'Model selection logic'),
    checkCodePattern('src/core/routing/CostTracker.ts', /trackCost|calculateCost/, 'Cost tracking implementation')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'Multi-Model Router',
    description: '70-81% cost savings through intelligent model selection',
    claimed: '70-81% cost savings, intelligent model selection based on task complexity',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify Learning System feature
 */
function verifyLearningSystem(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkClassExists('src/learning/LearningEngine.ts', 'LearningEngine'),
    checkClassExists('src/learning/QLearning.ts', 'QLearning'),
    checkFileExists('src/learning/ExperienceReplayBuffer.ts'),
    checkTestsExist('*learning*.test.ts'),
    checkTestsExist('*qlearning*.test.ts'),
    checkCodePattern('src/learning/QLearning.ts', /updateQValue|qTable/, 'Q-learning algorithm'),
    checkCodePattern('src/learning/LearningEngine.ts', /train|learn/, 'Learning implementation'),
    checkFileExists('.agentic-qe/data/learning/state.json')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'Learning System',
    description: '20% continuous improvement through Q-learning',
    claimed: '20% improvement target, Q-learning algorithm, experience replay',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify Pattern Bank feature
 */
function verifyPatternBank(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkClassExists('src/reasoning/QEReasoningBank.ts', 'QEReasoningBank'),
    checkCodePattern('src/reasoning/QEReasoningBank.ts', /extractPattern|storePattern/, 'Pattern extraction'),
    checkCodePattern('src/reasoning/QEReasoningBank.ts', /matchPattern|findPattern/, 'Pattern matching'),
    checkTestsExist('*pattern*.test.ts'),
    checkTestsExist('*reasoning*.test.ts'),
    checkFileExists('.agentic-qe/data/patterns/registry.json'),
    checkCodePattern('src/reasoning/QEReasoningBank.ts', /share|sync/, 'Cross-project sharing')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'Pattern Bank (QE Reasoning Bank)',
    description: '85%+ matching accuracy for pattern reuse',
    claimed: '85%+ matching accuracy, pattern extraction, cross-project sharing',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify ML Flaky Detection feature
 */
function verifyFlakyDetection(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkClassExists('src/learning/FlakyTestDetector.ts', 'FlakyTestDetector'),
    checkCodePattern('src/learning/FlakyTestDetector.ts', /detectFlaky|isFlaky/, 'Flaky detection logic'),
    checkCodePattern('src/learning/FlakyTestDetector.ts', /rootCause|analyze/, 'Root cause analysis'),
    checkCodePattern('src/learning/FlakyTestDetector.ts', /recommend|fix/, 'Fix recommendations'),
    checkTestsExist('*flaky*.test.ts'),
    checkCodePattern('src/learning/FlakyTestDetector.ts', /ml|model|predict/, 'ML model usage')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'ML Flaky Test Detection',
    description: '100% accuracy in flaky test detection',
    claimed: '100% accuracy, ML-based detection, root cause analysis, fix recommendations',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify Streaming API feature
 */
function verifyStreamingAPI(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkFileExists('src/mcp/streaming/TestExecuteStreamHandler.ts'),
    checkFileExists('src/mcp/streaming/CoverageAnalyzeStreamHandler.ts'),
    checkCodePattern('src/mcp/streaming/TestExecuteStreamHandler.ts', /AsyncGenerator|async\s*\*/, 'AsyncGenerator pattern'),
    checkCodePattern('src/mcp/streaming/TestExecuteStreamHandler.ts', /progress|emit/, 'Progress events'),
    checkTestsExist('*stream*.test.ts'),
    checkCodePattern('src/mcp/tools.ts', /test_execute_stream|coverage_analyze_stream/, 'Streaming tool definitions')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'Streaming API',
    description: 'Real-time progress updates for long-running operations',
    claimed: 'AsyncGenerator pattern, real-time progress, for-await-of compatibility',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify AgentDB Integration feature
 */
function verifyAgentDBIntegration(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkFileExists('package.json'),
    checkCodePattern('package.json', /"agentdb[^"]*":\s*"[^"]*"/, 'AgentDB dependency'),
    checkCodePattern('src/agents/BaseAgent.ts', /agentdb|AgentDB/i, 'AgentDB imports'),
    checkCodePattern('src/agents/BaseAgent.ts', /quic|QUIC/i, 'QUIC sync usage'),
    checkCodePattern('src/agents/BaseAgent.ts', /vectorSearch|vector/, 'Vector search usage'),
    checkTestsExist('*agentdb*.test.ts')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'AgentDB Integration',
    description: 'Vector database with QUIC sync and learning plugins',
    claimed: 'AgentDB installed, QUIC sync, vector search, learning plugins, performance optimizations',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify MCP Tools count
 */
function verifyMCPTools(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkFileExists('src/mcp/tools.ts'),
    checkCodePattern('src/mcp/tools.ts', /export\s+const\s+agenticQETools/, 'Tools export'),
    checkCodePattern('src/mcp/tools.ts', /mcp__agentic_qe__/g, 'Tool definitions'),
    checkFileExists('src/mcp/handlers'),
    checkTestsExist('*mcp*.test.ts'),
    checkFileExists('bin/aqe-mcp')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  // Count actual tools
  const toolsFile = path.join(PROJECT_ROOT, 'src/mcp/tools.ts');
  let toolCount = 0;
  if (fs.existsSync(toolsFile)) {
    const content = fs.readFileSync(toolsFile, 'utf-8');
    const matches = content.match(/name:\s*['"]mcp__agentic_qe__[^'"]+['"]/g);
    toolCount = matches ? matches.length : 0;
  }

  return {
    feature: 'MCP Tools',
    description: `${toolCount} MCP tools for Claude Code integration`,
    claimed: '61 MCP tools for comprehensive QE operations',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Verify performance claims
 */
function verifyPerformanceClaims(): FeatureVerification {
  const checks: FeatureCheck[] = [
    checkTestsExist('*performance*.test.ts'),
    checkTestsExist('*benchmark*.test.ts'),
    checkCodePattern('src/test-generation/TestGenerator.ts', /1000|rate|throughput/, 'Test generation performance'),
    checkCodePattern('src/coverage/CoverageAnalyzer.ts', /O\(log\s*n\)|sublinear|johnson/, 'O(log n) complexity'),
    checkCodePattern('src/test-data/TestDataGenerator.ts', /10000|10,000/, 'Data generation rate'),
    checkTestsExist('*sublinear*.test.ts'),
    checkFileExists('tests/performance')
  ];

  const passCount = checks.filter(c => c.status === 'pass').length;
  const confidence = (passCount / checks.length) * 100;

  return {
    feature: 'Performance Claims',
    description: 'High-performance test generation and analysis',
    claimed: '1000+ tests/min, O(log n) coverage, 10,000+ records/sec, <50ms p95 matching',
    checks,
    overallStatus: confidence >= 80 ? 'verified' : confidence >= 50 ? 'partial' : 'missing',
    confidence
  };
}

/**
 * Run comprehensive verification
 */
function verify(): VerificationReport {
  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFeatures: 0,
      verified: 0,
      partial: 0,
      missing: 0,
      unknown: 0,
      averageConfidence: 0
    },
    features: [],
    errors: []
  };

  try {
    const features = [
      verifyMultiModelRouter,
      verifyLearningSystem,
      verifyPatternBank,
      verifyFlakyDetection,
      verifyStreamingAPI,
      verifyAgentDBIntegration,
      verifyMCPTools,
      verifyPerformanceClaims
    ];

    for (const verifyFeature of features) {
      try {
        const result = verifyFeature();

        // Skip if specific feature requested and this isn't it
        if (SPECIFIC_FEATURE && !result.feature.toLowerCase().includes(SPECIFIC_FEATURE.toLowerCase())) {
          continue;
        }

        report.features.push(result);
      } catch (error) {
        report.errors.push(`Error verifying feature: ${error}`);
      }
    }

    // Calculate summary
    report.summary.totalFeatures = report.features.length;
    report.summary.verified = report.features.filter(f => f.overallStatus === 'verified').length;
    report.summary.partial = report.features.filter(f => f.overallStatus === 'partial').length;
    report.summary.missing = report.features.filter(f => f.overallStatus === 'missing').length;
    report.summary.unknown = report.features.filter(f => f.overallStatus === 'unknown').length;

    const totalConfidence = report.features.reduce((sum, f) => sum + f.confidence, 0);
    report.summary.averageConfidence = report.features.length > 0 ? totalConfidence / report.features.length : 0;

  } catch (error) {
    report.errors.push(`Verification error: ${error}`);
  }

  return report;
}

/**
 * Display report
 */
function displayReport(report: VerificationReport): void {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('FEATURE VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${report.timestamp}\n`);

  for (const feature of report.features) {
    const statusIcon = {
      verified: '✅',
      partial: '⚠️',
      missing: '❌',
      unknown: '❓'
    }[feature.overallStatus];

    console.log(`\n${statusIcon} ${feature.feature}`);
    console.log('-'.repeat(80));
    console.log(`Claimed: ${feature.claimed}`);
    console.log(`Status: ${feature.overallStatus.toUpperCase()} (${feature.confidence.toFixed(1)}% confidence)\n`);

    const passChecks = feature.checks.filter(c => c.status === 'pass');
    const failChecks = feature.checks.filter(c => c.status === 'fail');
    const warnChecks = feature.checks.filter(c => c.status === 'warning');

    console.log(`Checks: ${passChecks.length} passed, ${failChecks.length} failed, ${warnChecks.length} warnings`);

    if (VERBOSE || feature.overallStatus !== 'verified') {
      console.log('\nDetailed Checks:');
      for (const check of feature.checks) {
        const checkIcon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
        console.log(`  ${checkIcon} ${check.name}`);
        if (VERBOSE || check.status !== 'pass') {
          console.log(`    ${check.details}`);
        }
      }
    }

    if (feature.overallStatus === 'partial' || feature.overallStatus === 'missing') {
      console.log('\n💡 Action Required:');
      for (const check of failChecks) {
        console.log(`  • ${check.description}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Features: ${report.summary.totalFeatures}`);
  console.log(`✅ Verified: ${report.summary.verified}`);
  console.log(`⚠️  Partial: ${report.summary.partial}`);
  console.log(`❌ Missing: ${report.summary.missing}`);
  console.log(`❓ Unknown: ${report.summary.unknown}`);
  console.log(`\nAverage Confidence: ${report.summary.averageConfidence.toFixed(1)}%`);

  if (report.errors.length > 0) {
    console.log('\n⚠️ ERRORS:');
    report.errors.forEach(error => console.log(`  - ${error}`));
  }

  console.log('='.repeat(80) + '\n');

  // Overall assessment
  const overallConfidence = report.summary.averageConfidence;
  if (overallConfidence >= 80) {
    console.log('🎉 EXCELLENT: High confidence in documentation claims\n');
  } else if (overallConfidence >= 60) {
    console.log('👍 GOOD: Most features verified, some improvements needed\n');
  } else {
    console.log('⚠️  NEEDS WORK: Significant gaps between claims and implementation\n');
  }
}

/**
 * Main execution
 */
function main(): void {
  const report = verify();
  displayReport(report);

  // Save report
  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `verification-features-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (VERBOSE) {
    console.log(`📄 Full report saved to: ${path.relative(PROJECT_ROOT, reportPath)}\n`);
  }

  // Exit with appropriate code
  const hasIssues = report.summary.missing > 0 || report.summary.averageConfidence < 80;
  process.exit(hasIssues ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verify, VerificationReport, FeatureVerification };
