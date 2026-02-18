#!/usr/bin/env npx tsx
/**
 * Eval-Driven Development Workflow
 *
 * Enables the eval-driven development loop: baseline → write skill → compare.
 * Two subcommands:
 *   init    — Bootstrap eval scaffolding for a skill from its SKILL.md
 *   compare — Compare two eval run JSON files (before/after)
 *
 * Usage:
 *   npx tsx scripts/eval-driven-workflow.ts init <skill-name>
 *   npx tsx scripts/eval-driven-workflow.ts compare <before.json> <after.json>
 *   npx tsx scripts/eval-driven-workflow.ts --help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// CONSTANTS
// ============================================================================

const SKILLS_DIR = '.claude/skills';
const PLATFORM_PREFIXES = ['v3-', 'flow-nexus-', 'agentdb-', 'reasoningbank-', 'swarm-'];

// ============================================================================
// FRONTMATTER PARSER (shared pattern from score-skill-quality.ts)
// ============================================================================

function parseYamlFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  let inNested = false;
  let nestedKey = '';
  const nestedObj: Record<string, unknown> = {};

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);

    if (indent > 0 && inNested) {
      const kv = line.trim().match(/^([\w_]+):\s*(.+)$/);
      if (kv) nestedObj[kv[1]] = parseYamlValue(kv[2]);
      continue;
    }
    if (indent === 0 && inNested) {
      result[nestedKey] = { ...nestedObj };
      inNested = false;
    }

    const kv = line.trim().match(/^([\w_]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      if (!value || value.trim() === '') {
        inNested = true;
        nestedKey = key;
        Object.keys(nestedObj).forEach(k => delete nestedObj[k]);
      } else {
        result[key] = parseYamlValue(value.trim());
      }
    }
  }
  if (inNested) result[nestedKey] = { ...nestedObj };
  return result;
}

function parseYamlValue(value: string): unknown {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']'))
    return t.slice(1, -1).split(',').map(i => {
      const s = i.trim();
      return (s.startsWith('"') || s.startsWith("'")) ? s.slice(1, -1) : s;
    });
  if (t === 'true') return true;
  if (t === 'false') return false;
  const n = Number(t);
  if (!isNaN(n) && t !== '') return n;
  return t;
}

// ============================================================================
// PROJECT ROOT
// ============================================================================

function getProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/** Extract meaningful keywords from SKILL.md body for must_contain assertions */
function extractKeywords(body: string, frontmatter: Record<string, unknown>): string[] {
  const keywords = new Set<string>();

  // Extract tool/standard names commonly referenced in skills
  const toolPatterns = [
    /\b(owasp|pact|k6|artillery|jmeter|wcag|jest|vitest|playwright|cypress)\b/gi,
    /\b(supertest|graphql|rest|grpc|openapi|swagger|postman|cucumber|gherkin)\b/gi,
    /\b(bdd|tdd|mutation|stryker|sonarqube|eslint|docker|kubernetes|terraform)\b/gi,
    /\b(kafka|rabbitmq|redis|postgresql|mongodb|oauth|jwt|saml)\b/gi,
    /\b(xss|sqli|csrf|ssrf|sast|dast|sca|sbom|cve)\b/gi,
    /\b(MCP|hooks|pre-edit|post-edit|session|memory|neural|swarm|agent)\b/gi,
  ];

  for (const pattern of toolPatterns) {
    const matches = body.match(pattern);
    if (matches) {
      for (const m of matches) keywords.add(m.toLowerCase());
    }
  }

  // Extract markdown headings as domain keywords
  const headings = body.match(/^#{1,3}\s+(.+)$/gm);
  if (headings) {
    for (const h of headings.slice(0, 8)) {
      const text = h.replace(/^#+\s+/, '').trim().toLowerCase();
      if (text.length > 3 && text.length < 40) keywords.add(text);
    }
  }

  // Add tags from frontmatter
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  for (const tag of tags) {
    if (typeof tag === 'string') keywords.add(tag.toLowerCase());
  }

  return [...keywords].slice(0, 12);
}

/** Extract the primary capability description from SKILL.md body */
function extractPrimaryCapability(body: string): string {
  // Look for "What This Skill Does" or first substantial paragraph
  const whatMatch = body.match(/##\s*What This Skill Does\s*\n+([\s\S]*?)(?=\n##|\n\*\*Key)/);
  if (whatMatch) return whatMatch[1].trim().split('\n')[0];

  // Fall back to first paragraph after the title
  const firstPara = body.match(/^#[^#].*\n+([A-Z][\s\S]*?)(?=\n\n|\n##)/m);
  if (firstPara) return firstPara[1].trim().split('\n')[0];

  return 'the primary functionality described in SKILL.md';
}

// ============================================================================
// INIT SUBCOMMAND
// ============================================================================

function runInit(skillName: string): void {
  const projectRoot = getProjectRoot();
  const skillDir = join(projectRoot, SKILLS_DIR, skillName);

  // 1. Validate skill exists
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    console.error(`Error: Skill directory not found: ${SKILLS_DIR}/${skillName}`);
    console.error(`  Available skills are in ${SKILLS_DIR}/`);
    process.exit(1);
  }

  // Check it's not a platform skill
  if (PLATFORM_PREFIXES.some(p => skillName.startsWith(p))) {
    console.error(`Error: '${skillName}' is a platform skill, not an AQE skill.`);
    console.error('  Only AQE skills are supported by this workflow.');
    process.exit(1);
  }

  // 2. Check if eval already exists
  const evalsDir = join(skillDir, 'evals');
  const evalPath = join(evalsDir, `${skillName}.yaml`);
  if (existsSync(evalPath)) {
    console.log(`Eval already exists: ${SKILLS_DIR}/${skillName}/evals/${skillName}.yaml`);
    console.log('  To regenerate, delete the existing file first.');
    process.exit(0);
  }

  // 3. Read SKILL.md
  const mdPath = existsSync(join(skillDir, 'SKILL.md'))
    ? join(skillDir, 'SKILL.md')
    : existsSync(join(skillDir, 'skill.md'))
      ? join(skillDir, 'skill.md')
      : null;

  if (!mdPath) {
    console.error(`Error: No SKILL.md found in ${SKILLS_DIR}/${skillName}/`);
    process.exit(1);
  }

  const content = readFileSync(mdPath, 'utf-8');
  const frontmatter = parseYamlFrontmatter(content);
  const bodyMatch = content.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // 4. Extract info from SKILL.md
  const description = String(frontmatter.description || frontmatter.name || skillName);
  const category = String(frontmatter.category || 'general');
  const priority = String(frontmatter.priority || 'p1');
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const agents = Array.isArray(frontmatter.agents) ? frontmatter.agents : [];

  const keywords = extractKeywords(body, frontmatter);
  const primaryCapability = extractPrimaryCapability(body);

  // 5. Build must_contain keywords for test cases (pick top relevant ones)
  const mustContainBasic = keywords.slice(0, 3);
  const mustContainCore = keywords.slice(0, 5);

  // 6. Generate YAML
  const today = new Date().toISOString().split('T')[0];
  const yaml = `# =============================================================================
# AQE ${skillName} Skill Evaluation Test Suite v1.0.0
# Generated by eval-driven-workflow.ts on ${today}
# =============================================================================
#
# Eval-driven development workflow:
#   1. Review and customize test cases below (look for TODO comments)
#   2. Run baseline: npx tsx scripts/run-skill-eval.ts --skill ${skillName} --output before.json
#   3. Improve SKILL.md based on eval failures
#   4. Compare: npx tsx scripts/eval-driven-workflow.ts compare before.json after.json
#
# Schema: .claude/skills/.validation/schemas/skill-eval.schema.json
# Runner: scripts/run-skill-eval.ts
# =============================================================================

skill: ${skillName}
version: 1.0.0
description: >
  Evaluation test suite for ${skillName} skill.
  ${description.slice(0, 120)}

# =============================================================================
# Multi-Model Configuration
# =============================================================================

models_to_test:
  - claude-sonnet-4        # Primary model (high accuracy expected)
  - claude-3-haiku          # Fast model (minimum quality bar)

# =============================================================================
# MCP Integration Configuration
# =============================================================================

mcp_integration:
  enabled: true
  namespace: skill-validation
  query_patterns: true
  track_outcomes: true
  store_patterns: true
  share_learning: true
  update_quality_gate: true
  target_agents:
    - qe-learning-coordinator
    - qe-queen-coordinator

# =============================================================================
# ReasoningBank Learning Configuration
# =============================================================================

learning:
  store_success_patterns: true
  store_failure_patterns: true
  pattern_ttl_days: 90
  min_confidence_to_store: 0.7
  cross_model_comparison: true

# =============================================================================
# Result Format Configuration
# =============================================================================

result_format:
  json_output: true
  markdown_report: false
  include_raw_output: false
  include_timing: true
  include_token_usage: true

# =============================================================================
# Test Cases — 5 seed cases generated from SKILL.md
# =============================================================================
# TODO: Review each test case and customize prompts, must_contain keywords,
#       and validation thresholds for your specific skill behavior.
# =============================================================================

test_cases:
  # ---------------------------------------------------------------------------
  # tc001: Basic Invocation
  # ---------------------------------------------------------------------------
  - id: tc001_basic_invocation
    description: "Skill responds to basic invocation with relevant output"
    category: basic
    priority: critical

    input:
      prompt: |
        # TODO: Replace with a minimal, realistic prompt for this skill
        I need help with ${skillName.replace(/-/g, ' ')}.
      context:
        language: typescript

    expected_output:
      must_contain:
${mustContainBasic.map(k => `        - "${k}"`).join('\n') || '        - "TODO_KEYWORD"  # TODO: Add expected keywords'}
      must_not_contain:
        - "unable to"
        - "I cannot"

    validation:
      schema_check: true
      keyword_match_threshold: 0.6
      reasoning_quality_min: 0.5

  # ---------------------------------------------------------------------------
  # tc002: Handles Empty/Missing Input
  # ---------------------------------------------------------------------------
  - id: tc002_handles_empty_input
    description: "Skill handles empty or missing input gracefully"
    category: edge_cases
    priority: high

    input:
      prompt: ""
      context:
        language: unknown

    expected_output:
      must_contain:
        - "provide"    # TODO: Adjust — what should the skill say for empty input?
      must_not_contain:
        - "exception"
        - "crash"
        - "undefined"

    validation:
      schema_check: true
      allow_partial: true

  # ---------------------------------------------------------------------------
  # tc003: Core Capability
  # ---------------------------------------------------------------------------
  - id: tc003_core_capability
    description: "Tests the primary capability: ${primaryCapability.slice(0, 80)}"
    category: core
    priority: critical

    input:
      prompt: |
        # TODO: Write a prompt that exercises the core capability of this skill
        # Core capability: ${primaryCapability.slice(0, 100)}
        Help me apply ${skillName.replace(/-/g, ' ')} to a sample project.
      context:
        language: typescript
        framework: nodejs

    expected_output:
      must_contain:
${mustContainCore.map(k => `        - "${k}"`).join('\n') || '        - "TODO_KEYWORD"  # TODO: Add expected keywords'}
      must_not_contain:
        - "error"
        - "not supported"

    validation:
      schema_check: true
      keyword_match_threshold: 0.8
      reasoning_quality_min: 0.6

  # ---------------------------------------------------------------------------
  # tc004: Output Structure
  # ---------------------------------------------------------------------------
  - id: tc004_output_structure
    description: "Validates output contains expected sections and structure"
    category: structure
    priority: high

    input:
      prompt: |
        # TODO: Write a prompt that should produce well-structured output
        Give me a comprehensive guide for ${skillName.replace(/-/g, ' ')}.
      context:
        language: typescript

    expected_output:
      must_contain:
        - "##"          # TODO: Expect markdown headings?
${mustContainBasic.slice(0, 2).map(k => `        - "${k}"`).join('\n') || '        - "TODO_KEYWORD"'}
      must_not_contain:
        - "TODO"
        - "placeholder"

    validation:
      schema_check: true
      keyword_match_threshold: 0.7

  # ---------------------------------------------------------------------------
  # tc005: Negative Control
  # ---------------------------------------------------------------------------
  - id: tc005_negative_control
    description: "Input where skill should decline or redirect to another skill"
    category: negative
    priority: high

    input:
      prompt: |
        # TODO: Write an out-of-scope prompt that this skill should NOT handle
        How do I make a soufflé?
      context:
        language: unknown

    expected_output:
      must_not_contain:
        - "recipe"
        - "ingredients"
        - "bake"
      # TODO: What should the skill say when declining? Add must_contain keywords.

    validation:
      schema_check: true
      allow_partial: true

# =============================================================================
# Success Criteria
# =============================================================================

success_criteria:
  pass_rate: 0.8            # 80% starter threshold — increase as skill matures
  critical_pass_rate: 1.0   # Critical tests must always pass
  avg_reasoning_quality: 0.6
  max_execution_time_ms: 300000
  cross_model_variance: 0.2

# =============================================================================
# Metadata
# =============================================================================

metadata:
  author: "eval-driven-workflow"
  created: "${today}"
  last_updated: "${today}"
  coverage_target: "Core functionality and basic edge cases"
  source_skill_category: "${category}"
  source_skill_priority: "${priority}"
  source_skill_tags: [${tags.map(t => `"${t}"`).join(', ')}]
  source_skill_agents: [${agents.map(a => `"${a}"`).join(', ')}]
`;

  // 7. Write file
  if (!existsSync(evalsDir)) {
    mkdirSync(evalsDir, { recursive: true });
  }
  writeFileSync(evalPath, yaml);

  // 8. Print next steps
  const keywordList = keywords.length > 0 ? keywords.join(', ') : '(none extracted — add manually)';
  console.log(`Created eval scaffold: ${SKILLS_DIR}/${skillName}/evals/${skillName}.yaml`);
  console.log(`  5 seed test cases generated from SKILL.md`);
  console.log(`  Keywords extracted: ${keywordList}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review and customize test cases (look for TODO comments)');
  console.log(`  2. Run baseline: npx tsx scripts/run-skill-eval.ts --skill ${skillName} --output before.json`);
  console.log('  3. Improve SKILL.md based on eval failures');
  console.log(`  4. Compare: npx tsx scripts/eval-driven-workflow.ts compare before.json after.json`);
}

// ============================================================================
// COMPARE SUBCOMMAND
// ============================================================================

interface TestCaseResult {
  id: string;
  passed: boolean;
  skipped: boolean;
  execution_time_ms: number;
}

interface ModelEvalResult {
  model: string;
  skill: string;
  pass_rate: number;
  critical_pass_rate: number;
  total_execution_time_ms: number;
  test_results: TestCaseResult[];
}

interface EvalRunResult {
  skill: string;
  model_results: ModelEvalResult[];
  summary: {
    avg_pass_rate: number;
  };
}

function runCompare(beforePath: string, afterPath: string): void {
  // 1. Read files
  if (!existsSync(beforePath)) {
    console.error(`Error: Before file not found: ${beforePath}`);
    process.exit(1);
  }
  if (!existsSync(afterPath)) {
    console.error(`Error: After file not found: ${afterPath}`);
    process.exit(1);
  }

  let before: EvalRunResult;
  let after: EvalRunResult;
  try {
    before = JSON.parse(readFileSync(beforePath, 'utf-8'));
    after = JSON.parse(readFileSync(afterPath, 'utf-8'));
  } catch (e) {
    console.error(`Error: Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const skillName = after.skill || before.skill || 'unknown';

  // Use first model result for comparison (most common use case)
  const beforeModel = before.model_results?.[0];
  const afterModel = after.model_results?.[0];

  if (!beforeModel || !afterModel) {
    console.error('Error: Both files must contain at least one model_results entry.');
    process.exit(1);
  }

  // 2. Compare aggregate metrics
  const beforePassRate = beforeModel.pass_rate * 100;
  const afterPassRate = afterModel.pass_rate * 100;
  const deltaPassRate = afterPassRate - beforePassRate;

  const beforeCritical = beforeModel.critical_pass_rate * 100;
  const afterCritical = afterModel.critical_pass_rate * 100;
  const deltaCritical = afterCritical - beforeCritical;

  const beforeTime = beforeModel.total_execution_time_ms / 1000;
  const afterTime = afterModel.total_execution_time_ms / 1000;
  const deltaTime = afterTime - beforeTime;

  // 3. Compare per-test-case results
  const beforeResults = new Map<string, TestCaseResult>();
  for (const r of beforeModel.test_results || []) {
    beforeResults.set(r.id, r);
  }

  interface TestChange {
    id: string;
    before: string;
    after: string;
    label: string;
  }
  const changes: TestChange[] = [];

  for (const r of afterModel.test_results || []) {
    const b = beforeResults.get(r.id);
    const bStatus = b ? (b.skipped ? 'SKIP' : b.passed ? 'PASS' : 'FAIL') : 'NEW';
    const aStatus = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';

    let label: string;
    if (bStatus === 'NEW') label = '(new test)';
    else if (bStatus === 'FAIL' && aStatus === 'PASS') label = '(improved)';
    else if (bStatus === 'PASS' && aStatus === 'FAIL') label = '(REGRESSION)';
    else if (bStatus === aStatus) label = '(stable)';
    else label = '(changed)';

    changes.push({ id: r.id, before: bStatus, after: aStatus, label });
  }

  // Check for tests removed in after
  for (const [id] of beforeResults) {
    if (!afterModel.test_results?.find(r => r.id === id)) {
      changes.push({ id, before: 'PASS/FAIL', after: 'REMOVED', label: '(removed)' });
    }
  }

  // 4. Output diff table
  const sep = '='.repeat(72);
  const divider = '-'.repeat(54);

  console.log(sep);
  console.log(`EVAL COMPARISON: ${skillName}`);
  console.log(sep);

  console.log(`${'Metric'.padEnd(26)}${'Before'.padStart(10)}${'After'.padStart(10)}${'Delta'.padStart(10)}`);
  console.log(divider);

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtDelta = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtTime = (v: number) => `${v.toFixed(1)}s`;
  const fmtTimeDelta = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}s`;

  const arrow = (v: number) => v > 0 ? ' \u2191' : v < 0 ? ' \u2193' : '';

  console.log(
    `${'Pass rate'.padEnd(26)}${fmtPct(beforePassRate).padStart(10)}${fmtPct(afterPassRate).padStart(10)}${(fmtDelta(deltaPassRate) + arrow(deltaPassRate)).padStart(10)}`
  );
  console.log(
    `${'Critical pass rate'.padEnd(26)}${fmtPct(beforeCritical).padStart(10)}${fmtPct(afterCritical).padStart(10)}${(fmtDelta(deltaCritical) + arrow(deltaCritical)).padStart(10)}`
  );
  console.log(
    `${'Avg execution time'.padEnd(26)}${fmtTime(beforeTime).padStart(10)}${fmtTime(afterTime).padStart(10)}${fmtTimeDelta(deltaTime).padStart(10)}`
  );

  console.log('');
  console.log('Test Case Changes:');
  for (const c of changes) {
    const idPad = c.id.length > 30 ? c.id.slice(0, 27) + '...' : c.id.padEnd(30);
    console.log(`  ${idPad} ${c.before} \u2192 ${c.after}  ${c.label}`);
  }

  console.log(sep);

  // 5. Determine result
  const regressions = changes.filter(c => c.label === '(REGRESSION)');
  if (deltaPassRate > 0) {
    console.log(`Result: IMPROVEMENT (+${deltaPassRate.toFixed(1)}% pass rate)`);
  } else if (deltaPassRate === 0 && regressions.length === 0) {
    console.log('Result: NO CHANGE');
  } else {
    console.log(`Result: REGRESSION (${deltaPassRate.toFixed(1)}% pass rate, ${regressions.length} test(s) regressed)`);
  }
  console.log(sep);

  // Exit code: 0 if after >= before, 1 if regression
  process.exit(afterPassRate >= beforePassRate ? 0 : 1);
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
Eval-Driven Development Workflow

Usage:
  npx tsx scripts/eval-driven-workflow.ts init <skill-name>
  npx tsx scripts/eval-driven-workflow.ts compare <before.json> <after.json>

Subcommands:
  init <skill>                Bootstrap eval YAML with 5 seed test cases from SKILL.md
  compare <before> <after>    Compare two eval run JSON files and show diff table

Options:
  --help, -h                  Show this help

Workflow:
  1. npx tsx scripts/eval-driven-workflow.ts init my-skill
  2. Review generated YAML (look for TODO comments)
  3. npx tsx scripts/run-skill-eval.ts --skill my-skill --output before.json
  4. Edit SKILL.md to improve eval results
  5. npx tsx scripts/run-skill-eval.ts --skill my-skill --output after.json
  6. npx tsx scripts/eval-driven-workflow.ts compare before.json after.json
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const subcommand = args[0];

  switch (subcommand) {
    case 'init': {
      const skillName = args[1];
      if (!skillName) {
        console.error('Error: Skill name required. Usage: eval-driven-workflow.ts init <skill-name>');
        process.exit(1);
      }
      runInit(skillName);
      break;
    }
    case 'compare': {
      const beforePath = args[1];
      const afterPath = args[2];
      if (!beforePath || !afterPath) {
        console.error('Error: Two JSON file paths required. Usage: eval-driven-workflow.ts compare <before.json> <after.json>');
        process.exit(1);
      }
      runCompare(beforePath, afterPath);
      break;
    }
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Use --help for usage information.');
      process.exit(1);
  }
}

main();
