/**
 * #1096: the other services that read user-named files (compliance patterns,
 * contract import, defect prediction) do not follow a symlink out of the
 * project. Real temp project with real symlinks to files outside it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CompliancePatternAnalyzer } from '../../../../src/shared/security/compliance-patterns';
import { ContractTestingCoordinator } from '../../../../src/domains/contract-testing/coordinator';
import { DefectPredictorService } from '../../../../src/domains/defect-intelligence/services/defect-predictor';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend';
import { FilePath } from '../../../../src/shared/value-objects/index';
import { createCoordinatorTestContext, resetTestContext } from '../../domains/coordinator-test-utils';

const WEAK_CRYPTO = "const digest = crypto.createHash('md5');\n";
const OPENAPI = JSON.stringify({ openapi: '3.0.0', info: { title: 'Outside API', version: '1.0.0' }, paths: {} });

describe('project-rooted readers (#1096)', () => {
  const cwd = process.cwd();
  let base: string;
  let project: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1096-readers-')));
    project = path.join(base, 'proj');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(project, 'src', 'inside.ts'), WEAK_CRYPTO);
    fs.writeFileSync(path.join(base, 'outside', 'crypto.ts'), WEAK_CRYPTO);
    fs.writeFileSync(path.join(base, 'outside', 'openapi.json'), OPENAPI);
    fs.symlinkSync(path.join('..', '..', 'outside', 'crypto.ts'), path.join(project, 'src', 'leak.ts'));
    fs.symlinkSync(path.join('..', '..', 'outside', 'openapi.json'), path.join(project, 'src', 'openapi.json'));
    vi.stubEnv('AQE_PROJECT_ROOT', project);
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('compliance analysis reports the in-project file but not the symlinked outside one', async () => {
    const analysis = await new CompliancePatternAnalyzer().analyzeEncryption([
      path.join(project, 'src', 'inside.ts'),
      path.join(project, 'src', 'leak.ts'),
    ]);

    expect(analysis.weakCrypto.map((m) => m.file)).toEqual([path.join(project, 'src', 'inside.ts')]);
  });

  it('contract import does not load a spec through a symlink out of the project', async () => {
    const ctx = createCoordinatorTestContext();
    const coordinator = new ContractTestingCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator);
    try {
      const result = await coordinator.importFromOpenAPI(FilePath.create(path.join(project, 'src', 'openapi.json')));

      expect(result.success).toBe(false);
    } finally {
      await coordinator.dispose();
      resetTestContext(ctx);
    }
  });

  it('defect prediction reads through a project-rooted reader', async () => {
    const predictor = new DefectPredictorService({ memory: new InMemoryBackend() });
    const reader = (predictor as unknown as { fileReader: { readFile(p: string): Promise<{ success: boolean }> } }).fileReader;

    expect((await reader.readFile(path.join(project, 'src', 'inside.ts'))).success).toBe(true);
    expect((await reader.readFile(path.join(project, 'src', 'leak.ts'))).success).toBe(false);
  });
});
