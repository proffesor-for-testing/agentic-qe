#!/usr/bin/env node
// AQE Framework - AI-Powered Defect Intelligence Demo
// Domain: Automotive (BMW / Mercedes-Benz)
// Duration: ~5-7 minutes when screen-recorded with narration

import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import {
  defectGuidelines,
  poorQualityDefect,
  goodQualityDefect,
  existingDefects,
  newDefectForDupeCheck,
  similarityResults,
  defectComments,
  commentAnalysisResult,
  rcaDefectCluster,
  fiveWhysAnalysis,
  fishboneCategories,
  rootCauseResult
} from './defect-data.mjs';

// ─── Utilities ───────────────────────────────────────────────────────────

const PAUSE_SHORT = 600;
const PAUSE_MED = 1200;
const PAUSE_LONG = 2000;
const PAUSE_SECTION = 3000;
const TYPE_SPEED = 18;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function typeText(text, speed = TYPE_SPEED) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(speed);
  }
  console.log();
}

async function spinner(text, duration) {
  const s = ora({ text, spinner: 'dots', color: 'cyan' }).start();
  await sleep(duration);
  s.succeed(chalk.green(text));
}

function divider() {
  console.log(chalk.gray('─'.repeat(78)));
}

function sectionHeader(num, title) {
  console.log();
  console.log(chalk.bgCyan.black.bold(` CAPABILITY ${num} `));
  console.log(chalk.cyan.bold(`  ${title}`));
  divider();
}

