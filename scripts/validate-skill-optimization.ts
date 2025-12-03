#!/usr/bin/env ts-node
/**
 * Skill Optimization Validation Script
 *
 * Validates Agentic QE skills against optimization standards for Claude 4.5.
 * Checks for required sections, token estimates, agent associations, and generates
 * optimization reports with before/after metrics.
 *
 * Usage:
 *   npm run validate-skill [skill-path]           # Single skill
 *   npm run validate-all-skills                   # All 41 skills
 *   npm run validate-skill -- --report            # Generate detailed report
 *   npm run validate-skill -- --fix               # Auto-fix common issues
 *
 * @version 1.0.0
 * @date 2025-12-02
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Type Definitions
// ============================================================================

interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tokenEstimate: number;
  agents: string[];
  implementation_status: 'draft' | 'baseline' | 'optimized' | 'production';
  optimization_version?: string;
  last_optimized?: string;
  dependencies?: string[];
  quick_reference_card?: boolean;
  tags?: string[];
}

interface ValidationResult {
  skillPath: string;
  skillName: string;
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metrics: SkillMetrics;
  sections: SectionChecks;
  optimization: OptimizationMetrics;
}

interface ValidationError {
  type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  fixable: boolean;
}

interface ValidationWarning {
  type: string;
  message: string;
  recommendation: string;
}

interface SkillMetrics {
  estimatedTokens: number;
  actualWordCount: number;
  sectionCount: number;
  codeBlockCount: number;
  hasQuickReference: boolean;
  hasAgentCoordination: boolean;
  hasDefaultToAction: boolean;
}

interface SectionChecks {
  yamlFrontmatter: boolean;
  defaultToAction: boolean;
  quickReferenceCard: boolean;
  agentCoordination: boolean;
  coreContent: boolean;
  examples: boolean;
  relatedSkills: boolean;
}

interface OptimizationMetrics {
  status: string;
  baselineTokens?: number;
  currentTokens: number;
  reductionPercent?: number;
  targetMet: boolean;
  lastOptimized?: string;
}

interface ManifestSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  file: string;
  tokenEstimate: number;
  tags: string[];
  dependencies: string[];
  agents: string[];
}

interface SkillsManifest {
  version: string;
  totalSkills: number;
  skills: { [key: string]: ManifestSkill };
}

interface OptimizationReport {
  totalSkills: number;
  optimized: number;
  inProgress: number;
  baseline: number;
  draft: number;
  tokensSaved: number;
  avgReduction: number;
  skills: ValidationResult[];
}

// ============================================================================
// Constants
// ============================================================================

const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');
const MANIFEST_PATH = path.join(SKILLS_DIR, 'skills-manifest.json');
const TARGET_REDUCTION = 0.45; // 45% reduction target (40-50% range midpoint)
const MAX_TOKENS = 1500; // Maximum tokens for optimized skills
const REQUIRED_SECTIONS = [
  'default_to_action',
  'quick_reference_card',
  'agent_coordination',
];

// Token estimation (rough approximation: 1 token ≈ 0.75 words)
const WORDS_PER_TOKEN = 0.75;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Read and parse YAML frontmatter from markdown file
 */
function parseFrontmatter(content: string): { metadata: SkillMetadata | null; content: string } {
  const frontmatterRegex = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: null, content };
  }

  try {
    const metadata = yaml.load(match[1]) as SkillMetadata;
    const mainContent = match[2];
    return { metadata, content: mainContent };
  } catch (error) {
    console.error('Failed to parse YAML frontmatter:', error);
    return { metadata: null, content };
  }
}

/**
 * Estimate token count from word count
 */
function estimateTokens(content: string): number {
  const wordCount = content.split(/\s+/).length;
  return Math.round(wordCount * WORDS_PER_TOKEN);
}

/**
 * Count code blocks in content
 */
function countCodeBlocks(content: string): number {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = content.match(codeBlockRegex);
  return matches ? matches.length : 0;
}

/**
 * Check if section exists in content
 */
function hasSectionMarker(content: string, marker: string): boolean {
  const patterns = {
    default_to_action: /<default_to_action>/i,
    quick_reference_card: /##\s*Quick Reference Card/i,
    agent_coordination: /##\s*Agent Coordination/i,
    core_content: /##\s*(Core Concepts|Implementation|Patterns)/i,
    examples: /##\s*Examples/i,
    related_skills: /##\s*Related Skills/i,
  };

  const pattern = patterns[marker as keyof typeof patterns];
  return pattern ? pattern.test(content) : false;
}

