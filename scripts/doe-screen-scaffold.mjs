#!/usr/bin/env node
/**
 * ADR-122 designed-experiment (DoE) screen — DRY-RUN scaffold.
 *
 * WHAT THIS IS
 *   A pure-Node, zero-dependency, NO-NETWORK planner for the ADR-122 harness
 *   screen. It prints the factor model, the fractional-factorial design matrix,
 *   the replicate plan, and a token/cost estimate. It NEVER runs a live model
 *   and NEVER spends money.
 *
 * SAFETY MODEL (why this file is safe to run)
 *   - Default mode is DRY-RUN: print the design + cost estimate, then STOP.
 *   - `--smoke` exercises the whole pipeline (design -> run -> aggregate ->
 *     summarize) with a LocalStubRunner that returns deterministic $0 fake
 *     results. Nothing hits the network; total cost is provably $0. This mirrors
 *     retort's `LocalStubRunner` pattern (retort_metaharness/runner.py).
 *   - `--confirm-spend` is the human gate. Even WITH the flag this scaffold does
 *     NOT itself call a model — it refuses and prints the exact hand-off command
 *     for the real AQE/retort harness. Real spend happens only in that harness,
 *     after the user has seen and approved the dollar estimate below.
 *
 * GROUNDING
 *   Factor model + fraction/ANOVA approach mirror retort's DoE engine
 *   (retort/src/retort/design, retort_metaharness/{factors,design,runner}.py) and
 *   ADR-122. Response = pass-proportion over N replicates via the ADR-113 oracle
 *   (src/validation/oracle-eval.ts) whose grading is mutation-based (real
 *   `node --test`) and therefore costs $0 in tokens — only generation is metered.
 *
 * USAGE
 *   node scripts/doe-screen-scaffold.mjs                 # dry-run: design + cost, then STOP
 *   node scripts/doe-screen-scaffold.mjs --smoke         # $0 pipeline smoke test (stub runner)
 *   node scripts/doe-screen-scaffold.mjs --full          # cost the FULL factorial (no fraction)
 *   node scripts/doe-screen-scaffold.mjs --replicates 3  # override N replicates (default 5)
 *   node scripts/doe-screen-scaffold.mjs --confirm-spend # gate: refuses, prints hand-off command
 */

'use strict';

// ---------------------------------------------------------------------------
// Factor model  (ADR-122 §2; retort_metaharness/factors.py analog)
// A factor's `feature` flag marks it as a harness FEATURE under screen (per
// ADR-122 the gate admits a feature only on a significant, non-negative effect).
// model/prompt are context/blocking factors; retrieval/scaffold are the features
// whose reliability contribution is on trial (the "beads" question).
// ---------------------------------------------------------------------------
const FACTORS = {
  model: {
    feature: false,
    levels: [
      { id: 'qwen3-coder:30b', label: 'local (Ollama)', priceIn: 0, priceOut: 0 },
      { id: 'haiku-4.5', label: 'cheap cloud', priceIn: 1.0, priceOut: 5.0 },
      { id: 'opus-4.8', label: 'frontier', priceIn: 5.0, priceOut: 25.0 },
    ],
  },
  prompt: {
    feature: false,
    levels: [{ id: 'neutral' }, { id: 'TDD' }, { id: 'ATDD' }],
  },
  retrieval: {
    feature: true, // ADR-118 flywheel policy — the feature most analogous to `beads`
    levels: [
      { id: 'off', inputMult: 1.0 },
      { id: 'on', inputMult: 1.2 }, // retrieved patterns add ~20% input context
    ],
  },
  scaffold: {
    feature: true,
    levels: [
      { id: 'none', passMult: 1.0 },
      { id: 'plan-and-solve', passMult: 1.3 },
      { id: 'reflexion', passMult: 2.0 }, // two-pass self-critique ~2x tokens
    ],
  },
};

// Prices are per MILLION tokens (input / output). Grounded: Opus 4.8 = $5/$25
// (retort README, Opus 4.8 announcement); Haiku 4.5 ~= $1/$5; local = $0.
// Token assumptions per single test-generation run against one anchor fixture:
const TOKENS = {
  baseIn: 8000, // fixture source + prompt + scaffold instructions (+retrieval)
  baseOut: 4000, // generated tests + reasoning
};

const DEFAULT_REPLICATES = 5; // ADR-122 §2: pass-proportion needs N; single run is noise
const DEFAULT_FRACTION = 0.5; // half-fraction screen (Res IV target: mains clear of 2FI)

// ---------------------------------------------------------------------------
// Arg parsing (tiny, no deps)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    smoke: false, full: false, confirmSpend: false,
    replicates: DEFAULT_REPLICATES, fraction: DEFAULT_FRACTION,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--smoke') a.smoke = true;
    else if (t === '--full') { a.full = true; a.fraction = 1.0; }
    else if (t === '--confirm-spend') a.confirmSpend = true;
    else if (t === '--replicates') a.replicates = Number(argv[++i]);
    else if (t === '--fraction') a.fraction = Number(argv[++i]);
    else if (t === '--help' || t === '-h') a.help = true;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Design generation
