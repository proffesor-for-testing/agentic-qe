/**
 * Agent Booster WASM Benchmark Suite
 *
 * Tests performance, accuracy, and QE-specific scenarios
 */

import { AgentBoosterWasm, WasmLanguage, WasmConfig } from './agent_booster_wasm.js';

// ============================================================================
// BENCHMARK INFRASTRUCTURE
// ============================================================================

const results = {
  performance: [],
  accuracy: [],
  qeScenarios: [],
  edgeCases: [],
};

function benchmark(name, fn, iterations = 100) {
  // Warmup
  for (let i = 0; i < 10; i++) {
    try { fn(); } catch (e) { /* ignore warmup errors */ }
  }

  const times = [];
  let errors = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      fn();
    } catch (e) {
      errors++;
    }
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

  return { name, avg, min, max, p95, iterations, errors };
}

function testAccuracy(name, original, edit, language, expected) {
  const booster = new AgentBoosterWasm();
  try {
    const result = booster.apply_edit(original, edit, language);
    const passed = expected.test ? expected.test(result) : result.merged_code.includes(expected.contains);
    return {
      name,
      passed,
      confidence: result.confidence,
      strategy: result.strategy,
      syntaxValid: result.syntax_valid,
    };
  } catch (e) {
    return { name, passed: false, error: e.message };
  }
}

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('PHASE 1: PERFORMANCE BENCHMARKS');
console.log('='.repeat(70));

const booster = new AgentBoosterWasm();

// Small code (1 function)
const smallOriginal = `function add(a, b) {
  return a + b;
}`;
const smallEdit = `function add(a: number, b: number): number {
  return a + b;
}`;

results.performance.push(benchmark('Small code (1 function, ~50 chars)', () => {
  booster.apply_edit(smallOriginal, smallEdit, WasmLanguage.JavaScript);
}));

// Medium code (class with methods)
const mediumOriginal = `class Calculator {
  constructor() {
    this.result = 0;
  }

  add(a, b) {
    return a + b;
  }

  subtract(a, b) {
    return a - b;
  }

  multiply(a, b) {
    return a * b;
  }

  divide(a, b) {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
}`;

const mediumEdit = `  modulo(a, b) {
    if (b === 0) throw new Error('Modulo by zero');
    return a % b;
  }`;

results.performance.push(benchmark('Medium code (class, ~500 chars)', () => {
  booster.apply_edit(mediumOriginal, mediumEdit, WasmLanguage.JavaScript);
}));

// Large code (multiple functions)
const largeOriginal = Array(20).fill(null).map((_, i) => `
function process${i}(data) {
  const result = data.map(item => item * ${i});
  return result.filter(x => x > 0);
}
`).join('\n');

// Use exact replacement for better matching
const largeEdit = `function process5(data) {
  const result = data.map(item => item * 5);
  return result.filter(x => x > 0);
}`;

results.performance.push(benchmark('Large code (20 functions, ~2KB)', () => {
  booster.apply_edit(largeOriginal, largeEdit, WasmLanguage.JavaScript);
}));

// TypeScript specific
const tsOriginal = `interface User {
  name: string;
  email: string;
}

function getUser(id: number): User | null {
  return users.find(u => u.id === id) || null;
}`;

const tsEdit = `interface User {
  name: string;
  email: string;
  createdAt: Date;
}`;

results.performance.push(benchmark('TypeScript (interface + function)', () => {
  booster.apply_edit(tsOriginal, tsEdit, WasmLanguage.TypeScript);
}));

// Print performance results
console.log('\nPerformance Results:');
console.log('-'.repeat(70));
console.log('| Scenario                              | Avg (ms) | P95 (ms) | Min (ms) |');
console.log('-'.repeat(70));
for (const r of results.performance) {
  console.log(`| ${r.name.padEnd(37)} | ${r.avg.toFixed(3).padStart(8)} | ${r.p95.toFixed(3).padStart(8)} | ${r.min.toFixed(3).padStart(8)} |`);
}
console.log('-'.repeat(70));

// ============================================================================
// ACCURACY TESTS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('PHASE 2: ACCURACY TESTS');
console.log('='.repeat(70));

// Test 1: Simple function replacement
results.accuracy.push(testAccuracy(
  'Simple function replacement',
  'function foo() { return 1; }',
  'function foo() { return 42; }',
  WasmLanguage.JavaScript,
  { contains: 'return 42' }
));