/**
 * Extract sections from markdown content
 */
function extractSections(content: string): { [key: string]: string } {
  const sections: { [key: string]: string } = {};
  const headerRegex = /^##\s+(.+)$/gm;
  const matches = [...content.matchAll(headerRegex)];

  for (let i = 0; i < matches.length; i++) {
    const sectionName = matches[i][1].toLowerCase().replace(/\s+/g, '_');
    const startIndex = matches[i].index!;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length;
    sections[sectionName] = content.substring(startIndex, endIndex);
  }

  return sections;
}

/**
 * Load skills manifest
 */
function loadManifest(): SkillsManifest | null {
  try {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(manifestContent) as SkillsManifest;
  } catch (error) {
    console.error('Failed to load skills manifest:', error);
    return null;
  }
}

/**
 * Find all skill files
 */
function findSkillFiles(): string[] {
  const skillFiles: string[] = [];

  function searchDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        searchDir(fullPath);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        skillFiles.push(fullPath);
      }
    }
  }

  searchDir(SKILLS_DIR);
  return skillFiles;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate YAML frontmatter
 */
function validateFrontmatter(
  metadata: SkillMetadata | null,
  manifestSkill: ManifestSkill | null
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!metadata) {
    errors.push({
      type: 'missing_frontmatter',
      message: 'YAML frontmatter is missing',
      severity: 'critical',
      fixable: true,
    });
    return errors;
  }

  // Required fields
  const requiredFields: (keyof SkillMetadata)[] = [
    'name',
    'description',
    'category',
    'priority',
    'tokenEstimate',
    'agents',
    'implementation_status',
  ];

  for (const field of requiredFields) {
    if (!metadata[field]) {
      errors.push({
        type: 'missing_field',
        message: `Required field '${field}' is missing from frontmatter`,
        severity: 'high',
        fixable: false,
      });
    }
  }

  // Validate token estimate
  if (metadata.tokenEstimate && metadata.tokenEstimate > MAX_TOKENS) {
    errors.push({
      type: 'token_limit_exceeded',
      message: `Token estimate ${metadata.tokenEstimate} exceeds maximum ${MAX_TOKENS}`,
      severity: 'medium',
      fixable: false,
    });
  }

  // Validate agents against manifest
  if (manifestSkill && metadata.agents) {
    const manifestAgents = manifestSkill.agents;
    const missingAgents = manifestAgents.filter((a) => !metadata.agents.includes(a));
    const extraAgents = metadata.agents.filter((a) => !manifestAgents.includes(a));

    if (missingAgents.length > 0) {
      errors.push({
        type: 'agent_mismatch',
        message: `Missing agents from manifest: ${missingAgents.join(', ')}`,
        severity: 'medium',
        fixable: true,
      });
    }

    if (extraAgents.length > 0) {
      errors.push({
        type: 'agent_mismatch',
        message: `Extra agents not in manifest: ${extraAgents.join(', ')}`,
        severity: 'medium',
        fixable: true,
      });
    }
  }

  return errors;
}

/**
 * Validate required sections
 */
function validateSections(content: string, metadata: SkillMetadata | null): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for <default_to_action>
  if (!hasSectionMarker(content, 'default_to_action')) {
    errors.push({
      type: 'missing_section',
      message: '<default_to_action> block is missing',
      severity: 'high',
      fixable: false,
    });
  }

  // Check for Quick Reference Card
  if (!hasSectionMarker(content, 'quick_reference_card')) {
    errors.push({
      type: 'missing_section',
      message: 'Quick Reference Card section is missing',
      severity: 'high',
      fixable: false,
    });
  }

  // Check for Agent Coordination
  if (!hasSectionMarker(content, 'agent_coordination')) {
    errors.push({
      type: 'missing_section',
      message: 'Agent Coordination section is missing',
      severity: 'high',
      fixable: false,
    });
  }

  // Check quick_reference_card metadata flag
  if (
    metadata &&
    metadata.implementation_status === 'optimized' &&
    !metadata.quick_reference_card
  ) {
    errors.push({
      type: 'metadata_mismatch',
      message: 'quick_reference_card should be true for optimized skills',
      severity: 'medium',
      fixable: true,
    });
  }

  return errors;
}

/**
 * Validate optimization status
 */
