import { beforeEach, describe, expect, it, vi } from 'vitest';
const seams = vi.hoisted(() => ({
  client: { isAvailable: vi.fn(), dispose: vi.fn() }, create: vi.fn(), runner: vi.fn(),
}));
vi.mock('../../../src/integrations/vibium', () => ({ createVibiumClient: seams.create }));
vi.mock('../../../src/domains/test-execution', () => ({ createE2ETestRunnerService: seams.runner }));
import { E2EExecuteTool } from '../../../src/mcp/tools/test-execution/e2e-execute.js';

describe('MCP browser readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seams.client.isAvailable.mockResolvedValue(false);
    seams.client.dispose.mockResolvedValue(undefined);
    seams.create.mockResolvedValue(seams.client);
  });
  it('never reports a fake E2E pass when the optional browser is absent', async () => {
    const result = await new E2EExecuteTool().execute({
      testCase: { id: 'missing-browser', name: 'requires browser', description: '', baseUrl: 'http://localhost', steps: [] },
    }, { requestId: 'missing-browser', startTime: Date.now() });
    expect(seams.create).toHaveBeenCalledWith({ enabled: true, fallbackEnabled: false });
    expect(result.success).toBe(false);
    expect(result.error).toContain('aqe init --browser-engine');
    expect(seams.runner).not.toHaveBeenCalled();
    expect(seams.client.dispose).toHaveBeenCalledOnce();
  });
  it('disposes the browser after execution failure', async () => {
    seams.client.isAvailable.mockResolvedValue(true);
    seams.runner.mockReturnValue({ runTestCase: vi.fn().mockRejectedValue(new Error('navigation failed')) });
    const result = await new E2EExecuteTool().execute({
      testCase: { id: 'failed-browser', name: 'requires browser', description: '', baseUrl: 'http://localhost', steps: [] },
    }, { requestId: 'failed-browser', startTime: Date.now() });
    expect(result.success).toBe(false);
    expect(result.error).toContain('navigation failed');
    expect(seams.client.dispose).toHaveBeenCalledOnce();
  });
});