// Test 2: Add method to class
results.accuracy.push(testAccuracy(
  'Add method to class',
  `class Calc {
  add(a, b) { return a + b; }
}`,
  `  multiply(a, b) { return a * b; }`,
  WasmLanguage.JavaScript,
  { test: (r) => r.merged_code.includes('add') && r.merged_code.includes('multiply') }
));

// Test 3: var to const transform
results.accuracy.push(testAccuracy(
  'var to const transform',
  'var x = 1; var y = 2;',
  'const x = 1; const y = 2;',
  WasmLanguage.JavaScript,
  { contains: 'const' }
));

// Test 4: Add TypeScript types
results.accuracy.push(testAccuracy(
  'Add TypeScript types',
  'function greet(name) { return `Hello ${name}`; }',
  'function greet(name: string): string { return `Hello ${name}`; }',
  WasmLanguage.TypeScript,
  { contains: ': string' }
));

// Test 5: Add try-catch wrapper
results.accuracy.push(testAccuracy(
  'Add try-catch wrapper',
  `function fetchData(url) {
  const response = fetch(url);
  return response.json();
}`,
  `function fetchData(url) {
  try {
    const response = fetch(url);
    return response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}`,
  WasmLanguage.JavaScript,
  { contains: 'try {' }
));

// Test 6: Add null check
results.accuracy.push(testAccuracy(
  'Add null check',
  `function getName(user) {
  return user.name;
}`,
  `function getName(user) {
  if (!user) return null;
  return user.name;
}`,
  WasmLanguage.JavaScript,
  { contains: 'if (!user)' }
));

// Print accuracy results
console.log('\nAccuracy Results:');
console.log('-'.repeat(70));
for (const r of results.accuracy) {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  const conf = r.confidence ? `(${(r.confidence * 100).toFixed(1)}%)` : '';
  console.log(`${status} | ${r.name} ${conf}`);
  if (r.error) console.log(`       Error: ${r.error}`);
}

// ============================================================================
// QE-SPECIFIC SCENARIOS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('PHASE 3: QE-SPECIFIC SCENARIOS');
console.log('='.repeat(70));

// QE Test 1: Add test assertion
results.qeScenarios.push(testAccuracy(
  'Add test assertion',
  `test('adds numbers', () => {
  const result = add(1, 2);
});`,
  `test('adds numbers', () => {
  const result = add(1, 2);
  expect(result).toBe(3);
});`,
  WasmLanguage.JavaScript,
  { contains: 'expect(result).toBe(3)' }
));

// QE Test 2: Convert to async test
results.qeScenarios.push(testAccuracy(
  'Convert to async test',
  `test('fetches data', () => {
  const data = fetchData();
  expect(data).toBeDefined();
});`,
  `test('fetches data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});`,
  WasmLanguage.JavaScript,
  { test: (r) => r.merged_code.includes('async ()') && r.merged_code.includes('await') }
));

// QE Test 3: Add mock
results.qeScenarios.push(testAccuracy(
  'Add mock setup',
  `describe('UserService', () => {
  test('gets user', () => {
    const user = userService.getUser(1);
    expect(user).toBeDefined();
  });
});`,
  `describe('UserService', () => {
  beforeEach(() => {
    jest.mock('./api');
  });

  test('gets user', () => {
    const user = userService.getUser(1);
    expect(user).toBeDefined();
  });
});`,
  WasmLanguage.JavaScript,
  { contains: 'jest.mock' }
));

// QE Test 4: Add test.each
results.qeScenarios.push(testAccuracy(
  'Convert to parameterized test',
  `test('validates email', () => {
  expect(isValidEmail('test@example.com')).toBe(true);
});`,
  `test.each([
  ['test@example.com', true],
  ['invalid', false],
  ['@missing.com', false],
])('validates email %s -> %s', (email, expected) => {
  expect(isValidEmail(email)).toBe(expected);
});`,
  WasmLanguage.JavaScript,
  { contains: 'test.each' }
));

// QE Test 5: Add beforeEach/afterEach
results.qeScenarios.push(testAccuracy(
  'Add setup/teardown',
  `describe('Database', () => {
  test('inserts record', () => {
    db.insert({ id: 1 });
    expect(db.count()).toBe(1);
  });
});`,
  `describe('Database', () => {
  beforeEach(() => {
    db.clear();
  });

  afterEach(() => {
    db.close();
  });

  test('inserts record', () => {
    db.insert({ id: 1 });
    expect(db.count()).toBe(1);
  });
});`,
  WasmLanguage.JavaScript,
  { test: (r) => r.merged_code.includes('beforeEach') && r.merged_code.includes('afterEach') }
));

