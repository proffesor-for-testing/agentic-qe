#!/usr/bin/env node
/** Descriptive inventory for Optimized CI. Counts are advisory, not quality gates. */
const fs = require('node:fs');
const path = require('node:path');

const RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);
const EXPLICIT_SKIP = /\b(?:describe|it|test)\.skip\b/;
const CONDITIONAL_SKIP = /\b(?:describe|it|test)\.(?:skipIf|runIf)\b/;
const SHA = /^[0-9a-f]{7,64}$/i;
const REVISION_LABELS = {
  'pr-merge': 'Scanned commit (PR merge commit: GitHub test merge of the PR head into its base)',
  commit: 'Scanned commit',
};

/**
 * Resolve the commit whose tree was scanned. actions/checkout checks out
 * GITHUB_SHA, which on pull_request runs is GitHub's test merge commit (the PR
 * head merged into its base). The counts belong to that tree, so the PR head
 * (CI_PR_HEAD_SHA) is reported only as context. Non-hex values are unavailable.
 */
function resolveSourceRevision(env = process.env) {
  const hex = value => (SHA.test(value || '') ? value : null);
  const pr = env.GITHUB_EVENT_NAME === 'pull_request';
  const sourceRevision = hex(env.GITHUB_SHA);
  return {
    sourceRevision,
    sourceRevisionKind: sourceRevision ? (pr ? 'pr-merge' : 'commit') : null,
    prHeadRevision: pr ? hex(env.CI_PR_HEAD_SHA) : null,
  };
}

function collectInventory(options = {}, io = fs) {
  const root = options.root || process.cwd();
  const report = {
    schemaVersion: 'ci-inventory/v1',
    sourceRevision: options.sourceRevision || null,
    sourceRevisionKind: options.sourceRevisionKind || null,
    prHeadRevision: options.prHeadRevision || null,
    observedAt: options.observedAt || new Date().toISOString(),
    scope: 'Regular *.test.ts files recursively under tests/; symlinks excluded',
    interpretation: 'informational',
    status: 'observed',
    counts: null,
    jobsScope: 'Test Dashboard prerequisites (its `needs`) only; not every Optimized CI job',
    jobs: Object.fromEntries(Object.entries(options.jobs || {}).map(([name, job]) =>
      [name, RESULTS.has(job?.result) ? job.result : 'unavailable'])),
  };
  const counts = {
    testFiles: 0, sourceLines: 0, filesOver600Lines: 0, skipSyntaxLines: 0, conditionalSkipSyntaxLines: 0,
  };
  function visit(dir) {
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        const content = io.readFileSync(file, 'utf8');
        const lines = content === '' ? [] : content.split('\n');
        if (lines.at(-1) === '') lines.pop();
        counts.testFiles++;
        counts.sourceLines += lines.length;
        if (lines.length > 600) counts.filesOver600Lines++;
        // Source-text inventory only: examples/comments can match and parameterized
        // declarations need not correspond one-to-one with runnable tests.
        // Explicit .skip and conditional .skipIf/.runIf are counted separately.
        counts.skipSyntaxLines += lines.filter(line => EXPLICIT_SKIP.test(line)).length;
        counts.conditionalSkipSyntaxLines += lines.filter(line => CONDITIONAL_SKIP.test(line)).length;
      }
    }
  }
  try {
    visit(path.join(root, 'tests'));
    report.counts = counts;
  } catch {
    // A failed walk/read invalidates the whole inventory; partial counts are not zeroes.
    report.status = 'unavailable';
  }
  return report;
}

function renderInventory(report) {
  const lines = [
    '# CI Test Inventory', '',
    `**${REVISION_LABELS[report.sourceRevisionKind] || 'Source commit'}**: ${report.sourceRevision || 'unavailable'}`,
    ...(report.prHeadRevision ? [`**PR head commit**: ${report.prHeadRevision} ` +
      '(context only; the scanned merge commit also contains base-branch changes)'] : []),
    `**Observed at**: ${report.observedAt}`,
    `**Schema / producer**: ${report.schemaVersion} / scripts/ci-inventory.cjs`,
    `**Scope**: ${report.scope}`,
    '**Interpretation**: informational source inventory; no migration baseline or quality target is declared.', '',
  ];
  if (report.status === 'observed') {
    lines.push('| Inventory | Count |', '| --- | ---: |',
      `| Test source files | ${report.counts.testFiles} |`,
      `| Source lines | ${report.counts.sourceLines} |`,
      `| Files over 600 lines | ${report.counts.filesOver600Lines} |`,
      `| Lines matching explicit \`.skip\` syntax (text heuristic; excludes conditional \`skipIf\`/\`runIf\`) | ${report.counts.skipSyntaxLines} |`,
      `| Lines matching conditional \`skipIf\`/\`runIf\` syntax (text heuristic; counted separately) | ${report.counts.conditionalSkipSyntaxLines} |`);
  } else lines.push('Inventory unavailable: discovery or source reading failed.');
  lines.push('', '## Dashboard prerequisite outcomes', '',
    `Scope: ${report.jobsScope}.`, '');
  if (Object.keys(report.jobs).length) {
    lines.push('| Job | Outcome |', '| --- | --- |');
    for (const [name, result] of Object.entries(report.jobs)) lines.push(`| ${name} | ${result} |`);
  } else lines.push('Prerequisite outcomes unavailable.');
  lines.push('', 'Inventory collection does not certify that any CI check passed.', '');
  return lines.join('\n');
}

if (require.main === module) {
  let jobs = {};
  try {
    if (process.env.CI_JOB_OUTCOMES) jobs = JSON.parse(process.env.CI_JOB_OUTCOMES);
    if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) throw new Error('Expected an object');
  } catch {
    console.error('CI_JOB_OUTCOMES must be a JSON object');
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    const report = collectInventory({ ...resolveSourceRevision(), jobs });
    const markdown = renderInventory(report);
    fs.writeFileSync('ci-metrics.json', JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync('ci-metrics.md', markdown);
    process.stdout.write(markdown);
  }
}

module.exports = { collectInventory, renderInventory, resolveSourceRevision };
