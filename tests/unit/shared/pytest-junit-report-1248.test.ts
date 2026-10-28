/**
 * #1248: pytest runs are read from the JUnit XML report pytest writes. These
 * reports were captured from pytest 9.2 (xunit2, the default family).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createPytestJunitReport, isPythonTestFile, locatePytestCase, parsePytestJunitXml, pytestCommand,
  pytestRunFromReport, resolvePythonCommand,
} from '../../../src/shared/pytest-junit-report.js';

const FILE = '/proj/tests/test_mix.py';

/** pass, fail, fixture error, skip, xfail, and a parametrized class test. */
const MIXED = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="1" failures="2" skipped="2" tests="7" time="0.023">'
  + '<testcase classname="tests.test_mix" name="test_ok" time="0.004" />'
  + '<testcase classname="tests.test_mix" name="test_bad" time="0.001"><failure message="AssertionError: one is not two &lt;&amp;&gt;&#10;assert 1 == 2">def test_bad():\n&gt;       assert 1 == 2\n\ntests/test_mix.py:7: AssertionError</failure></testcase>'
  + '<testcase classname="tests.test_mix" name="test_err" time="0.000"><error message="failed on setup with &quot;RuntimeError: fixture boom&quot;">E       RuntimeError: fixture boom</error></testcase>'
  + '<testcase classname="tests.test_mix" name="test_skip" time="0.000"><skipped type="pytest.skip" message="not now">/proj/tests/test_mix.py:16: not now</skipped></testcase>'
  + '<testcase classname="tests.test_mix" name="test_xf" time="0.000"><skipped type="pytest.xfail" message="" /></testcase>'
  + '<testcase classname="tests.test_mix.TestCls" name="test_p[1]" time="0.000" />'
  + '<testcase classname="tests.test_mix.TestCls" name="test_p[2]" time="0.000"><failure message="assert 2 == 1">E       assert 2 == 1</failure></testcase>'
  + '</testsuite></testsuites>';

/** A module that fails to import: pytest exits 2. */
const COLLECTION_ERROR = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="1" failures="0" skipped="0" tests="1">'
  + '<testcase classname="" name="tests.test_bad_import" time="0.000"><error message="collection failure">E   ModuleNotFoundError: No module named \'nonexistent_mod_xyz\'</error></testcase>'
  + '</testsuite></testsuites>';

const EMPTY = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="0" failures="0" skipped="0" tests="0" time="0.007" /></testsuites>';

describe('#1248 parsePytestJunitXml', () => {
  it('reads every test case with its status, duration and failure text', () => {
    const cases = parsePytestJunitXml(MIXED);
    expect(cases.map(c => [c.classname, c.name, c.status])).toEqual([
      ['tests.test_mix', 'test_ok', 'passed'],
      ['tests.test_mix', 'test_bad', 'failed'],
      ['tests.test_mix', 'test_err', 'error'],
      ['tests.test_mix', 'test_skip', 'skipped'],
      ['tests.test_mix', 'test_xf', 'skipped'],
      ['tests.test_mix.TestCls', 'test_p[1]', 'passed'],
      ['tests.test_mix.TestCls', 'test_p[2]', 'failed'],
    ]);
    expect(cases[0].duration).toBe(4);
    expect(cases[1].message).toBe('AssertionError: one is not two <&>\nassert 1 == 2');
    expect(cases[1].details).toContain('>       assert 1 == 2');
    expect(cases[2].message).toBe('failed on setup with "RuntimeError: fixture boom"');
  });

  it('counts a test case with both a failure and a teardown error once, as an error', () => {
    const xml = '<testsuite><testcase classname="t" name="x"><failure message="f">F</failure><error message="teardown">E</error></testcase></testsuite>';
    expect(parsePytestJunitXml(xml)).toEqual([expect.objectContaining({ name: 'x', status: 'error', message: 'teardown' })]);
  });

  it('reads an empty suite as no test cases, and refuses text that is not a JUnit report', () => {
    expect(parsePytestJunitXml(EMPTY)).toEqual([]);
    expect(() => parsePytestJunitXml('{"testResults": []}')).toThrow(/no <testsuite>/);
  });
});

describe('#1248 locatePytestCase', () => {
  it('maps a module test and a class test to the file and the node id inside it', () => {
    expect(locatePytestCase({ classname: 'tests.test_mix', name: 'test_ok' }, [FILE]))
      .toEqual({ file: FILE, name: 'test_ok' });
    expect(locatePytestCase({ classname: 'tests.test_mix.TestCls', name: 'test_p[2]' }, [FILE]))
      .toEqual({ file: FILE, name: 'TestCls::test_p[2]' });
  });

  it('tells apart files that share a base name by their directories', () => {
    const files = ['/p/tests/a/test_x.py', '/p/tests/b/test_x.py'];
    expect(locatePytestCase({ classname: 'tests.b.test_x', name: 't' }, files)).toEqual({ file: files[1], name: 't' });
    expect(locatePytestCase({ classname: 'tests.a.test_x.TestA', name: 't' }, files)).toEqual({ file: files[0], name: 'TestA::t' });
  });

  it('keeps the class name when no run file matches it', () => {
    expect(locatePytestCase({ classname: 'other.mod', name: 't' }, [FILE])).toEqual({ file: FILE, name: 'other.mod::t' });
  });
});

