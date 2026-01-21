#!/usr/bin/env tsx

/**
 * Update Documentation Counts Script
 *
 * Automatically updates skill/agent/tool counts in README.md, CLAUDE.md, and package.json
 * based on actual counts from the codebase. Creates backups before modification.
 *
 * Usage:
 *   npm run update:counts
 *   tsx scripts/update-documentation-counts.ts
 *   tsx scripts/update-documentation-counts.ts --dry-run
 *   tsx scripts/update-documentation-counts.ts --verbose
 *
 * Exit codes:
 *   0 - Updates successful or dry-run completed
 *   1 - Update failed
 *
 * @author Agentic QE Team
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { verify } from './verify-counts';

interface UpdateOperation {
  file: string;
  pattern: RegExp;
  replacement: string;
  description: string;
  line?: number;
}

interface UpdateReport {
  timestamp: string;
  dryRun: boolean;
  operations: UpdateOperation[];
  backups: string[];
  errors: string[];
  success: boolean;
}

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Create backup of file
 */
function createBackup(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  fs.copyFileSync(filePath, backupPath);

  return backupPath;
}

/**
 * Count files by type
 */
function getCounts() {
  const skillsDir = path.join(PROJECT_ROOT, '.claude', 'skills');
  const agentsDir = path.join(PROJECT_ROOT, '.claude', 'agents');
  const toolsFile = path.join(PROJECT_ROOT, 'src', 'mcp', 'tools.ts');

  // Count skills
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

  const allSkills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    : [];

  const qeSkills = allSkills.filter(skill => qeSkillPatterns.includes(skill));
  const phase1Count = allSkills.filter(skill => phase1Skills.includes(skill)).length;
  const phase2Count = qeSkills.length - phase1Count;

  // Count agents (QE agents have qe- prefix)
  let qeAgents = 0;
  const scanForQEAgents = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForQEAgents(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('qe-') && entry.name.endsWith('.md')) {
        qeAgents++;
      }
    }
  };
  scanForQEAgents(agentsDir);

  // Count MCP tools
  let mcpTools = 0;
  if (fs.existsSync(toolsFile)) {
    const content = fs.readFileSync(toolsFile, 'utf-8');
    const toolMatches = content.match(/name:\s*['"]mcp__agentic_qe__[^'"]+['"]/g);
    mcpTools = toolMatches ? toolMatches.length : 0;
  }

  return {
    skills: {
      total: allSkills.length,
      qe: qeSkills.length,
      phase1: phase1Count,
      phase2: phase2Count
    },
    agents: {
      qe: qeAgents
    },
    tools: {
      mcp: mcpTools
    }
  };
}

/**
 * Generate update operations
 */
function generateUpdates(counts: ReturnType<typeof getCounts>): UpdateOperation[] {
  const operations: UpdateOperation[] = [];

  const readmePath = path.join(PROJECT_ROOT, 'README.md');
  const claudePath = path.join(PROJECT_ROOT, 'CLAUDE.md');
  const packagePath = path.join(PROJECT_ROOT, 'package.json');

  // README.md updates
  operations.push(
    {
      file: readmePath,
      pattern: /🔧\s+\*\*(\d+)\s+MCP\s+Tools\*\*/,
      replacement: `🔧 **${counts.tools.mcp} MCP Tools**`,
      description: 'Update MCP tools count in README header'
    },
    {
      file: readmePath,
      pattern: /📚\s+\*\*(\d+)\s+World-Class\s+QE\s+Skills\*\*/,
      replacement: `📚 **${counts.skills.qe} World-Class QE Skills**`,
      description: 'Update QE skills count in README header'
    },
    {
      file: readmePath,
      pattern: /Total\s+QE\s+Skills:\s+(\d+)/,
      replacement: `Total QE Skills: ${counts.skills.qe}`,
      description: 'Update total QE skills'
    },
    {
      file: readmePath,
      pattern: /Phase\s+1:.*?\((\d+)\s+skills?\)/i,
      replacement: (match: string) => match.replace(/\d+/, counts.skills.phase1.toString()),
      description: 'Update Phase 1 skills count'
    },
    {
      file: readmePath,
      pattern: /Phase\s+2:.*?\((\d+)\s+(?:NEW\s+)?skills?\)/i,
      replacement: (match: string) => match.replace(/\d+/, counts.skills.phase2.toString()),
      description: 'Update Phase 2 skills count'
    },
    {
      file: readmePath,
      pattern: /(\d+)\s+Claude\s+Skills\s+Total/i,
      replacement: `${counts.skills.total} Claude Skills Total`,
      description: 'Update total skills count'
    }
  );

  // CLAUDE.md updates
  operations.push(
    {
      file: claudePath,
      pattern: /(\d+)\s+specialized\s+QE\s+skills/i,
      replacement: `${counts.skills.qe} specialized QE skills`,
      description: 'Update QE skills count in CLAUDE.md'
    },
    {
      file: claudePath,
      pattern: /(\d+)\s+specialized\s+QE\s+agents/i,
      replacement: `${counts.agents.qe} specialized QE agents`,
      description: 'Update QE agents count in CLAUDE.md'
    }
  );

  // package.json update
  operations.push({
    file: packagePath,
    pattern: /("description":\s*"[^"]*?)\d+(\s+MCP\s+[Tt]ools[^"]*")/,
    replacement: `$1${counts.tools.mcp}$2`,
    description: 'Update MCP tools count in package.json description'
  });

  return operations;
}

