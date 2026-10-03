/**
 * Unit tests for CI/CD config parser.
 *
 * Tests YAML parsing, validation, defaults, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseCIConfigContent,
  parseCIConfigFile,
  findCIConfigFile,
  getDefaultCIConfig,
  type CIConfig,
} from '../../../src/cli/utils/ci-config.js';

describe('parseCIConfigContent', () => {
  it('should parse minimal valid config', () => {
    const yaml = `
version: '1'
name: test-project
phases:
  - name: Tests
    type: test
`;
    const result = parseCIConfigContent(yaml);
    expect(result.success).toBe(true);
    expect(result.config!.name).toBe('test-project');
    expect(result.config!.phases.map(p => [p.name, p.type])).toEqual([['Tests', 'test']]);
  });

  it('should apply default values', () => {
    const yaml = `
phases:
  - name: Tests
    type: test
`;
    const result = parseCIConfigContent(yaml);
    expect(result.success).toBe(true);
    expect(result.config!.version).toBe('1');
    expect(result.config!.name).toBe('aqe-ci');
    expect(result.config!.output.format).toBe('json');
    expect(result.config!.output.directory).toBe('.aqe-ci-output');
    expect(result.config!.qualityGate.enforced).toBe(true);
    expect(result.config!.qualityGate.thresholds.coverage).toBe(80);
  });

  it('should accept config with valid top-level fields', () => {
    const yaml = `version: '1'\nname: my-project`;
    const result = parseCIConfigContent(yaml);
    expect(result.success).toBe(true);
    expect(result.config!.name).toBe('my-project');
    expect(result.config!.phases.length).toBeGreaterThan(0);
  });

  it('should parse output section when present', () => {
    const yaml = 'output:\n  format: sarif\n  directory: custom-output\n  combined_report: false';
    const result = parseCIConfigContent(yaml);
    expect(result.success).toBe(true);
    expect(result.config!.output).toEqual({ format: 'sarif', directory: 'custom-output', combinedReport: false });
  });

  it('should have quality_gate defaults', () => {
    const result = parseCIConfigContent('version: 1');
    expect(result.success).toBe(true);
    expect(result.config!.qualityGate).toBeDefined();
    expect(result.config!.qualityGate.enforced).toBe(true);
    expect(result.config!.qualityGate.thresholds.coverage).toBe(80);
  });

  it('should use default phases when none specified', () => {
    const yaml = `
version: '1'
name: test
`;
    const result = parseCIConfigContent(yaml);
    expect(result.success).toBe(true);
    expect(result.config!.phases.length).toBeGreaterThan(0);
    // Default phases include test, coverage, security, quality-gate
    const types = result.config!.phases.map(p => p.type);
    expect(types).toContain('test');
    expect(types).toContain('coverage');
    expect(types).toContain('security');
    expect(types).toContain('quality-gate');
  });

  it('should handle empty content gracefully', () => {
    // Empty YAML should use defaults
    const result = parseCIConfigContent('');
    expect(result.success).toBe(true);
    expect(result.config).toEqual(getDefaultCIConfig());
  });
});

describe('parseCIConfigFile', () => {
  it('should return error for non-existent file', () => {
    const result = parseCIConfigFile('/nonexistent/path/.aqe-ci.yml');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });
});

describe('findCIConfigFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find .aqe-ci.yml in given directory', () => {
    const configPath = path.join(tempDir, '.aqe-ci.yml');
    fs.writeFileSync(configPath, 'version: 1\n');
    const found = findCIConfigFile(tempDir);
    expect(found).toBe(configPath);
  });

  it('should find .aqe-ci.yaml variant', () => {
    const configPath = path.join(tempDir, '.aqe-ci.yaml');
    fs.writeFileSync(configPath, 'version: 1\n');
    const found = findCIConfigFile(tempDir);
    expect(found).toBe(configPath);
  });

  it('should return null when no config exists', () => {
    const found = findCIConfigFile(tempDir);
    expect(found).toBeNull();
  });

  it('should search up parent directories', () => {
    const subDir = path.join(tempDir, 'a', 'b');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.aqe-ci.yml'), 'version: 1\n');
    const found = findCIConfigFile(subDir);
    expect(found).toBe(path.join(tempDir, '.aqe-ci.yml'));
  });
});

describe('getDefaultCIConfig', () => {
  it('should return a valid config with default phases', () => {
    const config = getDefaultCIConfig();
    expect(config.version).toBe('1');
    expect(config.phases.length).toBeGreaterThan(0);
    expect(config.output.format).toBe('json');
    expect(config.qualityGate.enforced).toBe(true);
  });

  it('should return a deep copy (no shared references)', () => {
    const config1 = getDefaultCIConfig();
    const config2 = getDefaultCIConfig();
    config1.phases[0].name = 'modified';
    expect(config2.phases[0].name).not.toBe('modified');
  });
});


describe('real CI YAML file semantics', () => {
  let directory: string;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-ci-yaml-')); });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  function parseFile(yaml: string) {
    const file = path.join(directory, '.aqe-ci.yml');
    fs.writeFileSync(file, yaml);
    return parseCIConfigFile(file);
  }

  it('preserves only supplied phases, nested config, output and gate settings', () => {
    const result = parseFile(`version: 1
name: owned-project
phases:
  - name: Only Custom
    type: custom
    enabled: false
    continue_on_failure: true
    timeout: 17
    config:
      target: 'src/custom#target'
      labels: [one, two]
output:
  format: sarif
  directory: owned-output
  combined_report: false
quality_gate:
  enforced: false
  thresholds:
    coverage: 97
    security: high
    quality: 91
`);
    expect(result.success).toBe(true);
    expect(result.config).toEqual({
      version: '1', name: 'owned-project',
      phases: [{ name: 'Only Custom', type: 'custom', enabled: false,
        continueOnFailure: true, timeout: 17,
        config: { target: path.join(directory, 'src/custom#target'), labels: ['one', 'two'] } }],
      output: { format: 'sarif', directory: path.join(directory, 'owned-output'), combinedReport: false },
      qualityGate: { enforced: false, thresholds: { coverage: 97, security: 'high', quality: 91 } },
    });
    expect(result.configPath).toBe(path.join(directory, '.aqe-ci.yml'));
  });

  it('accepts bounded aliases and quoted/flow YAML without changing values', () => {
    const result = parseFile(`defaults: &settings { target: 'source:with#punctuation', labels: [one, two] }
phases:
  - { name: A, type: custom, config: *settings }
  - { name: B, type: custom, config: *settings }
quality_gate: { enforced: true, thresholds: { coverage: 0, quality: 0 } }
`);
    expect(result.success).toBe(true);
    expect(result.config!.phases.map(p => p.name)).toEqual(['A', 'B']);
    expect(result.config!.phases[0].config).toEqual({ target: path.join(directory, 'source:with#punctuation'), labels: ['one', 'two'] });
    expect(result.config!.phases[1].config.target).toBe(path.join(directory, 'source:with#punctuation'));
    expect(result.config!.qualityGate.thresholds).toMatchObject({ coverage: 0, quality: 0 });
  });

  it.each([
    '42', '[test, custom]', 'null', 'output: [unterminated',
    'phases: [null]', 'phases: custom', 'phases: []', 'output: [json]',
    'quality_gate: false', 'quality_gate: { thresholds: false }',
    'name: []', 'output: { directory: 4 }', 'output: { combined_report: "false" }',
    'quality_gate: { enforced: "false" }', 'quality_gate: { thresholds: { coverage: "90" } }',
    'quality_gate: { thresholds: { quality: .nan } }',
    'phases: [{ name: A, type: custom, enabled: "false" }]',
    'phases: [{ name: A, type: custom, timeout: 0 }]',
    'phases: [{ name: A, type: custom, config: [] }]',
    'phases: [{ name: A, type: invalid }]',
    'phases: [{ type: custom }]', 'phases: [{ name: A }]',
    'phases: [{ name: A, type: custom, continue_on_failure: "false" }]',
    'quality_gate: { thresholds: { security: critical } }',
  ])('rejects malformed/non-map/invalid config %s as a parse result', yaml => {
    const result = parseFile(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not share fallback phase objects between separate parsed configs', () => {
    const first = parseFile('name: first').config!;
    const second = parseFile('name: second').config!;
    first.phases[0].config.target = 'changed';
    expect(second.phases[0].config.target).toBe(directory);
  });

  it.each([
    'name: '.padEnd(10001, 'x'),
    '\n'.repeat(10001),
    'phases: [{ name: A, type: custom, config: { nested: ' + '['.repeat(21) + '0' + ']'.repeat(21) + ' } }]',
    'config: &loop { child: *loop }',
    'name: first\nname: duplicate',
    'phases: [{ name: A, type: custom, config: { __proto__: { polluted: true } } }]',
    'anchor: &a [0]\nphases: [{ name: A, type: custom, config: { aliases: [' + Array(101).fill('*a').join(',') + '] } }]',
  ])('retains bounded YAML/prototype validation (%#)', yaml => {
    expect(parseFile(yaml).success).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});


describe('CI path containment', () => {
  it.each(['../outside', '../../escape-out', '/tmp/outside', 'C:\\outside'])('rejects an output directory outside the project: %s', directory => {
    const result = parseCIConfigContent(`output:\n  directory: '${directory}'`);
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('output.directory');
  });
  it.each(['../outside', '/tmp/outside', 'C:\\outside'])('rejects an external phase target: %s', target => {
    const result = parseCIConfigContent(`phases:\n  - name: Tests\n    type: test\n    config: { target: '${target}' }`);
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('target');
  });
  it('anchors paths to the config directory rather than the invoking directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-config-paths-'));
    try {
      const configFile = path.join(directory, '.aqe-ci.yml');
      fs.writeFileSync(configFile, 'output: { directory: reports }\nphases:\n  - name: Tests\n    type: test\n    config: { target: src }');
      const result = parseCIConfigFile(configFile);
      expect(result.success).toBe(true);
      expect(result.config!.output.directory).toBe(path.join(directory, 'reports'));
      expect(result.config!.phases[0].config.target).toBe(path.join(directory, 'src'));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('rejects a symlinked output ancestor escaping the config directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-config-symlink-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-config-outside-'));
    try {
      fs.symlinkSync(outside, path.join(directory, 'link'));
      const result = parseCIConfigContent('output: { directory: link/reports }', path.join(directory, '.aqe-ci.yml'));
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain('output.directory');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  it('accepts bounded YAML merge keys without silently dropping phase settings', () => {
    const result = parseCIConfigContent('defaults: &defaults { type: test, enabled: false }\nphases:\n  - <<: *defaults\n    name: Tests');
    expect(result.success).toBe(true);
    expect(result.config!.phases[0]).toMatchObject({ name: 'Tests', type: 'test', enabled: false });
  });
});
