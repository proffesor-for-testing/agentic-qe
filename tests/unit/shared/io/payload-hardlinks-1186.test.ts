/**
 * #1186: the reads of a file named by an MCP or task caller refuse a
 * hardlink (`hardlinks: 'refuse'`), because no path check can tell where a
 * hardlink's other names are. Real hardlinks in a temporary project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleValidationPipeline } from '../../../../src/mcp/handlers/validation-pipeline-handler';
import { registerRequirementsHandlers } from '../../../../src/coordination/handlers/requirements-handlers';
import type { InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';

const SECRET = '{"OUTSIDE_SECRET_1186": true}';

describe('caller-named payload files refuse hardlinks (#1186)', () => {
  let base: string;
  let root: string;
  let hard: string;
  let plain: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1186-hard-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(root);
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'secret.json'), SECRET);
    hard = path.join(root, 'hard.json');
    fs.linkSync(path.join(base, 'outside', 'secret.json'), hard);
    plain = path.join(root, 'plain.json');
    fs.writeFileSync(plain, '{"inside": true}');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('validation_pipeline refuses a hardlinked file and still reads a plain one', async () => {
    const refused = await handleValidationPipeline({ filePath: hard });
    expect(refused.success).toBe(false);
    expect(refused.error).toContain('hardlinked');
    expect(JSON.stringify(refused)).not.toContain('OUTSIDE_SECRET_1186');

    expect((await handleValidationPipeline({ filePath: plain })).success).toBe(true);
  });

  it('validate-contracts refuses a hardlinked contract and still reads a plain one', async () => {
    const handlers = new Map<string, InstanceTaskHandler>();
    registerRequirementsHandlers({ registerHandler: (type: string, fn: InstanceTaskHandler) => handlers.set(type, fn) } as never);
    const run = async (contractPath: string) =>
      (await handlers.get('validate-contracts')!({ payload: { contractPath } } as never)) as
        { success: boolean; value: { valid: boolean; error?: string; linesAnalyzed?: number } };

    const refused = await run(hard);
    expect(refused.value).toMatchObject({ valid: false });
    expect(refused.value.error).toContain('hardlinked');

    expect((await run(plain)).value).toMatchObject({ valid: true, linesAnalyzed: 1 });
  });
});