/**
 * Apply updates to files
 */
function applyUpdates(operations: UpdateOperation[]): UpdateReport {
  const report: UpdateReport = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    operations: [],
    backups: [],
    errors: [],
    success: true
  };

  const fileContents = new Map<string, string>();

  try {
    // Load all files
    const files = new Set(operations.map(op => op.file));
    for (const file of files) {
      if (fs.existsSync(file)) {
        fileContents.set(file, fs.readFileSync(file, 'utf-8'));
      } else {
        report.errors.push(`File not found: ${file}`);
        report.success = false;
      }
    }

    // Apply each operation
    for (const operation of operations) {
      const content = fileContents.get(operation.file);
      if (!content) continue;

      const match = content.match(operation.pattern);
      if (match) {
        const newContent = content.replace(
          operation.pattern,
          typeof operation.replacement === 'function'
            ? operation.replacement(match[0])
            : operation.replacement
        );

        fileContents.set(operation.file, newContent);
        report.operations.push(operation);

        if (VERBOSE) {
          console.log(`✓ ${operation.description}`);
          console.log(`  Pattern matched: ${match[0]}`);
        }
      } else {
        if (VERBOSE) {
          console.log(`⚠ ${operation.description} - Pattern not found`);
        }
      }
    }

    // Write files (unless dry-run)
    if (!DRY_RUN) {
      for (const [file, content] of fileContents.entries()) {
        const backup = createBackup(file);
        report.backups.push(backup);
        fs.writeFileSync(file, content, 'utf-8');
      }
    }

  } catch (error) {
    report.errors.push(`Update error: ${error}`);
    report.success = false;
  }

  return report;
}

/**
 * Display update report
 */
function displayReport(report: UpdateReport): void {
  console.log('\n' + '='.repeat(80));
  console.log(DRY_RUN ? 'DOCUMENTATION UPDATE PREVIEW (DRY RUN)' : 'DOCUMENTATION UPDATE REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${report.timestamp}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  }

  console.log(`✅ Operations to apply: ${report.operations.length}\n`);

  // Group by file
  const byFile = new Map<string, UpdateOperation[]>();
  for (const op of report.operations) {
    if (!byFile.has(op.file)) {
      byFile.set(op.file, []);
    }
    byFile.get(op.file)!.push(op);
  }

  for (const [file, ops] of byFile.entries()) {
    console.log(`📄 ${path.relative(PROJECT_ROOT, file)}`);
    console.log('-'.repeat(80));
    for (const op of ops) {
      console.log(`  ✓ ${op.description}`);
    }
    console.log('');
  }

  if (report.backups.length > 0) {
    console.log('💾 BACKUPS CREATED:');
    console.log('-'.repeat(80));
    for (const backup of report.backups) {
      console.log(`  ${path.relative(PROJECT_ROOT, backup)}`);
    }
    console.log('');
  }

  if (report.errors.length > 0) {
    console.log('❌ ERRORS:');
    console.log('-'.repeat(80));
    for (const error of report.errors) {
      console.log(`  ${error}`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`Status: ${report.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('='.repeat(80) + '\n');

  if (DRY_RUN) {
    console.log('To apply these changes, run without --dry-run flag:\n');
    console.log('  npm run update:counts\n');
  } else if (report.success) {
    console.log('✅ Documentation updated successfully!\n');
    console.log('Run verification to confirm:\n');
    console.log('  npm run verify:counts\n');
  }
}

/**
 * Main execution
 */
function main(): void {
  console.log('\n🔍 Scanning codebase for counts...\n');

  const counts = getCounts();

  console.log('📊 Current Counts:');
  console.log(`  Skills (Total): ${counts.skills.total}`);
  console.log(`  Skills (QE): ${counts.skills.qe}`);
  console.log(`  Skills (Phase 1): ${counts.skills.phase1}`);
  console.log(`  Skills (Phase 2): ${counts.skills.phase2}`);
  console.log(`  Agents (QE): ${counts.agents.qe}`);
  console.log(`  MCP Tools: ${counts.tools.mcp}\n`);

  const operations = generateUpdates(counts);
  const report = applyUpdates(operations);

  displayReport(report);

  // Save report
  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `update-counts-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (VERBOSE) {
    console.log(`📄 Full report saved to: ${path.relative(PROJECT_ROOT, reportPath)}\n`);
  }

  // Exit with appropriate code
  process.exit(report.success ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { applyUpdates, UpdateReport, UpdateOperation };
