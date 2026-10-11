import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadOptionalModule } from '../../../src/shared/optional-module.js';

describe('optional dependency load failures', () => {
  it('does not call an installed package absent when its own dependency is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-optional-transitive-'));
    try {
      const folder = join(root, 'node_modules', 'installed-optional');
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'installed-optional', main: 'index.cjs' }));
      writeFileSync(join(folder, 'index.cjs'), "module.exports = require('missing-inner-dependency-aqe');");
      const req = createRequire(join(root, 'consumer.cjs'));
      expect(loadOptionalModule('installed-optional', req)).toMatchObject({
        available: false, degraded: true, name: 'installed-optional',
        reason: expect.stringContaining('missing-inner-dependency-aqe'),
      });
      expect(loadOptionalModule('really-absent-optional-aqe', req)).toMatchObject({ available: false, degraded: true });
      writeFileSync(join(folder, 'index.cjs'), 'module.exports = { ready: true };');
      expect(loadOptionalModule('installed-optional', req)).toMatchObject({ available: true, module: { ready: true } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