//   Full factorial = cartesian product of all factor levels.
//   Fractional screen = deterministic balanced subset (sum-of-indices mod k).
//   NOTE: this modular selector is a TRANSPARENT SCAFFOLD APPROXIMATION of a
//   real resolution-IV fractional design. For the authoritative aliasing-aware
//   matrix, generate it with retort:
//     retort design generate --phase characterization --fraction 0.5 --config <factors>
//   or  retort-metaharness design ... --fraction 0.5
//   and feed that CSV to the real runner. This scaffold's job is cost + pipeline
//   shape, not the final aliasing structure.
// ---------------------------------------------------------------------------
function fullFactorial() {
  const names = Object.keys(FACTORS);
  let cells = [{}];
  for (const name of names) {
    const next = [];
    FACTORS[name].levels.forEach((lvl, idx) => {
      for (const partial of cells) next.push({ ...partial, [name]: idx });
    });
    cells = next;
  }
  return cells; // each cell = { model: idx, prompt: idx, retrieval: idx, scaffold: idx }
}

function fractionSelect(cells, fraction) {
  if (fraction >= 1.0) return cells;
  const k = Math.round(1 / fraction); // 0.5 -> keep 1 of every 2
  const names = Object.keys(FACTORS);
  return cells.filter((c) => {
    const s = names.reduce((acc, n) => acc + c[n], 0);
    return s % k === 0;
  });
}

function describeCell(c) {
  const names = Object.keys(FACTORS);
  return names.map((n) => `${n}=${FACTORS[n].levels[c[n]].id}`).join('  ');
}

// ---------------------------------------------------------------------------
// Cost model — per cell, from its factor levels. Grading (oracle mutation kill)
// is compute-only, $0 tokens, so cost is generation-only.
// ---------------------------------------------------------------------------
function cellCostUsd(c, replicates) {
  const model = FACTORS.model.levels[c.model];
  const retr = FACTORS.retrieval.levels[c.retrieval];
  const scaf = FACTORS.scaffold.levels[c.scaffold];

  const tokMult = scaf.passMult; // scaffold multiplies token volume (extra passes)
  const inTok = TOKENS.baseIn * retr.inputMult * tokMult;
  const outTok = TOKENS.baseOut * tokMult;

  const perRun =
    (inTok / 1e6) * model.priceIn + (outTok / 1e6) * model.priceOut;
  return { perRun, perCell: perRun * replicates, inTok, outTok };
}

