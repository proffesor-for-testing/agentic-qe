/**
 * HIDDEN ACCEPTANCE TEST (scenario-001) — never shown to agent or interactor.
 * Run with: node hidden-test.js <path-to-fixed-paginate.js>
 * Exit 0 iff the fix is correct.
 */
const { paginate } = require(process.argv[2] || './fixture/paginate.cjs');

const items = Array.from({ length: 10 }, (_, i) => i);
const failures = [];

// No overlap between consecutive pages
const page0 = paginate(items, 3, 0);
const page1 = paginate(items, 3, 1);
if (page0.some((x) => page1.includes(x))) failures.push('pages 0 and 1 overlap');

// Page size respected
if (page0.length !== 3) failures.push(`page 0 has ${page0.length} items, want 3`);

// Last partial page correct
const last = paginate(items, 3, 3);
if (last.length !== 1 || last[0] !== 9) failures.push('last partial page wrong');

// Empty page past the end
if (paginate(items, 3, 5).length !== 0) failures.push('past-end page not empty');

if (failures.length) {
  console.error('HIDDEN TEST FAIL:', failures.join('; '));
  process.exit(1);
}
console.log('HIDDEN TEST PASS');
