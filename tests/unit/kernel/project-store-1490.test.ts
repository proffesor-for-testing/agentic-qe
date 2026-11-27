/**
 * #1490: an uninitialized project is not made to look initialized.
 *
 * - isProjectInitialized() needs a real store (config.yaml or a non-empty
 *   memory.db), not just the `.agentic-qe` directory.
 * - CLI/MCP startup token tracking never creates the project store, and saves
 *   metrics there only once something else has created it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasEvidenceStore, isProjectInitialized } from '../../../src/kernel/project-store.js';
import { hasEvidenceStore as proveHasEvidenceStore } from '../../../src/cli/commands/prove.js';
import { clearProjectRootCache } from '../../../src/kernel/project-root.js';
import { bootstrapTokenTracking, shutdownTokenTracking } from '../../../src/init/token-bootstrap.js';
import { TokenMetricsCollector } from '../../../src/learning/token-tracker.js';

let root: string;
const store = () => join(root, '.agentic-qe');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-1490-'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'package.json'), '{"name":"x"}');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('isProjectInitialized (#1490)', () => {
  it('is false for a project with no .agentic-qe', () => {
    expect(isProjectInitialized(root)).toBe(false);
  });

  it('is false for an empty .agentic-qe directory', () => {
    mkdirSync(store());
    expect(isProjectInitialized(root)).toBe(false);
  });

  it('is false when the directory holds only unrelated files or empty store files', () => {
    mkdirSync(store());
    writeFileSync(join(store(), 'token-metrics.json'), '{}');
    writeFileSync(join(store(), 'memory.db'), '');
    writeFileSync(join(store(), 'config.yaml'), '');
    expect(isProjectInitialized(root)).toBe(false);
  });

  it('is false for a directory named config.yaml or a dangling memory.db symlink', () => {
    mkdirSync(join(store(), 'config.yaml'), { recursive: true });
    symlinkSync(join(root, 'missing.db'), join(store(), 'memory.db'));
    expect(isProjectInitialized(root)).toBe(false);
  });

  it('is true once aqe init has written config.yaml', () => {
    mkdirSync(store());
    writeFileSync(join(store(), 'config.yaml'), 'version: "3"\n');
    expect(isProjectInitialized(root)).toBe(true);
    expect(hasEvidenceStore(root)).toBe(false);
  });

  it('is true for a project that holds a non-empty memory.db without config.yaml', () => {
    mkdirSync(store());
    writeFileSync(join(store(), 'memory.db'), 'SQLite format 3\0');
    expect(isProjectInitialized(root)).toBe(true);
    expect(hasEvidenceStore(root)).toBe(true);
  });

  it('prove keeps exporting the shared evidence-store check', () => {
    expect(proveHasEvidenceStore).toBe(hasEvidenceStore);
  });
});

describe('startup token tracking does not create the project store (#1490)', () => {
  beforeEach(() => {
    vi.stubEnv('AQE_PROJECT_ROOT', '');
    vi.stubEnv('AQE_STORAGE_PATH', '');
    vi.stubEnv('AQE_MEMORY_PATH', '');
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    clearProjectRootCache();
  });

  afterEach(async () => {
    await shutdownTokenTracking();
    clearProjectRootCache();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('leaves an uninitialized project without .agentic-qe, even on save', async () => {
    const configure = vi.spyOn(TokenMetricsCollector, 'configurePersistence');

    await bootstrapTokenTracking({ enableOptimization: false, enablePersistence: true });

    expect(configure).toHaveBeenCalledWith(expect.objectContaining({
      filePath: join(store(), 'token-metrics.json'),
      createDirectory: false,
    }));
    await TokenMetricsCollector.save();
    expect(existsSync(store())).toBe(false);
  });

  it('saves metrics into the store once aqe init (or the kernel) has created it', async () => {
    await bootstrapTokenTracking({ enableOptimization: false, enablePersistence: true });
    mkdirSync(store());

    await TokenMetricsCollector.save();

    expect(existsSync(join(store(), 'token-metrics.json'))).toBe(true);
  });

  it('still creates an explicit, non-default metrics location', async () => {
    const custom = join(root, 'custom-metrics');
    const configure = vi.spyOn(TokenMetricsCollector, 'configurePersistence');

    await bootstrapTokenTracking({ enableOptimization: false, enablePersistence: true, storagePath: custom });

    expect(existsSync(custom)).toBe(true);
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ createDirectory: true }));
    expect(existsSync(store())).toBe(false);
  });
});
