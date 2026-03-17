#!/usr/bin/env node
/**
 * Validation Pipeline Helper
 *
 * Runs structured validation pipelines against documents with sequential
 * step execution, gate enforcement, per-step scoring, and weighted rollup.
 *
 * Usage:
 *   node validation-pipeline.cjs <pipeline> <file> [options]
 *   node validation-pipeline.cjs requirements docs/requirements.md
 *   node validation-pipeline.cjs requirements docs/requirements.md --steps format-check,completeness-check
 *   node validation-pipeline.cjs requirements docs/requirements.md --continue-on-failure --json
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Types (documented in SKILL.md output schema)
// ---------------------------------------------------------------------------

/**
 * @typedef {'pass'|'fail'|'warn'} Status
 * @typedef {'blocking'|'warning'|'info'} Severity
 * @typedef {'format'|'content'|'quality'|'traceability'|'compliance'} Category
 *
 * @typedef {Object} Finding
 * @property {'HIGH'|'MEDIUM'|'LOW'|'INFO'} level
 * @property {string} message
 * @property {string} [evidence]
 * @property {string} stepId
 *
 * @typedef {Object} StepResult
 * @property {string} id
 * @property {string} name
 * @property {Category} category
 * @property {Severity} severity
 * @property {Status} status
 * @property {number} score
 * @property {Finding[]} findings
 * @property {number} durationMs
 *
 * @typedef {Object} PipelineResult
 * @property {string} pipelineId
 * @property {string} pipelineName
 * @property {Status} overall
 * @property {number} score
 * @property {StepResult[]} steps
 * @property {Finding[]} blockers
 * @property {boolean} halted
 * @property {string} [haltedAt]
 * @property {number} totalDuration
 * @property {string} timestamp
 */

// ---------------------------------------------------------------------------
// Category weights (from SKILL.md)
// ---------------------------------------------------------------------------

const CATEGORY_WEIGHTS = {
  format: 0.10,
  content: 0.30,
  quality: 0.25,
  traceability: 0.20,
  compliance: 0.15,
};

