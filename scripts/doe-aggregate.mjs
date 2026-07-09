/**
 * ADR-122 DoE aggregator — reads the 27-cell results JSONL (model × prompt ×
 * retrieval × scaffold, pass-proportion + cost) and reports main effects:
 * per-factor level means, variance-share (which factor moves reliability most),
 * and the `beads` check on the two FEATURE factors (retrieval, scaffold) — does
 * a feature add cost without buying reliability?
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const factors = ['model', 'prompt', 'retrieval', 'scaffold'];
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

console.log(`\n=== ADR-122 DoE SCREEN — ${rows.length} cells (pass-proportion over 5 anchor items/cell) ===\n`);

for (const f of factors) {
  const levels = [...new Set(rows.map((r) => r[f]))];
  console.log(`${f}:`);
  for (const lv of levels) {
    const rs = rows.filter((r) => r[f] === lv);
    const pp = mean(rs.map((r) => r.passProp));
    const cc = mean(rs.map((r) => r.cost));
    console.log(`  ${String(lv).padEnd(16)} passProp=${pp.toFixed(3)}  meanCost=$${cc.toFixed(4)}  (n=${rs.length})`);
  }
  console.log('');
}

// variance-share proxy: range of level-mean pass-proportion (bigger = more influential on reliability)
const ranges = factors.map((f) => {
  const levels = [...new Set(rows.map((r) => r[f]))];
  const means = levels.map((lv) => mean(rows.filter((r) => r[f] === lv).map((r) => r.passProp)));
  return { f, range: Math.max(...means) - Math.min(...means) };
}).sort((a, b) => b.range - a.range);
console.log('=== which factor moves pass-proportion most (level-mean range) ===');
ranges.forEach((r) => console.log(`  ${r.f.padEnd(10)} Δ=${r.range.toFixed(3)}`));

// beads check on the two FEATURE factors
console.log('\n=== FEATURE verdict (beads check: cost up, quality flat/down = drop it) ===');
for (const f of ['retrieval', 'scaffold']) {
  const levels = [...new Set(rows.map((r) => r[f]))];
  const baseLv = f === 'retrieval' ? 'off' : 'none';
  const base = rows.filter((r) => r[f] === baseLv);
  const basePP = mean(base.map((r) => r.passProp)), baseCost = mean(base.map((r) => r.cost));
  for (const lv of levels) {
    if (lv === baseLv) continue;
    const rs = rows.filter((r) => r[f] === lv);
    const dPP = mean(rs.map((r) => r.passProp)) - basePP;
    const dCost = mean(rs.map((r) => r.cost)) - baseCost;
    const verdict = dPP <= 0.001 ? (dCost > 0 ? 'DROP (beads: +cost, no quality)' : 'neutral') : 'keep (real quality gain)';
    console.log(`  ${f}=${lv} vs ${baseLv}:  ΔpassProp=${dPP >= 0 ? '+' : ''}${dPP.toFixed(3)}  ΔmeanCost=${dCost >= 0 ? '+' : ''}$${dCost.toFixed(4)}  => ${verdict}`);
  }
}
const totalCost = rows.reduce((a, r) => a + r.cost, 0);
console.log(`\nTOTAL SPEND: $${totalCost.toFixed(3)} across ${rows.length} cells.`);