// ---------------------------------------------------------------------------
// LocalStubRunner — $0 deterministic fake results (retort's smoke pattern).
// Returns a plausible pass-proportion purely from factor indices, so the
// aggregate/summarize pipeline can be exercised end-to-end at zero cost.
// The numbers are a FIXTURE, not a benchmark.
// ---------------------------------------------------------------------------
function localStubRun(c, replicates) {
  // Deterministic pseudo pass signal: frontier model + no over-scaffolding does
  // best; ATDD on weak model and heavy scaffold drag it down (encodes the
  // hypotheses, so the summary visibly reflects them — but it is FAKE).
  const modelBoost = [0.55, 0.7, 0.95][c.model];
  const promptPenalty = c.prompt === 2 && c.model === 0 ? -0.4 : 0; // ATDD x local
  const retrievalPenalty = c.retrieval === 1 && c.model === 0 ? -0.15 : 0;
  const scaffoldPenalty = c.scaffold === 2 ? -0.1 : 0; // reflexion over-iterates
  let p = modelBoost + promptPenalty + retrievalPenalty + scaffoldPenalty;
  p = Math.max(0, Math.min(1, p));
  const passes = Math.round(p * replicates);
  return { passProportion: passes / replicates, passes, replicates, cost: 0 };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function printFactorTable() {
  console.log('\nFACTOR MODEL (ADR-122 §2)');
  console.log('-'.repeat(72));
  for (const [name, def] of Object.entries(FACTORS)) {
    const tag = def.feature ? ' [FEATURE under screen]' : ' [context/blocking]';
    console.log(`  ${name}${tag}`);
    console.log(`    levels: ${def.levels.map((l) => l.id).join(', ')}`);
  }
}

function printDesign(cells, full, args) {
  console.log('\nDESIGN');
  console.log('-'.repeat(72));
  console.log(`  factors:             ${Object.keys(FACTORS).length}`);
  console.log(`  full factorial:      ${full.length} cells  (3x3x2x3)`);
  console.log(`  fraction:            ${args.fraction}  ${args.fraction < 1 ? '(screen)' : '(FULL)'}`);
  console.log(`  screened cells:      ${cells.length}`);
  console.log(`  replicates / cell:   ${args.replicates}  (pass-proportion, not single run)`);
  console.log(`  total runs:          ${cells.length * args.replicates}`);
  console.log('\n  cells:');
  cells.forEach((c, i) => console.log(`    ${String(i + 1).padStart(2)}. ${describeCell(c)}`));
}

function printCost(cells, args) {
  let total = 0;
  const perModel = {};
  for (const c of cells) {
    const { perCell } = cellCostUsd(c, args.replicates);
    total += perCell;
    const mid = FACTORS.model.levels[c.model].id;
    perModel[mid] = (perModel[mid] || 0) + perCell;
  }
  console.log('\nCOST ESTIMATE  (generation only; oracle grading is $0 — mutation kill via node --test)');
  console.log('-'.repeat(72));
  console.log('  Assumptions:');
  console.log(`    tokens/run:   ${TOKENS.baseIn} in / ${TOKENS.baseOut} out (base; x retrieval x scaffold)`);
  console.log('    prices/Mtok:  local $0/$0 | haiku-4.5 $1/$5 | opus-4.8 $5/$25');
  console.log(`    replicates:   ${args.replicates}`);
  console.log('  Cost by model tier:');
  for (const [mid, usd] of Object.entries(perModel)) {
    console.log(`    ${mid.padEnd(18)} $${usd.toFixed(2)}`);
  }
  console.log('  ' + '-'.repeat(40));
  console.log(`    TOTAL              $${total.toFixed(2)}`);
  return total;
}

function printStopBanner(total, args) {
  console.log('\n' + '='.repeat(72));
  console.log('STOP: REQUIRES USER SPEND CONFIRMATION');
  console.log('='.repeat(72));
  console.log(`  This screen would spend ~$${total.toFixed(2)} in live model calls.`);
  console.log('  This scaffold is DRY-RUN and has spent $0.');
  console.log('');
  console.log('  To smoke-test the pipeline at $0 (recommended first):');
  console.log('    node scripts/doe-screen-scaffold.mjs --smoke');
  console.log('');
  console.log('  To actually run the screen, a human must (a) approve the $ above,');
  console.log('  then (b) hand the design to the real harness — this scaffold will');
  console.log('  NOT spend even with --confirm-spend:');
  console.log('    retort-metaharness design --fraction 0.5 ... -o design.csv');
  console.log('    retort-metaharness run -d design.csv --replicates ' + args.replicates + ' \\');
  console.log('        --runner metaharness --runner-cmd "<AQE test-gen + oracle-eval binding>"');
  console.log('    retort-metaharness analyze -r results.csv   # Type-II ANOVA');
  console.log('='.repeat(72));
}

function printSmoke(cells, args) {
  console.log('\nSMOKE RUN (LocalStubRunner — $0, deterministic FAKE results, NOT a benchmark)');
  console.log('-'.repeat(72));
  let totalCost = 0;
  const rows = cells.map((c) => {
    const r = localStubRun(c, args.replicates);
    totalCost += r.cost;
    return { cell: describeCell(c), ...r };
  });
  rows
    .sort((a, b) => b.passProportion - a.passProportion)
    .forEach((r) =>
      console.log(`  pass=${r.passProportion.toFixed(2)} (${r.passes}/${r.replicates})  ${r.cell}`)
    );
  console.log('  ' + '-'.repeat(40));
  console.log(`  pipeline exercised: design(${cells.length}) -> run -> aggregate -> summarize`);
  console.log(`  total spend: $${totalCost.toFixed(2)}  (LocalStubRunner is free by construction)`);
  console.log('  NOTE: these pass-proportions are a fixture to prove wiring, not model quality.');
}

function printHelp() {
  console.log(`ADR-122 DoE screen scaffold (DRY-RUN, no spend, no network)

  node scripts/doe-screen-scaffold.mjs [options]

  (no flag)          Dry-run: print factor model + design + cost, then STOP.
  --smoke            $0 pipeline smoke test using LocalStubRunner.
  --full             Cost the FULL factorial instead of the half-fraction screen.
  --fraction <f>     Fraction to screen (default 0.5).
  --replicates <n>   Replicates per cell (default 5).
  --confirm-spend    Human gate. Refuses to spend here; prints hand-off command.
  --help             This message.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  console.log('ADR-122 DESIGNED-EXPERIMENT (DoE) HARNESS SCREEN — SCAFFOLD');
  console.log('mode: ' + (args.smoke ? 'SMOKE ($0)' : 'DRY-RUN (no spend, no network)'));

  const full = fullFactorial();
  const cells = fractionSelect(full, args.fraction);

  printFactorTable();
  printDesign(cells, full, args);
  const total = printCost(cells, args);

  if (args.smoke) {
    printSmoke(cells, args);
    console.log('\nSmoke complete. $0 spent. Real screen still requires user confirmation (see below).');
    printStopBanner(total, args);
    return;
  }

  if (args.confirmSpend) {
    console.log('\n--confirm-spend received, but THIS SCAFFOLD NEVER SPENDS.');
    console.log('It has no model binding and no network by design. Hand off to the real');
    console.log('harness after approving the estimate:');
  }

  printStopBanner(total, args);
}

main();