// ---------------------------------------------------------------------------
// Requirements pipeline — 13 steps
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, name: string, category: Category, severity: Severity, check: (content: string, prior: StepResult[]) => {score: number, findings: Finding[]}}>} */
const REQUIREMENTS_STEPS = [
  {
    id: 'format-check',
    name: 'Format Check',
    category: 'format',
    severity: 'blocking',
    check(content, _prior) {
      const findings = [];
      const lines = content.split('\n');
      const headings = lines.filter(l => /^#{1,3}\s/.test(l));

      if (lines.length < 10) {
        findings.push({ level: 'HIGH', message: 'Document too short (< 10 lines)', stepId: 'format-check' });
      }
      if (headings.length === 0) {
        findings.push({ level: 'HIGH', message: 'No headings found — missing required sections', stepId: 'format-check' });
      }
      const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 40);
      return { score, findings };
    },
  },
  {
    id: 'completeness-check',
    name: 'Completeness Check',
    category: 'content',
    severity: 'blocking',
    check(content, _prior) {
      const findings = [];
      const lower = content.toLowerCase();

      const requiredSections = ['acceptance criteria', 'requirements', 'user stor'];
      const found = requiredSections.filter(s => lower.includes(s));
      if (found.length === 0) {
        findings.push({ level: 'HIGH', message: 'No acceptance criteria or requirements section found', stepId: 'completeness-check' });
      }

      // Check for empty sections (heading followed immediately by another heading)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^#{1,3}\s/.test(lines[i]) && /^#{1,3}\s/.test(lines[i + 1])) {
          findings.push({ level: 'MEDIUM', message: `Empty section: ${lines[i].trim()}`, stepId: 'completeness-check' });
        }
      }

      const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.filter(f => f.level === 'HIGH').length * 40 - findings.filter(f => f.level === 'MEDIUM').length * 10);
      return { score, findings };
    },
  },
  {
    id: 'invest-criteria',
    name: 'INVEST Criteria',
    category: 'quality',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];
      const lower = content.toLowerCase();

      // Check for signs of INVEST qualities
      const checks = [
        { name: 'Independent', pattern: /depend(s|ent|ency)/i, inverse: true, msg: 'Requirements may have undeclared dependencies' },
        { name: 'Testable', pattern: /test|verif|assert|expect/i, inverse: false, msg: 'No testability indicators found' },
        { name: 'Small', heuristic: () => content.length > 20000, msg: 'Document is very large — requirements may not be small enough' },
      ];

      let issues = 0;
      for (const c of checks) {
        if (c.heuristic) {
          if (c.heuristic()) { findings.push({ level: 'MEDIUM', message: c.msg, stepId: 'invest-criteria' }); issues++; }
        } else if (c.inverse ? c.pattern.test(lower) : !c.pattern.test(lower)) {
          findings.push({ level: 'MEDIUM', message: c.msg, stepId: 'invest-criteria' }); issues++;
        }
      }

      const score = Math.max(0, 100 - issues * 20);
      return { score, findings };
    },
  },
  {
    id: 'smart-acceptance',
    name: 'SMART Acceptance Criteria',
    category: 'quality',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];

      // Look for acceptance criteria sections
      const acMatch = content.match(/acceptance criteria[\s\S]*?(?=\n#{1,3}\s|$)/i);
      if (!acMatch) {
        findings.push({ level: 'MEDIUM', message: 'No acceptance criteria section found for SMART evaluation', stepId: 'smart-acceptance' });
        return { score: 50, findings };
      }

      const ac = acMatch[0];
      if (!/\d/.test(ac)) {
        findings.push({ level: 'MEDIUM', message: 'Acceptance criteria lack measurable values (no numbers found)', stepId: 'smart-acceptance' });
      }
      if (!/when|given|then|if/i.test(ac)) {
        findings.push({ level: 'LOW', message: 'Acceptance criteria lack specific conditions (no when/given/then)', stepId: 'smart-acceptance' });
      }

      const score = Math.max(0, 100 - findings.length * 25);
      return { score, findings };
    },
  },
  {
    id: 'testability-score',
    name: 'Testability Score',
    category: 'quality',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];

      // Count requirements-like statements
      const reqs = content.match(/shall|must|should|will/gi) || [];
      const testable = content.match(/test|verify|assert|expect|check|validate|confirm/gi) || [];

      if (reqs.length > 0 && testable.length === 0) {
        findings.push({ level: 'MEDIUM', message: `${reqs.length} requirement statements but no testability language found`, stepId: 'testability-score' });
      }

      const ratio = reqs.length > 0 ? testable.length / reqs.length : 1;
      const score = Math.min(100, Math.round(ratio * 100));
      return { score, findings };
    },
  },
  {
    id: 'vague-term-detection',
    name: 'Vague Term Detection',
    category: 'content',
    severity: 'info',
    check(content, _prior) {
      const findings = [];
      const vagueTerms = ['should', 'might', 'various', 'etc', 'some', 'many', 'few', 'often', 'usually', 'approximately', 'fairly', 'quite'];

      for (const term of vagueTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = content.match(regex);
        if (matches && matches.length > 2) {
          findings.push({ level: 'LOW', message: `Vague term "${term}" used ${matches.length} times`, stepId: 'vague-term-detection' });
        }
      }

      const score = Math.max(0, 100 - findings.length * 10);
      return { score, findings };
    },
  },
  {
    id: 'information-density',
    name: 'Information Density',
    category: 'content',
    severity: 'info',
    check(content, _prior) {
      const findings = [];
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

      // Detect filler sentences (very short or very generic)
      let fillerCount = 0;
      for (const s of sentences) {
        const words = s.trim().split(/\s+/);
        if (words.length <= 3 && !/^#{1,3}/.test(s.trim())) {
          fillerCount++;
        }
      }

      if (fillerCount > sentences.length * 0.2) {
        findings.push({ level: 'LOW', message: `${fillerCount}/${sentences.length} sentences appear to be filler (≤3 words)`, stepId: 'information-density' });
      }

      const ratio = sentences.length > 0 ? 1 - fillerCount / sentences.length : 1;
      const score = Math.round(ratio * 100);
      return { score, findings };
    },
  },
  {
    id: 'traceability-check',
    name: 'Traceability Check',
    category: 'traceability',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];

      // Look for requirement IDs (REQ-xxx, US-xxx, FR-xxx, etc.)
      const reqIds = content.match(/\b(REQ|US|FR|NFR|UC|TC|TS)-\d+/g) || [];
      if (reqIds.length === 0) {
        findings.push({ level: 'MEDIUM', message: 'No requirement IDs found (e.g., REQ-001, US-101) — traceability not possible', stepId: 'traceability-check' });
      }

      // Check for test references
      const testRefs = content.match(/\b(TC|TS|TEST)-\d+/g) || [];
      if (reqIds.length > 0 && testRefs.length === 0) {
        findings.push({ level: 'LOW', message: `${reqIds.length} requirement IDs found but no test case references`, stepId: 'traceability-check' });
      }

      const score = reqIds.length > 0 ? (testRefs.length > 0 ? 100 : 60) : 30;
      return { score, findings };
    },
  },
  {
    id: 'implementation-leakage',
    name: 'Implementation Leakage',
    category: 'quality',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];
      const implTerms = [
        { term: 'database', pattern: /\b(MySQL|PostgreSQL|MongoDB|Redis|SQLite|DynamoDB)\b/gi },
        { term: 'framework', pattern: /\b(React|Angular|Vue|Express|Django|Rails|Spring)\b/gi },
        { term: 'language', pattern: /\b(use Java|use Python|use TypeScript|implement in|code in)\b/gi },
        { term: 'API detail', pattern: /\b(REST endpoint|GraphQL mutation|POST \/api\/|GET \/api\/)\b/gi },
      ];

      for (const { term, pattern } of implTerms) {
        const matches = content.match(pattern);
        if (matches) {
          findings.push({ level: 'MEDIUM', message: `Implementation leakage (${term}): "${matches[0]}" — requirements should not prescribe implementation`, stepId: 'implementation-leakage' });
        }
      }

      const score = Math.max(0, 100 - findings.length * 20);
      return { score, findings };
    },
  },
  {
    id: 'domain-compliance',
    name: 'Domain Compliance',
    category: 'compliance',
    severity: 'info',
    check(content, _prior) {
      const findings = [];

      // Basic check: document uses consistent terminology
      const terms = new Map();
      const words = content.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || [];
      for (const w of words) {
        terms.set(w, (terms.get(w) || 0) + 1);
      }

      // Flag terms that appear only once (potential inconsistency)
      const singleUse = [...terms.entries()].filter(([, c]) => c === 1 && terms.size > 10);
      if (singleUse.length > terms.size * 0.5) {
        findings.push({ level: 'INFO', message: `Many terms used only once (${singleUse.length}/${terms.size}) — potential terminology inconsistency`, stepId: 'domain-compliance' });
      }

      const score = findings.length === 0 ? 100 : 70;
      return { score, findings };
    },
  },
  {
    id: 'dependency-analysis',
    name: 'Dependency Analysis',
    category: 'traceability',
    severity: 'info',
    check(content, _prior) {
      const findings = [];

      const reqIds = content.match(/\b(REQ|US|FR|NFR|UC)-\d+/g) || [];
      const depKeywords = content.match(/\b(depends on|requires|blocks|blocked by|prerequisite|after)\b/gi) || [];

      if (reqIds.length > 3 && depKeywords.length === 0) {
        findings.push({ level: 'LOW', message: `${reqIds.length} requirements found but no dependency language — cross-requirement dependencies may be undeclared`, stepId: 'dependency-analysis' });
      }

      const score = reqIds.length <= 3 ? 100 : (depKeywords.length > 0 ? 100 : 60);
      return { score, findings };
    },
  },
  {
    id: 'bdd-scenario-generation',
    name: 'BDD Scenario Generation',
    category: 'quality',
    severity: 'warning',
    check(content, _prior) {
      const findings = [];

      // Check if Given/When/Then already present
      const bddPatterns = content.match(/\b(Given|When|Then|And|But)\b/g) || [];
      if (bddPatterns.length > 0) {
        return { score: 100, findings: [] };
      }

      // Check if requirements are specific enough to derive BDD scenarios
      const actionVerbs = content.match(/\b(click|submit|enter|select|navigate|view|display|send|receive|create|update|delete)\b/gi) || [];
      if (actionVerbs.length === 0) {
        findings.push({ level: 'MEDIUM', message: 'No action verbs found — requirements may be too abstract to generate BDD scenarios', stepId: 'bdd-scenario-generation' });
      }

      const score = actionVerbs.length > 0 ? 80 : 40;
      return { score, findings };
    },
  },
  {
    id: 'holistic-quality',
    name: 'Holistic Quality',
    category: 'compliance',
    severity: 'blocking',
    check(content, prior) {
      const findings = [];

      // Aggregate signals from prior steps
      const failedSteps = prior.filter(s => s.status === 'fail');
      const avgScore = prior.length > 0 ? prior.reduce((sum, s) => sum + s.score, 0) / prior.length : 0;

      if (failedSteps.length > 3) {
        findings.push({ level: 'HIGH', message: `${failedSteps.length} steps failed — document has systemic quality issues`, stepId: 'holistic-quality' });
      }

      if (avgScore < 50) {
        findings.push({ level: 'HIGH', message: `Average step score is ${avgScore.toFixed(0)}/100 — document needs significant revision`, stepId: 'holistic-quality' });
      }

      // Check for contradictions (very basic: negation near requirement terms)
      const contradictions = content.match(/\bnot\b.{0,30}\b(shall|must|will)\b/gi) || [];
      if (contradictions.length > 2) {
        findings.push({ level: 'MEDIUM', message: `${contradictions.length} potential contradictions found (negation near requirement terms)`, stepId: 'holistic-quality' });
      }

      const score = Math.max(0, 100 - failedSteps.length * 15 - findings.length * 10);
      return { score, findings };
    },
  },
];

