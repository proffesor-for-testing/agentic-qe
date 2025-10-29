#!/usr/bin/env tsx

/**
 * Verify Counts Script
 *
 * Automatically counts skills, agents, and MCP tools to ensure documentation accuracy.
 * Compares actual counts against claims in README.md, CLAUDE.md, and package.json.
 *
 * Usage:
 *   npm run verify:counts
 *   tsx scripts/verify-counts.ts
 *   tsx scripts/verify-counts.ts --verbose
 *   tsx scripts/verify-counts.ts --json
 *
 * Exit codes:
 *   0 - All counts match documentation
 *   1 - Mismatches found
 *
 * @author Agentic QE Team
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

interface CountResult {
  type: string;
  category: string;
  actual: number;
  expected?: number;
  source?: string;
  status: 'match' | 'mismatch' | 'unknown';
  message?: string;
}

interface VerificationReport {
  timestamp: string;
  summary: {
    total: number;
    matches: number;
    mismatches: number;
    unknown: number;
  };
  results: CountResult[];
  errors: string[];
}

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Count markdown files in a directory recursively
 */
function countMarkdownFiles(dir: string): number {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      count += countMarkdownFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      count++;
    }
  }

  return count;
}

/**
 * Count skills by category
 */
function countSkills(): { total: number; qe: number; claudeFlow: number; phase1: number; phase2: number } {
  const skillsDir = path.join(PROJECT_ROOT, '.claude', 'skills');

  if (!fs.existsSync(skillsDir)) {
    return { total: 0, qe: 0, claudeFlow: 0, phase1: 0, phase2: 0 };
  }

  const qeSkillPatterns = [
    'agentic-quality-engineering', 'holistic-testing-pact', 'context-driven-testing',
    'exploratory-testing-advanced', 'risk-based-testing', 'test-automation-strategy',
    'api-testing-patterns', 'performance-testing', 'security-testing',
    'tdd-london-chicago', 'xp-practices', 'code-review-quality',
    'refactoring-patterns', 'quality-metrics', 'bug-reporting-excellence',
    'technical-writing', 'consultancy-practices', 'shift-left-testing',
    // Phase 2 skills
    'regression-testing', 'shift-right-testing', 'test-design-techniques',
    'mutation-testing', 'test-data-management', 'accessibility-testing',
    'mobile-testing', 'database-testing', 'contract-testing',
    'chaos-engineering-resilience', 'compatibility-testing', 'localization-testing',
    'compliance-testing', 'visual-testing-advanced', 'test-environment-management',
    'test-reporting-analytics'
  ];

  const phase1Skills = [
    'agentic-quality-engineering', 'holistic-testing-pact', 'context-driven-testing',
    'exploratory-testing-advanced', 'risk-based-testing', 'test-automation-strategy',
    'api-testing-patterns', 'performance-testing', 'security-testing',
    'tdd-london-chicago', 'xp-practices', 'code-review-quality',
    'refactoring-patterns', 'quality-metrics', 'bug-reporting-excellence',
    'technical-writing', 'consultancy-practices', 'shift-left-testing'
  ];

  const allSkills = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const qeSkills = allSkills.filter(skill => qeSkillPatterns.includes(skill));
  const phase1Count = allSkills.filter(skill => phase1Skills.includes(skill)).length;
  const phase2Count = qeSkills.length - phase1Count;
  const claudeFlowSkills = allSkills.length - qeSkills.length;

  return {
    total: allSkills.length,
    qe: qeSkills.length,
    claudeFlow: claudeFlowSkills,
    phase1: phase1Count,
    phase2: phase2Count
  };
}

/**
 * Count agents by category
 */
function countAgents(): { total: number; qe: number; generalPurpose: number } {
  const agentsDir = path.join(PROJECT_ROOT, '.claude', 'agents');

  if (!fs.existsSync(agentsDir)) {
    return { total: 0, qe: 0, generalPurpose: 0 };
  }

  // Count all markdown files recursively
  const total = countMarkdownFiles(agentsDir);

  // QE agents start with 'qe-' prefix
  let qeCount = 0;
  const scanForQEAgents = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForQEAgents(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('qe-') && entry.name.endsWith('.md')) {
        qeCount++;
      }
    }
  };

  scanForQEAgents(agentsDir);

  return {
    total,
    qe: qeCount,
    generalPurpose: total - qeCount
  };
}

/**
 * Count MCP tools from tools.ts
 */