describe('#1248 pytestRunFromReport', () => {
  it('counts errors as failed tests and xfail as skipped (pytest exit 1)', () => {
    const run = pytestRunFromReport(MIXED, [FILE], 1, '', 'python');
    expect(run.success).toBe(true);
    if (!run.success) return;
    expect(run.value).toMatchObject({ total: 7, passed: 2, failed: 3, skipped: 2 });
    expect(run.value.tests.filter(t => t.status === 'failed').map(t => t.name)).toEqual(['test_bad', 'test_err', 'TestCls::test_p[2]']);
    expect(run.value.tests[1]).toMatchObject({ file: FILE, failureMessage: expect.stringContaining('one is not two <&>') });
  });

  it('accepts an all-passing run (pytest exit 0)', () => {
    const xml = '<testsuite><testcase classname="tests.test_mix" name="a" time="0.1"/><testcase classname="tests.test_mix" name="b"/></testsuite>';
    const run = pytestRunFromReport(xml, [FILE], 0, '', 'python');
    expect(run.success && run.value).toMatchObject({ total: 2, passed: 2, failed: 0, skipped: 0 });
  });

  it('refuses a run that collected no tests (exit 5)', () => {
    const run = pytestRunFromReport(EMPTY, [FILE], 5, 'collected 0 items', 'python');
    expect(run.success).toBe(false);
    expect(!run.success && run.error.message).toMatch(/pytest collected no tests for \/proj\/tests\/test_mix\.py \(exit code 5\)/);
  });

  it('refuses a run interrupted by a collection error (exit 2), naming the module', () => {
    const run = pytestRunFromReport(COLLECTION_ERROR, [FILE], 2, '', 'python');
    expect(run.success).toBe(false);
    expect(!run.success && run.error.name).toBe('TestRunnerExecutionError');
    expect(!run.success && run.error.message).toMatch(/was interrupted[\s\S]*tests\.test_bad_import[\s\S]*nonexistent_mod_xyz/);
  });

  it('refuses a collection error even when the exit code does not report it', () => {
    const run = pytestRunFromReport(COLLECTION_ERROR, [FILE], 1, '', 'python');
    expect(!run.success && run.error.message).toMatch(/reported a collection error/);
  });

  it('says pytest is not installed when the interpreter has no pytest module', () => {
    const run = pytestRunFromReport(undefined, [FILE], 1, '/usr/bin/python3: No module named pytest', 'python3');
    expect(!run.success && run.error.message).toMatch(/pytest wrote no JUnit report[\s\S]*not installed for 'python3'[\s\S]*AQE_PYTHON/);
  });

  it('refuses a missing report for any other reason, and a failing exit with no failed test', () => {
    const missing = pytestRunFromReport(undefined, [FILE], 4, 'ERROR: usage', 'python');
    expect(!missing.success && missing.error.message).toMatch(/pytest wrote no JUnit report.*exit code 4/);
    const xml = '<testsuite><testcase classname="tests.test_mix" name="a"/></testsuite>';
    const inconsistent = pytestRunFromReport(xml, [FILE], 1, '', 'python');
    expect(!inconsistent.success && inconsistent.error.message).toMatch(/failed without a failed assertion/);
  });

  it('refuses a run terminated without an exit code', () => {
    const xml = '<testsuite><testcase classname="tests.test_mix" name="a"/></testsuite>';
    expect(pytestRunFromReport(xml, [FILE], null, '', 'python').success).toBe(false);
  });
});

describe('#1248 pytest command and interpreter', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  function binDir(...names: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-1248-bin-'));
    dirs.push(dir);
    for (const name of names) {
      writeFileSync(join(dir, name), '#!/bin/sh\n');
      chmodSync(join(dir, name), 0o755);
    }
    return dir;
  }

  it('uses AQE_PYTHON, then python, then python3 from PATH', () => {
    expect(resolvePythonCommand({ AQE_PYTHON: ' /venv/bin/python ', PATH: binDir('python') })).toBe('/venv/bin/python');
    expect(resolvePythonCommand({ PATH: binDir('python', 'python3') })).toBe('python');
    expect(resolvePythonCommand({ PATH: binDir('python3') })).toBe('python3');
    expect(resolvePythonCommand({ PATH: binDir() })).toBe('python');
  });

  it('runs the files through python -m pytest into the given JUnit report, without colour', () => {
    expect(pytestCommand(['/p/tests/test_a.py'], '/tmp/r/junit.xml', { AQE_PYTHON: 'py' })).toEqual({
      command: 'py',
      args: ['-m', 'pytest', '/p/tests/test_a.py', '--junitxml=/tmp/r/junit.xml', '--color=no'],
    });
  });

  it('identifies Python test files by extension', () => {
    expect(isPythonTestFile('tests/test_a.py')).toBe(true);
    expect(isPythonTestFile('tests/a.test.ts')).toBe(false);
  });

  it('reads back its own report and removes it on cleanup', () => {
    const report = createPytestJunitReport();
    try {
      expect(report.read()).toBeUndefined();
      mkdirSync(dirname(report.path), { recursive: true });
      writeFileSync(report.path, 'not xml');
      expect(() => report.read()).toThrow(/malformed/);
      writeFileSync(report.path, EMPTY);
      expect(report.read()).toBe(EMPTY);
    } finally {
      report.cleanup();
    }
    expect(existsSync(dirname(report.path))).toBe(false);
    expect(() => report.cleanup()).not.toThrow();
  });
});