function validateOptimization(
  metadata: SkillMetadata | null,
  estimatedTokens: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!metadata) {
    return errors;
  }

  // Check if optimization metadata is present for optimized skills
  if (metadata.implementation_status === 'optimized') {
    if (!metadata.optimization_version) {
      errors.push({
        type: 'missing_optimization_metadata',
        message: 'optimization_version is required for optimized skills',
        severity: 'medium',
        fixable: true,
      });
    }

    if (!metadata.last_optimized) {
      errors.push({
        type: 'missing_optimization_metadata',
        message: 'last_optimized date is required for optimized skills',
        severity: 'medium',
        fixable: true,
      });
    }
  }

  // Check token estimate accuracy
  const tokenDifference = Math.abs(estimatedTokens - metadata.tokenEstimate);
  const tokenDifferencePercent = tokenDifference / metadata.tokenEstimate;

  if (tokenDifferencePercent > 0.2) {
    // More than 20% difference
    errors.push({
      type: 'token_estimate_inaccurate',
      message: `Token estimate ${metadata.tokenEstimate} differs significantly from actual ${estimatedTokens}`,
      severity: 'medium',
      fixable: true,
    });
  }

  return errors;
}

/**
 * Generate warnings for optimization opportunities
 */
function generateWarnings(
  metadata: SkillMetadata | null,
  content: string,
  estimatedTokens: number
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!metadata) {
    return warnings;
  }

  // Warn about non-optimized skills
  if (metadata.implementation_status === 'baseline') {
    warnings.push({
      type: 'optimization_opportunity',
      message: 'Skill has not been optimized yet',
      recommendation: 'Apply Claude 4.5 optimization patterns to reduce token count by 40-50%',
    });
  }

  // Warn about high token count
  if (estimatedTokens > MAX_TOKENS) {
    warnings.push({
      type: 'high_token_count',
      message: `Estimated tokens ${estimatedTokens} exceeds recommended maximum ${MAX_TOKENS}`,
      recommendation: 'Consider compressing verbose sections, using tables, and consolidating examples',
    });
  }

  // Warn about missing code examples
  const codeBlockCount = countCodeBlocks(content);
  if (codeBlockCount === 0) {
    warnings.push({
      type: 'missing_examples',
      message: 'No code examples found',
      recommendation: 'Add minimal, focused code examples to demonstrate key concepts',
    });
  }

  // Warn about potential verbosity
  const avgWordsPerSection = content.split(/^##/m).length;
  if (avgWordsPerSection > 500) {
    warnings.push({
      type: 'verbose_content',
      message: 'Sections appear verbose',
      recommendation: 'Use bullet points, tables, and concise language to reduce verbosity',
    });
  }

  return warnings;
}

/**
 * Validate a single skill file
 */