function countMCPTools(): number {
  const toolsFile = path.join(PROJECT_ROOT, 'src', 'mcp', 'tools.ts');

  if (!fs.existsSync(toolsFile)) {
    return 0;
  }

  const content = fs.readFileSync(toolsFile, 'utf-8');

  // Count tool definitions in the agenticQETools array
  // Look for objects with 'name' property starting with 'mcp__agentic_qe__'
  const toolMatches = content.match(/name:\s*['"]mcp__agentic_qe__[^'"]+['"]/g);

  return toolMatches ? toolMatches.length : 0;
}

/**
 * Extract count from documentation
 */
function extractCountFromDocs(filePath: string, pattern: RegExp): number | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(pattern);

  return match ? parseInt(match[1], 10) : null;
}

/**
 * Run verification
 */
function verify(): VerificationReport {
  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: 0,
      matches: 0,
      mismatches: 0,
      unknown: 0
    },
    results: [],
    errors: []
  };

  try {
    // Count actual values
    const skills = countSkills();
    const agents = countAgents();
    const mcpTools = countMCPTools();

    // Documentation files
    const readmePath = path.join(PROJECT_ROOT, 'README.md');
    const claudePath = path.join(PROJECT_ROOT, 'CLAUDE.md');
    const packagePath = path.join(PROJECT_ROOT, 'package.json');

    // Extract expected values from documentation
    // README.md patterns
    const readmeSkillsTotal = extractCountFromDocs(readmePath, /(\d+)\s+(?:Claude\s+)?Skills?\s+Total/i);
    const readmeQESkills = extractCountFromDocs(readmePath, /Total\s+QE\s+Skills:\s+(\d+)/i);
    const readmePhase1Skills = extractCountFromDocs(readmePath, /Phase\s+1:.*?\((\d+)\s+skills?\)/i);
    const readmePhase2Skills = extractCountFromDocs(readmePath, /Phase\s+2:.*?\((\d+)\s+(?:NEW\s+)?skills?\)/i);
    const readmeMCPTools = extractCountFromDocs(readmePath, /(\d+)\s+MCP\s+Tools/i);

    // CLAUDE.md patterns
    const claudeSkillsTotal = extractCountFromDocs(claudePath, /(\d+)\s+specialized\s+QE\s+skills/i);
    const claudeAgentsTotal = extractCountFromDocs(claudePath, /(\d+)\s+specialized\s+QE\s+agents/i);

    // Package.json
    let packageDescription = '';
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      packageDescription = packageJson.description || '';
    }
    const packageMCPTools = packageDescription.match(/(\d+)\s+MCP\s+[Tt]ools/);

    // Build results array
    const results: CountResult[] = [
      // Skills
      {
        type: 'skills',
        category: 'total',
        actual: skills.total,
        expected: readmeSkillsTotal || undefined,
        source: 'README.md',
        status: readmeSkillsTotal !== null && skills.total === readmeSkillsTotal ? 'match' :
                readmeSkillsTotal !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'skills',
        category: 'qe',
        actual: skills.qe,
        expected: readmeQESkills || undefined,
        source: 'README.md',
        status: readmeQESkills !== null && skills.qe === readmeQESkills ? 'match' :
                readmeQESkills !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'skills',
        category: 'phase1',
        actual: skills.phase1,
        expected: readmePhase1Skills || undefined,
        source: 'README.md',
        status: readmePhase1Skills !== null && skills.phase1 === readmePhase1Skills ? 'match' :
                readmePhase1Skills !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'skills',
        category: 'phase2',
        actual: skills.phase2,
        expected: readmePhase2Skills || undefined,
        source: 'README.md',
        status: readmePhase2Skills !== null && skills.phase2 === readmePhase2Skills ? 'match' :
                readmePhase2Skills !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'skills',
        category: 'claude-flow',
        actual: skills.claudeFlow,
        expected: undefined,
        source: 'README.md',
        status: 'unknown'
      },
      {
        type: 'skills',
        category: 'total-claude-md',
        actual: skills.qe,
        expected: claudeSkillsTotal || undefined,
        source: 'CLAUDE.md',
        status: claudeSkillsTotal !== null && skills.qe === claudeSkillsTotal ? 'match' :
                claudeSkillsTotal !== null ? 'mismatch' : 'unknown'
      },
      // Agents
      {
        type: 'agents',
        category: 'total',
        actual: agents.total,
        expected: undefined,
        source: 'README.md',
        status: 'unknown'
      },
      {
        type: 'agents',
        category: 'qe',
        actual: agents.qe,
        expected: claudeAgentsTotal || undefined,
        source: 'CLAUDE.md',
        status: claudeAgentsTotal !== null && agents.qe === claudeAgentsTotal ? 'match' :
                claudeAgentsTotal !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'agents',
        category: 'general-purpose',
        actual: agents.generalPurpose,
        expected: undefined,
        source: 'README.md',
        status: 'unknown'
      },
      // MCP Tools
      {
        type: 'mcp-tools',
        category: 'total',
        actual: mcpTools,
        expected: readmeMCPTools || undefined,
        source: 'README.md',
        status: readmeMCPTools !== null && mcpTools === readmeMCPTools ? 'match' :
                readmeMCPTools !== null ? 'mismatch' : 'unknown'
      },
      {
        type: 'mcp-tools',
        category: 'total-package-json',
        actual: mcpTools,
        expected: packageMCPTools ? parseInt(packageMCPTools[1], 10) : undefined,
        source: 'package.json',
        status: packageMCPTools !== null && mcpTools === parseInt(packageMCPTools[1], 10) ? 'match' :
                packageMCPTools !== null ? 'mismatch' : 'unknown'
      }
    ];

    report.results = results;

    // Calculate summary
    report.summary.total = results.length;
    report.summary.matches = results.filter(r => r.status === 'match').length;
    report.summary.mismatches = results.filter(r => r.status === 'mismatch').length;
    report.summary.unknown = results.filter(r => r.status === 'unknown').length;

  } catch (error) {
    report.errors.push(`Verification error: ${error}`);
  }

  return report;
}