// QE Test 6: Add error test case
results.qeScenarios.push(testAccuracy(
  'Add error assertion',
  `test('divides numbers', () => {
  expect(divide(10, 2)).toBe(5);
});`,
  `test('divides numbers', () => {
  expect(divide(10, 2)).toBe(5);
  expect(() => divide(10, 0)).toThrow('Division by zero');
});`,
  WasmLanguage.JavaScript,
  { contains: 'toThrow' }
));

// Print QE scenario results
console.log('\nQE Scenario Results:');
console.log('-'.repeat(70));
let qePassed = 0;
for (const r of results.qeScenarios) {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  if (r.passed) qePassed++;
  const conf = r.confidence ? `(${(r.confidence * 100).toFixed(1)}%)` : '';
  console.log(`${status} | ${r.name} ${conf}`);
  if (r.error) console.log(`       Error: ${r.error}`);
}

// ============================================================================
// EDGE CASES
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('PHASE 4: EDGE CASES');
console.log('='.repeat(70));

// Edge 1: Empty original
results.edgeCases.push(testAccuracy(
  'Empty original code',
  '',
  'function newFunc() { return 1; }',
  WasmLanguage.JavaScript,
  { contains: 'newFunc' }
));

// Edge 2: Very similar functions
results.edgeCases.push(testAccuracy(
  'Distinguish similar functions',
  `function processA(x) { return x * 2; }
function processB(x) { return x * 3; }`,
  `function processB(x) { return x * 4; }`,
  WasmLanguage.JavaScript,
  { test: (r) => r.merged_code.includes('x * 2') && r.merged_code.includes('x * 4') }
));

// Edge 3: Unicode/special chars
results.edgeCases.push(testAccuracy(
  'Unicode and special characters',
  `function greet(name) { return "Hello " + name; }`,
  `function greet(name) { return "こんにちは " + name + " 🎉"; }`,
  WasmLanguage.JavaScript,
  { contains: 'こんにちは' }
));

// Edge 4: Nested structures
results.edgeCases.push(testAccuracy(
  'Deeply nested code',
  `function outer() {
  function middle() {
    function inner() {
      return 1;
    }
    return inner();
  }
  return middle();
}`,
  `function outer() {
  function middle() {
    function inner() {
      return 42;
    }
    return inner();
  }
  return middle();
}`,
  WasmLanguage.JavaScript,
  { contains: 'return 42' }
));

// Print edge case results
console.log('\nEdge Case Results:');
console.log('-'.repeat(70));
for (const r of results.edgeCases) {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  const conf = r.confidence ? `(${(r.confidence * 100).toFixed(1)}%)` : '';
  console.log(`${status} | ${r.name} ${conf}`);
  if (r.error) console.log(`       Error: ${r.error}`);
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('BENCHMARK SUMMARY');
console.log('='.repeat(70));

const totalAccuracy = results.accuracy.filter(r => r.passed).length;
const totalQE = results.qeScenarios.filter(r => r.passed).length;
const totalEdge = results.edgeCases.filter(r => r.passed).length;

console.log(`
Performance:
  - Small code:  ${results.performance[0].avg.toFixed(3)}ms avg
  - Medium code: ${results.performance[1].avg.toFixed(3)}ms avg
  - Large code:  ${results.performance[2].avg.toFixed(3)}ms avg

Accuracy:      ${totalAccuracy}/${results.accuracy.length} tests passed
QE Scenarios:  ${totalQE}/${results.qeScenarios.length} tests passed
Edge Cases:    ${totalEdge}/${results.edgeCases.length} tests passed

Overall:       ${totalAccuracy + totalQE + totalEdge}/${results.accuracy.length + results.qeScenarios.length + results.edgeCases.length} tests passed
`);

// Identify gaps for Phase 2
const failedQE = results.qeScenarios.filter(r => !r.passed);
if (failedQE.length > 0) {
  console.log('QE Patterns Needed for Phase 2:');
  console.log('-'.repeat(70));
  for (const f of failedQE) {
    console.log(`  - ${f.name}`);
  }
}

console.log('\n' + '='.repeat(70));
