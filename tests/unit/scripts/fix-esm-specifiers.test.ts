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

  describe('declaration files (#1439)', () => {
    function makeDist(): string {
      const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-esm-specifiers-'));
      tempDirs.push(distDir);
      return distDir;
    }

    it('should_addExplicitTargets_when_declarationImportsAreExtensionless', () => {
      // Arrange
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'shared', 'types'), { recursive: true });
      fs.writeFileSync(path.join(distDir, 'dep.js'), 'export const dep = true;\n');
      fs.writeFileSync(path.join(distDir, 'dep.d.ts'), 'export declare const dep: boolean;\n');
      fs.writeFileSync(path.join(distDir, 'shared', 'types', 'index.js'), 'export {};\n');
      fs.writeFileSync(path.join(distDir, 'shared', 'types', 'index.d.ts'), 'export type Id = string;\n');
      fs.writeFileSync(
        path.join(distDir, 'index.d.ts'),
        "export * from './shared/types';\nexport { dep } from './dep';\n"
          + "export * as Types from './shared/types';\n"
          + "export declare const load: () => typeof import('./dep');\n",
      );

      // Act
      normalizeEmittedESM(distDir);

      // Assert
      expect(fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf8')).toBe(
        "export * from './shared/types/index.js';\nexport { dep } from './dep.js';\n"
          + "export * as Types from './shared/types/index.js';\n"
          + "export declare const load: () => typeof import('./dep.js');\n",
      );
    });

    it('should_resolveDeclarationOnlyModules', () => {
      // Arrange: a module with no emitted JavaScript, only a declaration.
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'api'));
      fs.writeFileSync(path.join(distDir, 'shapes.d.ts'), 'export type Shape = string;\n');
      fs.writeFileSync(path.join(distDir, 'api', 'index.d.ts'), 'export type Api = string;\n');
      fs.writeFileSync(
        path.join(distDir, 'index.d.ts'),
        "export type { Shape } from './shapes';\nexport type { Api } from './api';\n",
      );

      // Act
      normalizeEmittedESM(distDir);

      // Assert
      expect(fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf8')).toBe(
        "export type { Shape } from './shapes.js';\nexport type { Api } from './api/index.js';\n",
      );
    });

    it('should_rewritePathAliases_inDeclarations', () => {
      // Arrange
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'shared'));
      fs.mkdirSync(path.join(distDir, 'domains', 'feature'), { recursive: true });
      fs.writeFileSync(path.join(distDir, 'shared', 'error-utils.js'), 'export const ok = true;\n');
      fs.writeFileSync(path.join(distDir, 'shared', 'error-utils.d.ts'), 'export declare const ok: boolean;\n');
      fs.writeFileSync(
        path.join(distDir, 'domains', 'feature', 'index.d.ts'),
        "import { ok } from '@shared/error-utils';\nexport { ok };\n",
      );

      // Act
      normalizeEmittedESM(distDir);

      // Assert
      expect(fs.readFileSync(path.join(distDir, 'domains', 'feature', 'index.d.ts'), 'utf8')).toBe(
        "import { ok } from '../../shared/error-utils.js';\nexport { ok };\n",
      );
    });

    it('should_resolveDirectorySpecifiers_toTheirIndex', () => {
      // Arrange: TypeScript emits import("..") for inferred types.
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'llm', 'router'), { recursive: true });
      fs.writeFileSync(path.join(distDir, 'llm', 'index.d.ts'), 'export type M = number;\n');
      fs.writeFileSync(path.join(distDir, 'llm', 'router', 'index.d.ts'), 'export type R = number;\n');
      fs.writeFileSync(path.join(distDir, 'llm', 'router.d.ts'), 'export type Wrong = number;\n');
      fs.writeFileSync(
        path.join(distDir, 'llm', 'router', 'hybrid.d.ts'),
        "export declare function m(): import(\"..\").M;\nexport type { R } from '.';\n"
          + "export type { R as R2 } from '../router/';\nexport type { Q } from '../../missing/..';\n",
      );

      // Act
      normalizeEmittedESM(distDir);

      // Assert: '..' is the parent's index, never a sibling file named after it.
      expect(fs.readFileSync(path.join(distDir, 'llm', 'router', 'hybrid.d.ts'), 'utf8')).toBe(
        "export declare function m(): import(\"../index.js\").M;\nexport type { R } from './index.js';\n"
          + "export type { R as R2 } from '../router/index.js';\nexport type { Q } from '../../missing/..';\n",
      );
    });

    it('should_keepJavaScriptImporters_onRuntimeFilesOnly', () => {
      // Arrange: a declaration-only module has no file a .js import could load.
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'lib'));
      fs.writeFileSync(path.join(distDir, 'shapes.d.ts'), 'export type Shape = string;\n');
      fs.writeFileSync(path.join(distDir, 'lib', 'index.js'), 'export const lib = 1;\n');
      fs.writeFileSync(path.join(distDir, 'lib', 'util.js'), "import './shapes';\nexport { lib } from '.';\n");
      fs.writeFileSync(path.join(distDir, 'a.js'), "import './shapes';\nexport { lib } from './lib/';\n");

      // Act
      normalizeEmittedESM(distDir);

      // Assert
      expect(fs.readFileSync(path.join(distDir, 'a.js'), 'utf8')).toBe(
        "import './shapes';\nexport { lib } from './lib/index.js';\n",
      );
      expect(fs.readFileSync(path.join(distDir, 'lib', 'util.js'), 'utf8')).toBe(
        "import './shapes';\nexport { lib } from './index.js';\n",
      );
    });

    it('should_beIdempotent_andKeepSuffixes', () => {
      // Arrange
      const distDir = makeDist();
      fs.mkdirSync(path.join(distDir, 'feature'));
      fs.writeFileSync(path.join(distDir, 'feature', 'index.js'), 'export const f = 1;\n');
      fs.writeFileSync(path.join(distDir, 'feature', 'index.d.ts'), 'export declare const f: number;\n');
      fs.writeFileSync(path.join(distDir, 'dep.d.ts'), 'export type D = 1;\n');
      fs.writeFileSync(
        path.join(distDir, 'index.d.ts'),
        "export * from './feature/?raw';\nexport * from './feature';\nexport type { D } from './dep';\n",
      );

      // Act
      normalizeEmittedESM(distDir);
      const once = fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf8');
      const second = normalizeEmittedESM(distDir);

      // Assert
      expect(once).toBe(
        "export * from './feature/index.js?raw';\nexport * from './feature/index.js';\nexport type { D } from './dep.js';\n",
      );
      expect(fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf8')).toBe(once);
      expect(second.rewrittenSpecifiers).toBe(0);
    });

    it('should_leaveUnresolvedAndPackageSpecifiersAlone', () => {
      // Arrange
      const distDir = makeDist();
      const source = "export * from './missing';\nimport type { Z } from 'zod';\nexport type { Z };\n";
      fs.writeFileSync(path.join(distDir, 'index.d.ts'), source);

      // Act
      normalizeEmittedESM(distDir);

      // Assert
      expect(fs.readFileSync(path.join(distDir, 'index.d.ts'), 'utf8')).toBe(source);
    });
  });
});