/**
 * Format and display report
 */
function displayReport(report: VerificationReport): void {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('DOCUMENTATION COUNT VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${report.timestamp}\n`);

  // Group results by type
  const skillResults = report.results.filter(r => r.type === 'skills');
  const agentResults = report.results.filter(r => r.type === 'agents');
  const toolResults = report.results.filter(r => r.type === 'mcp-tools');

  // Display skills
  console.log('📚 SKILL COUNT VERIFICATION');
  console.log('-'.repeat(80));
  for (const result of skillResults) {
    const icon = result.status === 'match' ? '✅' : result.status === 'mismatch' ? '❌' : '⚠️';
    const status = result.status.toUpperCase();

    if (result.status === 'match') {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} (${status})`);
    } else if (result.status === 'mismatch') {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} actual, ${result.expected} in ${result.source} (${status})`);
    } else {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} (no documentation claim found)`);
    }
  }

  // Display agents
  console.log('\n🤖 AGENT COUNT VERIFICATION');
  console.log('-'.repeat(80));
  for (const result of agentResults) {
    const icon = result.status === 'match' ? '✅' : result.status === 'mismatch' ? '❌' : '⚠️';
    const status = result.status.toUpperCase();

    if (result.status === 'match') {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} (${status})`);
    } else if (result.status === 'mismatch') {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} actual, ${result.expected} in ${result.source} (${status})`);
    } else {
      console.log(`${icon} ${result.category.toUpperCase()}: ${result.actual} (no documentation claim found)`);
    }
  }

  // Display MCP tools
  console.log('\n🔧 MCP TOOLS COUNT VERIFICATION');
  console.log('-'.repeat(80));
  for (const result of toolResults) {
    const icon = result.status === 'match' ? '✅' : result.status === 'mismatch' ? '❌' : '⚠️';
    const status = result.status.toUpperCase();

    if (result.status === 'match') {
      console.log(`${icon} ${result.source}: ${result.actual} (${status})`);
    } else if (result.status === 'mismatch') {
      console.log(`${icon} ${result.source}: ${result.actual} actual, ${result.expected} expected (${status})`);
    } else {
      console.log(`${icon} ${result.source}: ${result.actual} (no documentation claim found)`);
    }
  }

  // Display summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Checks: ${report.summary.total}`);
  console.log(`✅ Matches: ${report.summary.matches}`);
  console.log(`❌ Mismatches: ${report.summary.mismatches}`);
  console.log(`⚠️  Unknown: ${report.summary.unknown}`);

  if (report.errors.length > 0) {
    console.log('\n⚠️ ERRORS:');
    report.errors.forEach(error => console.log(`  - ${error}`));
  }

  console.log('='.repeat(80) + '\n');

  // Provide fix suggestions
  if (report.summary.mismatches > 0) {
    console.log('🔧 SUGGESTED FIXES:\n');
    const mismatches = report.results.filter(r => r.status === 'mismatch');
    for (const mismatch of mismatches) {
      console.log(`• Update ${mismatch.source} to reflect ${mismatch.actual} ${mismatch.type} (${mismatch.category})`);
    }
    console.log('\nRun: npm run update:counts --dry-run to see proposed changes\n');
  }
}

/**
 * Main execution
 */
function main(): void {
  const report = verify();
  displayReport(report);

  // Save JSON report
  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `verification-counts-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (VERBOSE) {
    console.log(`\n📄 Full report saved to: ${reportPath}\n`);
  }

  // Exit with appropriate code
  process.exit(report.summary.mismatches > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verify, VerificationReport, CountResult };