// ---------------------------------------------------------------------------
// Pipeline registry
// ---------------------------------------------------------------------------

const PIPELINES = {
  requirements: { name: 'Requirements Pipeline', steps: REQUIREMENTS_STEPS },
};

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

/**
 * @param {string} pipelineName
 * @param {string} content
 * @param {Object} options
 * @param {string[]} [options.steps]
 * @param {boolean} [options.continueOnFailure]
 * @returns {PipelineResult}
 */
function runPipeline(pipelineName, content, options = {}) {
  const pipeline = PIPELINES[pipelineName];
  if (!pipeline) {
    return {
      pipelineId: `${pipelineName}-${Date.now()}`,
      pipelineName: pipelineName,
      overall: 'fail',
      score: 0,
      steps: [],
      blockers: [{ level: 'HIGH', message: `Unknown pipeline: ${pipelineName}. Available: ${Object.keys(PIPELINES).join(', ')}`, stepId: 'pipeline-runner' }],
      halted: true,
      haltedAt: 'pipeline-runner',
      totalDuration: 0,
      timestamp: new Date().toISOString(),
    };
  }

  let steps = pipeline.steps;
  if (options.steps && options.steps.length > 0) {
    steps = steps.filter(s => options.steps.includes(s.id));
  }

  const startTime = Date.now();
  /** @type {StepResult[]} */
  const results = [];
  let halted = false;
  let haltedAt = undefined;

  for (const step of steps) {
    const stepStart = Date.now();
    let score = 0;
    let findings = [];
    let status = 'pass';

    try {
      const result = step.check(content, results);
      score = result.score;
      findings = result.findings;

      if (score < 50) status = 'fail';
      else if (score < 80) status = 'warn';
      else status = 'pass';
    } catch (err) {
      status = 'fail';
      score = 0;
      findings = [{ level: 'HIGH', message: `Step threw exception: ${err.message}`, stepId: step.id }];
    }

    results.push({
      id: step.id,
      name: step.name,
      category: step.category,
      severity: step.severity,
      status,
      score,
      findings,
      durationMs: Date.now() - stepStart,
    });

    // Gate enforcement
    if (status === 'fail' && step.severity === 'blocking' && !options.continueOnFailure) {
      halted = true;
      haltedAt = step.id;
      break;
    }
  }

  // Weighted rollup by category
  const categoryScores = {};
  const categoryCounts = {};
  for (const r of results) {
    categoryScores[r.category] = (categoryScores[r.category] || 0) + r.score;
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  }

  let weightedScore = 0;
  let totalWeight = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (categoryCounts[cat]) {
      weightedScore += weight * (categoryScores[cat] / categoryCounts[cat]);
      totalWeight += weight;
    }
  }
  const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) / 100 : 0;

  const blockers = results.flatMap(r => r.findings.filter(f => f.level === 'HIGH'));
  const hasBlocker = results.some(r => r.status === 'fail' && r.severity === 'blocking');

  let overall = 'pass';
  if (hasBlocker || halted) overall = 'fail';
  else if (finalScore < 80) overall = 'warn';

  return {
    pipelineId: `${pipelineName}-${Date.now()}`,
    pipelineName: pipeline.name,
    overall,
    score: Math.round(finalScore),
    steps: results,
    blockers,
    halted,
    haltedAt,
    totalDuration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatMarkdown(result) {
  const lines = [];
  lines.push(`# Validation Report: ${result.pipelineName}`);
  lines.push('');
  lines.push(`**Overall**: ${result.overall.toUpperCase()} | **Score**: ${result.score}/100 | **Duration**: ${result.totalDuration}ms`);
  if (result.halted) {
    lines.push(`**HALTED** at step: ${result.haltedAt}`);
  }
  lines.push('');
  lines.push('## Step Results');
  lines.push('| # | Step | Status | Score | Findings | Duration |');
  lines.push('|---|------|--------|-------|----------|----------|');

  result.steps.forEach((s, i) => {
    const statusIcon = s.status === 'pass' ? 'PASS' : s.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`| ${i + 1} | ${s.name} | ${statusIcon} | ${s.score} | ${s.findings.length} | ${s.durationMs}ms |`);
  });

  if (result.blockers.length > 0) {
    lines.push('');
    lines.push('## Blockers');
    for (const b of result.blockers) {
      lines.push(`- [${b.level}] ${b.message}`);
    }
  }

  const allFindings = result.steps.flatMap(s => s.findings);
  if (allFindings.length > 0) {
    lines.push('');
    lines.push('## All Findings');
    for (const f of allFindings) {
      lines.push(`- [${f.level}] ${f.message}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node validation-pipeline.cjs <pipeline> <file> [options]');
    console.log('');
    console.log('Pipelines: ' + Object.keys(PIPELINES).join(', '));
    console.log('');
    console.log('Options:');
    console.log('  --steps <id,id,...>     Run specific steps only');
    console.log('  --continue-on-failure   Skip blocking gates');
    console.log('  --json                  Output as JSON');
    console.log('  --help                  Show this help');
    process.exit(0);
  }

  const pipelineName = args[0];
  const filePath = args[1];

  // Parse options
  const stepFilter = args.includes('--steps') ? args[args.indexOf('--steps') + 1].split(',') : null;
  const continueOnFailure = args.includes('--continue-on-failure');
  const jsonOutput = args.includes('--json');

  // Read file
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    const err = { error: `File not found: ${resolvedPath}` };
    if (jsonOutput) { console.log(JSON.stringify(err)); } else { console.error(err.error); }
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  if (content.trim().length === 0) {
    const err = { error: 'File is empty' };
    if (jsonOutput) { console.log(JSON.stringify(err)); } else { console.error(err.error); }
    process.exit(1);
  }

  // Run pipeline
  const options = { continueOnFailure };
  if (stepFilter) options.steps = stepFilter;

  const result = runPipeline(pipelineName, content, options);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatMarkdown(result));
  }

  // Exit code: 0=pass, 1=fail, 2=warn
  if (result.overall === 'fail') process.exit(1);
  if (result.overall === 'warn') process.exit(2);
  process.exit(0);
}

main();
