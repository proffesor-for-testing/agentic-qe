import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeEmittedESM } from '../../../scripts/fix-esm-specifiers.mjs';

describe('normalizeEmittedESM', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should_addExplicitTargets_when_emittedImportsAreExtensionless', () => {
    // Arrange
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-esm-specifiers-'));
    tempDirs.push(distDir);
    fs.mkdirSync(path.join(distDir, 'feature'));
    fs.writeFileSync(path.join(distDir, 'dep.js'), 'export const dep = true;\n');
    fs.writeFileSync(path.join(distDir, 'feature', 'index.js'), 'export const feature = true;\n');
    fs.writeFileSync(
      path.join(distDir, 'index.js'),
      "export { dep } from './dep';\nexport { feature } from './feature';\n",
    );

    // Act
    normalizeEmittedESM(distDir);

    // Assert
    expect(fs.readFileSync(path.join(distDir, 'index.js'), 'utf8')).toBe(
      "export { dep } from './dep.js';\nexport { feature } from './feature/index.js';\n",
    );
  });

  it('should_preserveSpecifier_when_itAlreadyHasAnExtension', () => {
    // Arrange
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-esm-specifiers-'));
    tempDirs.push(distDir);
    fs.writeFileSync(path.join(distDir, 'dep.js'), 'export const dep = true;\n');
    fs.writeFileSync(path.join(distDir, 'index.js'), "export { dep } from './dep.js';\n");

    // Act
    normalizeEmittedESM(distDir);

    // Assert
    expect(fs.readFileSync(path.join(distDir, 'index.js'), 'utf8')).toBe(
      "export { dep } from './dep.js';\n",
    );
  });

  it('should_appendRuntimeExtension_when_sourceBasenameContainsDots', () => {
    // Arrange
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-esm-specifiers-'));
    tempDirs.push(distDir);
    fs.writeFileSync(path.join(distDir, 'e2e-step.types.js'), 'export const step = true;\n');
    fs.writeFileSync(
      path.join(distDir, 'index.js'),
      "export { step } from './e2e-step.types';\n",
    );

    // Act
    normalizeEmittedESM(distDir);

    // Assert
    expect(fs.readFileSync(path.join(distDir, 'index.js'), 'utf8')).toBe(
      "export { step } from './e2e-step.types.js';\n",
    );
  });

  it('should_rewriteTypeScriptPathAliases_toRelativeRuntimeTargets', () => {
    // Arrange
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-esm-specifiers-'));
    tempDirs.push(distDir);
    fs.mkdirSync(path.join(distDir, 'shared'));
    fs.mkdirSync(path.join(distDir, 'domains', 'feature'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'shared', 'error-utils.js'), 'export const ok = true;\n');
    fs.writeFileSync(
      path.join(distDir, 'domains', 'feature', 'index.js'),
      "export { ok } from '@shared/error-utils.js';\n",
    );

    // Act
    normalizeEmittedESM(distDir);

    // Assert
    expect(fs.readFileSync(path.join(distDir, 'domains', 'feature', 'index.js'), 'utf8')).toBe(
      "export { ok } from '../../shared/error-utils.js';\n",
    );
  });
});
