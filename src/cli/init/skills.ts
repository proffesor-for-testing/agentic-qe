/**
 * Skills template management
 * Copies QE Fleet skill templates from package to user project
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function copySkillTemplates(force: boolean = false): Promise<void> {
  console.log(chalk.cyan('  🎯 Copying QE Fleet skills...'));

  // Find package location
  const possiblePaths = [
    path.join(__dirname, '../../../.claude/skills'),
    path.join(process.cwd(), 'node_modules/agentic-qe/.claude/skills'),
    path.join(process.cwd(), '../agentic-qe/.claude/skills')
  ];

  let sourcePath: string | null = null;
  for (const p of possiblePaths) {
    if (await fs.pathExists(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.warn(chalk.yellow('  ⚠️  Skills not found - skipping'));
    return;
  }

  const targetPath = path.join(process.cwd(), '.claude/skills');
  await fs.ensureDir(targetPath);

  // QE-specific skill patterns (NOT claude-flow, github, flow-nexus, agentdb-*, hive-mind, hooks, performance-analysis, reasoningbank-*, sparc-methodology)
  // Total: 41 QE skills (updated from 40 - added testability-scoring contributed by @fndlalit)
  const QE_SKILL_PATTERNS = [
    /^accessibility-testing$/,
    /^agentic-quality-engineering$/,
    /^api-testing-patterns$/,
    /^brutal-honesty-review$/,
    /^bug-reporting-excellence$/,
    /^chaos-engineering-resilience$/,
    /^cicd-pipeline-qe-orchestrator$/,
    /^code-review-quality$/,
    /^compatibility-testing$/,
    /^compliance-testing$/,
    /^consultancy-practices$/,
    /^context-driven-testing$/,
    /^contract-testing$/,
    /^database-testing$/,
    /^exploratory-testing-advanced$/,
    /^holistic-testing-pact$/,
    /^localization-testing$/,
    /^mobile-testing$/,
    /^mutation-testing$/,
    /^pair-programming$/,
    /^performance-testing$/,  // QE performance testing (NOT performance-analysis which is Claude Flow)
    /^quality-metrics$/,
    /^refactoring-patterns$/,
    /^regression-testing$/,
    /^risk-based-testing$/,
    /^security-testing$/,
    /^sherlock-review$/,
    /^shift-left-testing$/,
    /^shift-right-testing$/,
    /^six-thinking-hats$/,
    /^tdd-london-chicago$/,
    /^technical-writing$/,
    /^test-automation-strategy$/,
    /^testability-scoring$/,  // Contributed by @fndlalit - https://github.com/fndlalit
    /^test-data-management$/,
    /^test-design-techniques$/,
    /^test-environment-management$/,
    /^test-reporting-analytics$/,
    /^verification-quality$/,
    /^visual-testing-advanced$/,
    /^xp-practices$/
  ];

  const isQESkill = (name: string): boolean => {
    return QE_SKILL_PATTERNS.some(pattern => pattern.test(name));
  };

  // Copy only QE skill directories
  const items = await fs.readdir(sourcePath);
  let copied = 0;
  let skipped = 0;

  for (const item of items) {
    const itemPath = path.join(sourcePath, item);
    const stats = await fs.stat(itemPath);

    if (stats.isDirectory() && isQESkill(item)) {
      const targetDir = path.join(targetPath, item);
      if (!await fs.pathExists(targetDir) || force) {
        await fs.copy(itemPath, targetDir);
        copied++;
      }
    } else if (stats.isDirectory()) {
      skipped++;
    }
  }

  console.log(chalk.green(`  ✓ Copied ${copied} QE skills`));
  if (skipped > 0) {
    console.log(chalk.gray(`  ℹ️  Skipped ${skipped} non-QE skills (claude-flow, github, flow-nexus, etc.)`));
  }
}
