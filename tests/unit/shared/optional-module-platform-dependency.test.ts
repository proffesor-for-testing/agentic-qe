import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadOptionalModule, optionalModule } from '../../../src/shared/optional-module.js';

describe('installed optional wrappers without their platform dependency', () => {
  it.each([
    ['owned-native', 'owned-native-linux-x64-gnu'],
    ['@owned/native', '@owned/native-linux-x64-gnu'],
    ['owned-ordinary', 'missing-inner-dependency-owned'],
  ])('degrades %s and identifies missing %s', (name, dependency) => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-owned-optional-platform-'));
    try {
      const folder = join(root, 'node_modules', name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, main: 'index.cjs' }));
      writeFileSync(join(folder, 'index.cjs'), `module.exports = require(${JSON.stringify(dependency)});`);
      const req = createRequire(join(root, 'consumer.cjs'));
      expect(req.resolve(name)).toBe(realpathSync(join(folder, 'index.cjs')));
      const result = loadOptionalModule(name, req);
      expect(result).toMatchObject({ available: false, degraded: true, name });
      if (result.available) throw new Error('Unexpected successful wrapper load');
      expect(result.reason).toContain('installed');
      expect(result.reason).toContain(dependency);
      expect(optionalModule(name, req)).toBeUndefined();
      expect(loadOptionalModule('owned-not-installed', req)).toMatchObject({ available: false, degraded: true });
      writeFileSync(join(folder, 'index.cjs'), 'module.exports = { ready: true };');
      expect(loadOptionalModule(name, req)).toMatchObject({ available: true, degraded: false, module: { ready: true } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