function validateSkill(skillPath: string, manifest: SkillsManifest | null): ValidationResult {
  const skillName = path.basename(path.dirname(skillPath));
  const content = fs.readFileSync(skillPath, 'utf-8');
  const { metadata, content: mainContent } = parseFrontmatter(content);

  // Find corresponding manifest entry
  const manifestSkill = manifest ? manifest.skills[skillName] || null : null;

  // Calculate metrics
  const estimatedTokens = estimateTokens(mainContent);
  const wordCount = mainContent.split(/\s+/).length;
  const codeBlockCount = countCodeBlocks(mainContent);

  const metrics: SkillMetrics = {
    estimatedTokens,
    actualWordCount: wordCount,
    sectionCount: (mainContent.match(/^##\s/gm) || []).length,
    codeBlockCount,
    hasQuickReference: hasSectionMarker(mainContent, 'quick_reference_card'),
    hasAgentCoordination: hasSectionMarker(mainContent, 'agent_coordination'),
    hasDefaultToAction: hasSectionMarker(mainContent, 'default_to_action'),
  };

  const sections: SectionChecks = {
    yamlFrontmatter: metadata !== null,
    defaultToAction: metrics.hasDefaultToAction,
    quickReferenceCard: metrics.hasQuickReference,
    agentCoordination: metrics.hasAgentCoordination,
    coreContent: hasSectionMarker(mainContent, 'core_content'),
    examples: hasSectionMarker(mainContent, 'examples'),
    relatedSkills: hasSectionMarker(mainContent, 'related_skills'),
  };

  // Run validations
  const errors: ValidationError[] = [
    ...validateFrontmatter(metadata, manifestSkill),
    ...validateSections(mainContent, metadata),
    ...validateOptimization(metadata, estimatedTokens),
  ];

  const warnings = generateWarnings(metadata, mainContent, estimatedTokens);

  // Calculate optimization metrics
  const optimization: OptimizationMetrics = {
    status: metadata?.implementation_status || 'unknown',
    currentTokens: estimatedTokens,
    targetMet: estimatedTokens <= MAX_TOKENS,
    lastOptimized: metadata?.last_optimized,
  };

  // Calculate reduction if we have baseline data
  if (manifestSkill && manifestSkill.tokenEstimate) {
    optimization.baselineTokens = manifestSkill.tokenEstimate;
    optimization.reductionPercent =
      ((manifestSkill.tokenEstimate - estimatedTokens) / manifestSkill.tokenEstimate) * 100;
  }

  const passed = errors.filter((e) => e.severity === 'critical' || e.severity === 'high').length === 0;

  return {
    skillPath,
    skillName,
    passed,
    errors,
    warnings,
    metrics,
    sections,
    optimization,
  };
}

// ============================================================================
// Reporting Functions
// ============================================================================

/**
 * Print validation result for single skill
 */
function printValidationResult(result: ValidationResult, verbose: boolean = false) {
  const status = result.passed ? '✅ PASSED' : '❌ FAILED';
  const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m';
  const resetColor = '\x1b[0m';

  console.log(`\n${statusColor}${status}${resetColor} ${result.skillName}`);
  console.log(`  Path: ${result.skillPath}`);
  console.log(`  Status: ${result.optimization.status}`);
  console.log(`  Tokens: ${result.metrics.estimatedTokens} (Target: ≤${MAX_TOKENS})`);

  if (result.optimization.baselineTokens) {
    const reduction = result.optimization.reductionPercent?.toFixed(1) || '0';
    console.log(`  Reduction: ${reduction}% from baseline (${result.optimization.baselineTokens} tokens)`);
  }

  // Print errors
  if (result.errors.length > 0) {
    console.log(`\n  Errors (${result.errors.length}):`);
    for (const error of result.errors) {
      const severityColor = error.severity === 'critical' ? '\x1b[31m' : '\x1b[33m';
      const fixable = error.fixable ? '[FIXABLE]' : '';
      console.log(`    ${severityColor}[${error.severity.toUpperCase()}]${resetColor} ${error.message} ${fixable}`);
    }
  }

  // Print warnings
  if (result.warnings.length > 0 && verbose) {
    console.log(`\n  Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      console.log(`    ⚠️  ${warning.message}`);
      console.log(`       → ${warning.recommendation}`);
    }
  }

  // Print section checks
  if (verbose) {
    console.log(`\n  Sections:`);
    console.log(`    YAML Frontmatter: ${result.sections.yamlFrontmatter ? '✅' : '❌'}`);
    console.log(`    <default_to_action>: ${result.sections.defaultToAction ? '✅' : '❌'}`);
    console.log(`    Quick Reference Card: ${result.sections.quickReferenceCard ? '✅' : '❌'}`);
    console.log(`    Agent Coordination: ${result.sections.agentCoordination ? '✅' : '❌'}`);
    console.log(`    Core Content: ${result.sections.coreContent ? '✅' : '❌'}`);
    console.log(`    Examples: ${result.sections.examples ? '✅' : '❌'}`);
    console.log(`    Related Skills: ${result.sections.relatedSkills ? '✅' : '❌'}`);
  }
}

/**
 * Generate optimization report for all skills
 */
function generateOptimizationReport(results: ValidationResult[]): OptimizationReport {
  const statusCounts = {
    optimized: 0,
    inProgress: 0,
    baseline: 0,
    draft: 0,
  };

  let totalBaselineTokens = 0;
  let totalCurrentTokens = 0;

  for (const result of results) {
    const status = result.optimization.status;

    if (status === 'optimized' || status === 'production') {
      statusCounts.optimized++;
    } else if (status === 'baseline') {
      statusCounts.baseline++;
    } else if (status === 'draft') {
      statusCounts.draft++;
    }

    if (result.optimization.baselineTokens) {
      totalBaselineTokens += result.optimization.baselineTokens;
    }
    totalCurrentTokens += result.optimization.currentTokens;
  }

  const tokensSaved = totalBaselineTokens - totalCurrentTokens;
  const avgReduction = totalBaselineTokens > 0 ? (tokensSaved / totalBaselineTokens) * 100 : 0;

  return {
    totalSkills: results.length,
    optimized: statusCounts.optimized,
    inProgress: statusCounts.inProgress,
    baseline: statusCounts.baseline,
    draft: statusCounts.draft,
    tokensSaved,
    avgReduction,
    skills: results,
  };
}

/**
 * Print optimization report
 */
function printOptimizationReport(report: OptimizationReport) {
  console.log('\n' + '='.repeat(80));
  console.log('SKILL OPTIMIZATION REPORT');
  console.log('='.repeat(80));

  console.log(`\nTotal Skills: ${report.totalSkills}`);
  console.log(`  ✅ Optimized: ${report.optimized}`);
  console.log(`  📝 Baseline: ${report.baseline}`);
  console.log(`  ⚠️  Draft: ${report.draft}`);

  const optimizedPercent = ((report.optimized / report.totalSkills) * 100).toFixed(1);
  console.log(`\nOptimization Progress: ${optimizedPercent}%`);

  if (report.tokensSaved > 0) {
    console.log(`\nToken Savings: ${report.tokensSaved.toLocaleString()} tokens saved`);
    console.log(`Average Reduction: ${report.avgReduction.toFixed(1)}%`);

    const targetMet = report.avgReduction >= TARGET_REDUCTION * 100;
    const targetStatus = targetMet ? '✅ TARGET MET' : '⚠️  BELOW TARGET';
    console.log(`Target (${(TARGET_REDUCTION * 100).toFixed(0)}%): ${targetStatus}`);
  }

  // Top performers
  const sortedByReduction = report.skills
    .filter((s) => s.optimization.reductionPercent !== undefined)
    .sort((a, b) => (b.optimization.reductionPercent || 0) - (a.optimization.reductionPercent || 0));

  if (sortedByReduction.length > 0) {
    console.log('\nTop Optimizations:');
    for (let i = 0; i < Math.min(5, sortedByReduction.length); i++) {
      const skill = sortedByReduction[i];
      const reduction = skill.optimization.reductionPercent?.toFixed(1) || '0';
      console.log(`  ${i + 1}. ${skill.skillName}: ${reduction}% reduction`);
    }
  }

  // Skills needing attention
  const needsOptimization = report.skills.filter(
    (s) => s.optimization.status === 'baseline' || s.optimization.status === 'draft'
  );

  if (needsOptimization.length > 0) {
    console.log(`\nSkills Needing Optimization (${needsOptimization.length}):`);
    for (const skill of needsOptimization.slice(0, 10)) {
      console.log(`  • ${skill.skillName} (${skill.optimization.currentTokens} tokens)`);
    }
    if (needsOptimization.length > 10) {
      console.log(`  ... and ${needsOptimization.length - 10} more`);
    }
  }

  // Failed validations
  const failed = report.skills.filter((s) => !s.passed);
  if (failed.length > 0) {
    console.log(`\n❌ Failed Validations (${failed.length}):`);
    for (const skill of failed) {
      const criticalErrors = skill.errors.filter(
        (e) => e.severity === 'critical' || e.severity === 'high'
      ).length;
      console.log(`  • ${skill.skillName}: ${criticalErrors} critical/high issues`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = {
    report: args.includes('--report'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    fix: args.includes('--fix'),
  };

  // Get skill path(s)
  const skillPaths = args.filter((arg) => !arg.startsWith('--') && !arg.startsWith('-'));

  // Load manifest
  const manifest = loadManifest();
  if (!manifest) {
    console.error('Failed to load skills manifest. Exiting.');
    process.exit(1);
  }

  let results: ValidationResult[];

  if (skillPaths.length === 0) {
    // Validate all skills
    console.log('Validating all skills...\n');
    const allSkillFiles = findSkillFiles();
    results = allSkillFiles.map((skillPath) => validateSkill(skillPath, manifest));
  } else {
    // Validate specific skills
    results = skillPaths.map((skillPath) => {
      const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(process.cwd(), skillPath);
      return validateSkill(fullPath, manifest);
    });
  }

  // Print results
  if (flags.report) {
    const report = generateOptimizationReport(results);
    printOptimizationReport(report);
  } else {
    for (const result of results) {
      printValidationResult(result, flags.verbose);
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    console.log('\n' + '='.repeat(80));
    console.log(`Summary: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('='.repeat(80));
  }

  // Exit with error code if any validations failed
  const hasFailures = results.some((r) => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  validateSkill,
  generateOptimizationReport,
  loadManifest,
  findSkillFiles,
  type ValidationResult,
  type OptimizationReport,
  type SkillMetadata,
};
