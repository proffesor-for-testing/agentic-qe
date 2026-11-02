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
import { QualityCriteriaTool } from '../../../../src/mcp/tools/requirements-validation/quality-criteria';
import { QualityGateTool } from '../../../../src/mcp/tools/quality-assessment/gate';
import type { MCPToolContext } from '../../../../src/mcp/tools/base';
// Side-effect import: domain-handler-configs participates in a circular import.
import '../../../../src/mcp/handlers/domain-handlers';
import { contractValidateConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

const ctx = (): MCPToolContext => ({ requestId: 'hardlinks-1329', startTime: Date.now() });
const ANCHOR = fs.readFileSync(path.resolve('verification/anchors/qe-anchor-v1.json'), 'utf8');

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

  // #1329: the other two caller-named reads split out of #1186.
  it('qe/requirements/quality-criteria refuses a hardlinked epicPath and still reads a plain one', async () => {
    const tool = new QualityCriteriaTool();
    const refused = await tool.execute({ assessmentName: 'epic', epicPath: hard }, ctx());
    expect(refused.success).toBe(false);
    expect(refused.error).toContain('hardlinked');
    expect(JSON.stringify(refused)).not.toContain('OUTSIDE_SECRET_1186');

    const read = await tool.execute({ assessmentName: 'epic', epicPath: plain }, ctx());
    expect(read.success, read.error).toBe(true);
    expect(JSON.stringify(read.data)).toContain('inside');
  });

  it('qe/quality/gate refuses a hardlinked anchorPath and still reads a plain one', async () => {
    fs.writeFileSync(path.join(base, 'outside', 'anchor.json'), ANCHOR);
    const hardAnchor = path.join(root, 'hard-anchor.json');
    fs.linkSync(path.join(base, 'outside', 'anchor.json'), hardAnchor);
    const plainAnchor = path.join(root, 'plain-anchor.json');
    fs.writeFileSync(plainAnchor, ANCHOR);

    const tool = new QualityGateTool();
    tool.setLogger({ info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never);
    const params = { checklistId: 'A1-inRange', artifact: 'test artifact', oracle: { passed: true, baselinePassed: true } };

    const refused = await tool.execute({ ...params, anchorPath: hardAnchor }, ctx());
    expect(refused.success).toBe(false);
    expect(refused.error).toContain('hardlinked');

    // A plain anchor gets past the read; whatever the gate decides next, it is not a hardlink refusal.
    const read = await tool.execute({ ...params, anchorPath: plainAnchor }, ctx());
    expect(String(read.error ?? '')).not.toContain('hardlinked');
  });

  it('contract_validate carries the refusal reason to the MCP caller', () => {
    const refused = contractValidateConfig.mapToResult('task-1', {
      valid: false, error: 'Could not read or parse contract file: Cannot read hard.json: hardlinked',
    }, 5);
    expect(refused).toMatchObject({ valid: false, error: expect.stringContaining('hardlinked') });
    expect(contractValidateConfig.mapToResult('task-2', { valid: true }, 5)).not.toHaveProperty('error');
  });
});