function box(content, color = 'white') {
  const lines = content.split('\n');
  const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
  const pad = (s, len) => s + ' '.repeat(Math.max(0, len - stripAnsi(s).length));
  console.log(chalk[color]('  ┌─' + '─'.repeat(maxLen + 2) + '─┐'));
  for (const line of lines) {
    console.log(chalk[color]('  │ ') + pad(line, maxLen) + chalk[color](' │'));
  }
  console.log(chalk[color]('  └─' + '─'.repeat(maxLen + 2) + '─┘'));
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function progressBar(pct, width = 30) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
  return chalk[color]('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${pct}%`;
}

// ─── INTRO ───────────────────────────────────────────────────────────────

async function showIntro() {
  console.clear();
  console.log();
  console.log(chalk.cyan.bold(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║     █████╗  ██████╗ ███████╗    ██████╗ ███████╗███╗   ███╗  ║
    ║    ██╔══██╗██╔═══██╗██╔════╝    ██╔══██╗██╔════╝████╗ ████║  ║
    ║    ███████║██║   ██║█████╗      ██║  ██║█████╗  ██╔████╔██║  ║
    ║    ██╔══██║██║▄▄ ██║██╔══╝      ██║  ██║██╔══╝  ██║╚██╔╝██║  ║
    ║    ██║  ██║╚██████╔╝███████╗    ██████╔╝███████╗██║ ╚═╝ ██║  ║
    ║    ╚═╝  ╚═╝ ╚══▀▀═╝ ╚══════╝    ╚═════╝ ╚══════╝╚═╝     ╚═╝  ║
    ║                                                              ║
    ║        AI-Powered Defect Intelligence for Automotive         ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
  `));

  await sleep(PAUSE_LONG);
  console.log(chalk.white.bold('  Framework: ') + chalk.yellow('Agentic Quality Engineering (AQE)'));
  console.log(chalk.white.bold('  Domain:    ') + chalk.yellow('Automotive — BMW / Mercedes-Benz'));
  console.log(chalk.white.bold('  Engine:    ') + chalk.yellow('AI-Powered Semantic Analysis & Pattern Recognition'));
  console.log();

  const capTable = new Table({
    head: [chalk.white.bold('#'), chalk.white.bold('Capability'), chalk.white.bold('Status')],
    colWidths: [5, 48, 18],
    style: { head: [], border: ['gray'] }
  });
  capTable.push(
    ['1', 'Defect Quality Check (Mandatory Field Validation)', chalk.green('● Ready')],
    ['2', 'Duplicate Defect Identification (Semantic Similarity)', chalk.green('● Ready')],
    ['3', 'Root Cause Analysis (Pattern & Historical Analysis)', chalk.green('● Ready')]
  );
  console.log(capTable.toString());
  console.log();
  await typeText(chalk.gray('  Press-friendly demo with realistic automotive defect data...'), 12);
  await sleep(PAUSE_SECTION);
}

// ─── SECTION 1: Defect Quality Check ────────────────────────────────────

async function showDefectQualityCheck() {
  sectionHeader('1/3', 'DEFECT QUALITY CHECK — Mandatory Field Validation');
  console.log();
  await typeText(chalk.white('  AI validates every defect against defined quality guidelines,'), 15);
  await typeText(chalk.white('  ensuring all mandatory fields are populated before submission.'), 15);
  console.log();
  await sleep(PAUSE_MED);

  // Show guidelines
  console.log(chalk.yellow.bold('  📋 Defect Guidelines (Configured):'));
  const guideTable = new Table({
    head: [chalk.white.bold('Field'), chalk.white.bold('Rule'), chalk.white.bold('Required')],
    colWidths: [22, 48, 12],
    style: { head: [], border: ['gray'] }
  });
  for (const rule of defectGuidelines.qualityRules) {
    guideTable.push([rule.field, rule.rule, chalk.red.bold('YES')]);
  }
  console.log(guideTable.toString());
  await sleep(PAUSE_LONG);

  // --- Poor quality defect ---
  console.log();
  console.log(chalk.red.bold('  ▸ Incoming Defect: ') + chalk.white(`${poorQualityDefect.id} — "${poorQualityDefect.title}"`));
  await sleep(PAUSE_SHORT);
  await spinner('  Validating defect against quality guidelines...', PAUSE_LONG);
  console.log();

  console.log(chalk.red.bold('  ✗ VALIDATION FAILED — 6 issues found'));
  console.log();

  const failTable = new Table({
    head: [chalk.white.bold('Field'), chalk.white.bold('Status'), chalk.white.bold('Issue')],
    colWidths: [22, 10, 50],
    style: { head: [], border: ['gray'] }
  });
  failTable.push(
    ['title', chalk.red('FAIL'), 'Only 10 chars. Min 15 required. Missing [Component] prefix.'],
    ['severity', chalk.red('FAIL'), 'Empty. Must be one of: Critical, High, Medium, Low, Trivial.'],
    ['component', chalk.red('FAIL'), 'Empty. Component/module must be specified.'],
    ['stepsToReproduce', chalk.red('FAIL'), 'Empty array. Minimum 2 steps required.'],
    ['expectedBehavior', chalk.red('FAIL'), 'Empty. Minimum 10 characters describing expected outcome.'],
    ['actualBehavior', chalk.yellow('WARN'), '"Not working" is vague (11 chars). Include error messages/behavior.'],
    ['environment', chalk.red('FAIL'), 'Empty. Must include vehicle_model and software_version.'],
    ['reportedBy', chalk.green('PASS'), 'J. Mueller']
  );
  console.log(failTable.toString());
  console.log();

  console.log(chalk.white('  Quality Score: ') + progressBar(12));
  console.log(chalk.red('  ⚠  Defect REJECTED — does not meet minimum quality threshold (70%)'));
  await sleep(PAUSE_LONG);

  // --- Good quality defect ---
  console.log();
  divider();
  console.log(chalk.green.bold('  ▸ Incoming Defect: ') + chalk.white(`${goodQualityDefect.id} — "${goodQualityDefect.title.substring(0, 60)}..."`));
  await sleep(PAUSE_SHORT);
  await spinner('  Validating defect against quality guidelines...', PAUSE_MED);
  console.log();

  console.log(chalk.green.bold('  ✓ VALIDATION PASSED — All mandatory fields populated'));
  console.log();

  const passTable = new Table({
    head: [chalk.white.bold('Field'), chalk.white.bold('Status'), chalk.white.bold('Detail')],
    colWidths: [22, 10, 50],
    style: { head: [], border: ['gray'] }
  });
  passTable.push(
    ['title', chalk.green('PASS'), '74 chars, [Component] prefix present, impact stated'],
    ['severity', chalk.green('PASS'), 'High'],
    ['component', chalk.green('PASS'), 'Navigation / Route Engine'],
    ['stepsToReproduce', chalk.green('PASS'), '5 detailed steps with specific conditions'],
    ['expectedBehavior', chalk.green('PASS'), '145 chars, includes timing expectation (2 sec)'],
    ['actualBehavior', chalk.green('PASS'), '248 chars, includes error rates (30% crash)'],
    ['environment', chalk.green('PASS'), 'BMW G60, iDrive 8.5, HU-H3 v4.2.1, EU-Central'],
    ['reportedBy', chalk.green('PASS'), 'K. Schneider']
  );
  console.log(passTable.toString());
  console.log();

  // Quality dimensions
  console.log(chalk.white('  Quality Dimensions:'));
  console.log(`    Clarity:         ${progressBar(95)}`);
  console.log(`    Completeness:    ${progressBar(92)}`);
  console.log(`    Reproducibility: ${progressBar(98)}`);
  console.log(`    Evidence:        ${progressBar(85)}`);
  console.log(`    Actionability:   ${progressBar(90)}`);
  console.log();
  console.log(chalk.white('  Overall Score: ') + progressBar(92));
  console.log(chalk.green('  ✓  Defect ACCEPTED — meets quality standards'));
  await sleep(PAUSE_SECTION);
}

// ─── SECTION 2: Duplicate Defect Detection ──────────────────────────────

async function showDuplicateDetection() {
  sectionHeader('2/3', 'DUPLICATE DEFECT IDENTIFICATION — Semantic Similarity');
  console.log();
  await typeText(chalk.white('  AI analyzes new defects against the existing defect database'), 15);
  await typeText(chalk.white('  using semantic vector embeddings — not just keyword matching.'), 15);
  console.log();
  await sleep(PAUSE_MED);

  // Show existing defect database
  console.log(chalk.yellow.bold('  📂 Existing Defect Database: ') + chalk.white(`${existingDefects.length} defects indexed`));
  console.log();

  const dbTable = new Table({
    head: [chalk.white.bold('ID'), chalk.white.bold('Title'), chalk.white.bold('Severity'), chalk.white.bold('Status')],
    colWidths: [12, 48, 10, 12],
    style: { head: [], border: ['gray'] }
  });
  for (const d of existingDefects) {
    const sevColor = d.severity === 'Critical' ? 'red' : d.severity === 'High' ? 'yellow' : 'white';
    const statColor = d.status === 'open' ? 'yellow' : 'green';
    dbTable.push([
      d.id,
      d.title.substring(0, 46) + (d.title.length > 46 ? '..' : ''),
      chalk[sevColor](d.severity),
      chalk[statColor](d.status)
    ]);
  }
  console.log(dbTable.toString());
  await sleep(PAUSE_LONG);

  // New defect incoming
  console.log();
  divider();
  console.log(chalk.cyan.bold('  ▸ New Defect Submitted: ') + chalk.white(newDefectForDupeCheck.id));
  console.log(chalk.white(`    "${newDefectForDupeCheck.title}"`));
  console.log();
  await sleep(PAUSE_SHORT);

  await spinner('  Analyzing defect semantics...', PAUSE_MED);
  await spinner('  Searching defect database for similar reports...', PAUSE_MED);
  await spinner('  Identifying shared factors across matches...', PAUSE_SHORT);
  console.log();

  // Results
  console.log(chalk.red.bold('  ⚠  POTENTIAL DUPLICATES DETECTED'));
  console.log();

  for (const result of similarityResults) {
    const existing = existingDefects.find(d => d.id === result.defectId) ||
                     (result.defectId === 'DEF-4822' ? goodQualityDefect : null);
    const title = existing ? (existing.title || '').substring(0, 52) : 'Unknown';

    const scorePct = Math.round(result.score * 100);
    const scoreColor = result.type === 'exact-duplicate' ? 'red' : 'yellow';
    const typeLabel = result.type === 'exact-duplicate'
      ? chalk.red.bold('EXACT DUPLICATE')
      : chalk.yellow('RELATED');

    console.log(chalk[scoreColor].bold(`  ┌─ Match: ${result.defectId} [${scorePct}% similarity] — ${typeLabel}`));
    console.log(chalk.white(`  │  "${title}"`));
    console.log(chalk.gray(`  │  Shared factors: ${result.sharedFactors.join(', ')}`));
    console.log(chalk[scoreColor](`  └─ ${'█'.repeat(Math.round(scorePct / 3))}${'░'.repeat(33 - Math.round(scorePct / 3))} ${scorePct}%`));
    console.log();
    await sleep(PAUSE_MED);
  }

  // Recommendation
  box(
    chalk.red.bold('RECOMMENDATION: ') + chalk.white('Do NOT create new defect.\n') +
    chalk.white(`DEF-4823 is a duplicate of ${chalk.yellow.bold('DEF-3901')} (94% match).\n`) +
    chalk.white(`Action: Link to DEF-3901 and add ${newDefectForDupeCheck.environment.vehicle_model}\n`) +
    chalk.white('as an additional affected configuration.'),
    'yellow'
  );

  // Show the difference vs keyword matching
  console.log();
  console.log(chalk.gray.bold('  💡 Why semantic search matters:'));
  console.log(chalk.gray('     Keyword match for "route recalculation fails highway exit" → 0 results'));
  console.log(chalk.gray('     Semantic match catches "route guidance freezes motorway junction" → 94%'));
  console.log(chalk.gray('     Different words, same defect. AI understands meaning, not just text.'));
  await sleep(PAUSE_SECTION);
}

// ─── SECTION 3: Root Cause Analysis ─────────────────────────────────────

async function showRootCauseAnalysis() {
  sectionHeader('3/3', 'ROOT CAUSE ANALYSIS — Pattern & Historical Analysis');
  console.log();
  await typeText(chalk.white('  AI analyzes clusters of related defects, historical patterns,'), 15);
  await typeText(chalk.white('  and code changes to identify probable root causes.'), 15);
  console.log();
  await sleep(PAUSE_MED);

  // Defect cluster
  console.log(chalk.yellow.bold(`  📊 Defect Cluster Detected: ${rcaDefectCluster.clusterId}`));
  console.log(chalk.white(`     Name: ${rcaDefectCluster.name}`));
  console.log(chalk.white(`     Defects: ${rcaDefectCluster.defects.join(', ')}`));
  console.log(chalk.white(`     Period: ${rcaDefectCluster.timeRange}`));
  console.log(chalk.red(`     Trend: ▲ ${rcaDefectCluster.trend} (4 defects in 3 months)`));
  console.log();
  await sleep(PAUSE_LONG);

  await spinner('  Collecting failure history (last 90 days)...', PAUSE_MED);
  await spinner('  Analyzing defect comments and discussion threads...', PAUSE_MED);
  await spinner('  Running Five-Whys analysis...', PAUSE_LONG);
  await spinner('  Generating Fishbone (Ishikawa) diagram...', PAUSE_MED);
  await spinner('  Correlating with code change history...', PAUSE_MED);
  console.log();

  // Comment Analysis
  console.log(chalk.cyan.bold('  ═══ COMMENT & DISCUSSION ANALYSIS ═══'));
  console.log();
  console.log(chalk.white(`  AI analyzed ${commentAnalysisResult.totalComments} comments across ${rcaDefectCluster.defects.length} defects:`));
  console.log();

  // Show sample comments
  const commentDefects = ['DEF-3901', 'DEF-4512'];
  for (const defId of commentDefects) {
    const comments = defectComments[defId];
    if (!comments) continue;
    console.log(chalk.yellow(`  ${defId}:`));
    for (const c of comments.slice(0, 2)) {
      console.log(chalk.gray(`    ${c.author} (${c.date}):`));
      const truncated = c.text.length > 90 ? c.text.substring(0, 87) + '...' : c.text;
      console.log(chalk.white(`    "${truncated}"`));
    }
    console.log();
    await sleep(PAUSE_SHORT);
  }

  // Key insights from comments
  console.log(chalk.green.bold('  Key Insights Extracted from Comments:'));
  for (const ki of commentAnalysisResult.keyInsights) {
    console.log(chalk.green(`    ✓ `) + chalk.white(ki.insight));
    console.log(chalk.gray(`      Mentioned by ${ki.mentions} engineers | Confidence: ${ki.confidence}`));
  }
  console.log();
  await sleep(PAUSE_MED);

  // Timeline reconstructed from comments
  console.log(chalk.white.bold('  Timeline Reconstructed from Comments:'));
  for (const evt of commentAnalysisResult.timelineFromComments) {
    console.log(chalk.cyan(`    ${evt.date}`) + chalk.gray(` → ${evt.event}`));
    await sleep(300);
  }
  console.log();
  await sleep(PAUSE_LONG);

  // Five-Whys
  console.log(chalk.cyan.bold('  ═══ FIVE-WHYS ANALYSIS ═══'));
  console.log();

  for (const why of fiveWhysAnalysis) {
    const indent = '  ' + '  '.repeat(why.level - 1);
    const arrow = why.level === 1 ? '►' : '↳';
    console.log(indent + chalk.yellow.bold(`${arrow} Why #${why.level}: `) + chalk.white(why.question));
    await sleep(PAUSE_SHORT);
    console.log(indent + chalk.gray(`  Answer: ${why.answer}`));
    console.log();
    await sleep(PAUSE_MED);
  }

  console.log(chalk.red.bold('  ★ Root Cause Identified at Level 5:'));
  console.log(chalk.white('    Migration review process lacks threading model and performance'));
  console.log(chalk.white('    validation for embedded HMI components.'));
  await sleep(PAUSE_LONG);

  // Fishbone
  console.log();
  console.log(chalk.cyan.bold('  ═══ FISHBONE (ISHIKAWA) DIAGRAM ═══'));
  console.log();

  console.log(chalk.white('                          NAVIGATION ROUTE ENGINE FREEZE'));
  console.log(chalk.white('                                      │'));

  const categories = Object.entries(fishboneCategories);
  for (let i = 0; i < categories.length; i++) {
    const [category, causes] = categories[i];
    const side = i % 2 === 0 ? 'left' : 'right';
    const label = category.toUpperCase();

    if (side === 'left') {
      console.log(chalk.yellow(`    ${label}`) + chalk.gray(' ─────────────────────┐'));
    } else {
      console.log(chalk.gray('                              ┌─────────────────────── ') + chalk.yellow(label));
    }

    for (const cause of causes) {
      const truncated = cause.length > 58 ? cause.substring(0, 55) + '...' : cause;
      if (side === 'left') {
        console.log(chalk.gray(`      • ${truncated}`));
      } else {
        console.log(chalk.gray(`                              │  • ${truncated}`));
      }
    }
    console.log(chalk.gray('                              │'));
    await sleep(PAUSE_SHORT);
  }

  await sleep(PAUSE_LONG);

  // Root cause result
  console.log();
  console.log(chalk.cyan.bold('  ═══ ROOT CAUSE REPORT ═══'));
  console.log();

  const rcTable = new Table({
    colWidths: [22, 58],
    style: { head: [], border: ['cyan'] }
  });
  rcTable.push(
    [chalk.white.bold('Root Cause ID'), chalk.yellow(rootCauseResult.id)],
    [chalk.white.bold('Category'), chalk.white(rootCauseResult.category.toUpperCase())],
    [chalk.white.bold('Confidence'), progressBar(Math.round(rootCauseResult.confidence * 100))],
    [chalk.white.bold('Summary'), chalk.white(rootCauseResult.summary)],
    [chalk.white.bold('Affected Defects'), chalk.white(rootCauseResult.affectedDefects.join(', '))],
  );
  console.log(rcTable.toString());
  console.log();
  await sleep(PAUSE_MED);

  // Description
  console.log(chalk.white.bold('  Detailed Analysis:'));
  const descWords = rootCauseResult.description.split(' ');
  let line = '    ';
  for (const word of descWords) {
    if (line.length + word.length > 78) {
      console.log(chalk.gray(line));
      line = '    ';
    }
    line += word + ' ';
  }
  if (line.trim()) console.log(chalk.gray(line));
  console.log();
  await sleep(PAUSE_MED);

  // Preventive measures
  console.log(chalk.green.bold('  ✓ Preventive Measures:'));
  for (let i = 0; i < rootCauseResult.preventiveMeasures.length; i++) {
    await sleep(PAUSE_SHORT);
    console.log(chalk.green(`    ${i + 1}. `) + chalk.white(rootCauseResult.preventiveMeasures[i]));
  }
  console.log();
  await sleep(PAUSE_MED);

  // Related patterns
  console.log(chalk.yellow.bold('  ⚡ Related Patterns Discovered:'));
  for (const p of rootCauseResult.relatedPatterns) {
    console.log(chalk.yellow(`    • ${p.pattern}`));
    console.log(chalk.gray(`      ${p.occurrences} occurrences across: ${p.modules.join(', ')}`));
  }
  await sleep(PAUSE_SECTION);
}

// ─── OUTRO ───────────────────────────────────────────────────────────────

async function showOutro() {
  console.log();
  divider();
  console.log();
  console.log(chalk.cyan.bold('  ═══ DEMO SUMMARY ═══'));
  console.log();

  const summaryTable = new Table({
    head: [
      chalk.white.bold('Capability'),
      chalk.white.bold('What AI Does'),
      chalk.white.bold('Key Benefit')
    ],
    colWidths: [24, 30, 28],
    style: { head: [], border: ['cyan'] }
  });
  summaryTable.push(
    [
      chalk.cyan('Defect Quality Check'),
      'Validates mandatory fields\nagainst configurable rules',
      chalk.green('Reject 12% → Accept 92%\nquality score')
    ],
    [
      chalk.cyan('Duplicate Detection'),
      'Semantic similarity via\nvector embeddings (not keywords)',
      chalk.green('Caught 94% match that\nkeyword search missed')
    ],
    [
      chalk.cyan('Root Cause Analysis'),
      'Descriptions + comments +\nhistorical patterns analyzed',
      chalk.green('92% confidence RCA\n+ 5 preventive measures')
    ]
  );
  console.log(summaryTable.toString());
  console.log();

  console.log(chalk.white.bold('  What Sets AQE Apart:'));
  console.log(chalk.gray('    • Understands meaning, not just keywords — catches duplicates others miss'));
  console.log(chalk.gray('    • Learns from historical defect patterns to predict future risks'));
  console.log(chalk.gray('    • Multi-method RCA that traces symptoms to systemic root causes'));
  console.log(chalk.gray('    • Configurable quality gates that enforce your org\'s defect standards'));
  console.log(chalk.gray('    • Analyzes descriptions, comments, and resolution history together'));
  console.log();
  console.log(chalk.cyan.bold('    Powered by Agentic Quality Engineering (AQE) Framework'));
  console.log(chalk.gray('    https://agentic-qe.dev'));
  console.log();
  divider();
  console.log();
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const section = args.find(a => a.startsWith('--section='))?.split('=')[1];

  if (section === '1') {
    await showDefectQualityCheck();
  } else if (section === '2') {
    await showDuplicateDetection();
  } else if (section === '3') {
    await showRootCauseAnalysis();
  } else {
    await showIntro();
    await showDefectQualityCheck();
    await showDuplicateDetection();
    await showRootCauseAnalysis();
    await showOutro();
  }
}

main().catch(console.error);
