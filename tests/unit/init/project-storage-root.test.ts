import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapTokenTracking, shutdownTokenTracking } from '../../../src/init/token-bootstrap.js';
import { TokenMetricsCollector } from '../../../src/learning/token-tracker.js';
import { clearProjectRootCache } from '../../../src/kernel/project-root.js';
import { saveEmbedderIdentity, resetEmbedderIdentityStore, loadEmbedderIdentity } from '../../../src/learning/embedder-identity-store.js';

describe('project storage from nested working directories (#735)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-storage-root-'));
    mkdirSync(join(root, '.agentic-qe'));
    mkdirSync(join(root, 'sub'));
    vi.stubEnv('AQE_PROJECT_ROOT', '');
    vi.stubEnv('AQE_STORAGE_PATH', '');
    vi.stubEnv('AQE_MEMORY_PATH', '');
    clearProjectRootCache();
  });
  afterEach(async () => {
    await shutdownTokenTracking();
    resetEmbedderIdentityStore();
    clearProjectRootCache();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['sub', '.agentic-qe'])('bootstraps metrics at the project store from %s', async nested => {
    const cwd = join(root, nested);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    const configure = vi.spyOn(TokenMetricsCollector, 'configurePersistence');
    await bootstrapTokenTracking({ enableOptimization: false });
    expect(existsSync(join(cwd, '.agentic-qe'))).toBe(false);
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ filePath: join(root, '.agentic-qe', 'token-metrics.json') }));
  });

  it('isolates bootstrap for a new git project below an ancestor AQE store', async () => {
    const project = join(root, 'new-project');
    mkdirSync(join(project, '.git'), {recursive: true});
    mkdirSync(join(project, 'src'));
    vi.spyOn(process, 'cwd').mockReturnValue(join(project, 'src'));
    const configure = vi.spyOn(TokenMetricsCollector, 'configurePersistence');
    await bootstrapTokenTracking({enableOptimization: false});
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({filePath: join(project, '.agentic-qe', 'token-metrics.json')}));
    expect(existsSync(join(project, 'src', '.agentic-qe'))).toBe(false);
  });

  it('resolves relative embedder memory overrides from the project root', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'sub'));
    vi.stubEnv('AQE_MEMORY_PATH', 'custom/identity.db');
    const identity = {fingerprint: 'relative-path', dim: 3, endpoint: 'http://localhost:9999'};
    saveEmbedderIdentity(identity);
    expect(loadEmbedderIdentity(identity.endpoint)).toEqual(identity);
    expect(existsSync(join(root, 'custom', 'identity.db'))).toBe(true);
    expect(existsSync(join(root, 'sub', 'custom'))).toBe(false);
  });

  it('honors an explicit project root before bootstrap creates a directory', async () => {
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'sub'));
    await bootstrapTokenTracking({ enableOptimization: false });
    expect(existsSync(join(root, 'sub', '.agentic-qe'))).toBe(false);
  });

  it('stores embedder provenance in the root database', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'sub'));
    const identity = { fingerprint: 'test-fingerprint', dim: 3, endpoint: 'http://localhost:9999' };
    saveEmbedderIdentity(identity);
    expect(loadEmbedderIdentity(identity.endpoint)).toEqual(identity);
    expect(existsSync(join(root, '.agentic-qe', 'memory.db'))).toBe(true);
    expect(existsSync(join(root, 'sub', '.agentic-qe'))).toBe(false);
  });

  it('preserves an explicit metrics storage override', async () => {
    const custom = join(root, 'custom');
    const configure = vi.spyOn(TokenMetricsCollector, 'configurePersistence');
    await bootstrapTokenTracking({ enableOptimization: false, storagePath: custom });
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ filePath: join(custom, 'token-metrics.json') }));
  });
});
