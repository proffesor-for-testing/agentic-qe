/**
 * #1350: the sast-scan plugin task takes its hardlink policy from the task
 * request (set by the MCP server on task_submit / task_orchestrate), never
 * from the payload. A task without one (`aqe fleet run scan`) reads
 * hardlinked files as on main. Real hardlinks in a temporary project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SecurityCompliancePlugin } from '../../../../src/domains/security-compliance/plugin';
import {
  MockAgentCoordinator, MockEventBus, MockMemoryBackend, createMockCallback, createMockTaskRequest,
} from '../plugin-test-utils';

const SECRET = 'OUTSIDE_SECRET_1350';

describe('sast-scan task hardlink policy (#1350)', () => {
  let base: string;
  let root: string;
  let leak: string;
  let plugin: SecurityCompliancePlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agents: MockAgentCoordinator;

  beforeEach(async () => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-task-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'secret.js'), `const password = "${SECRET}_pw";\neval(input);\n`);
    leak = path.join(root, 'src', 'leak.js');
    fs.linkSync(path.join(base, 'outside', 'secret.js'), leak);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agents = new MockAgentCoordinator();
    plugin = new SecurityCompliancePlugin(eventBus, memory, agents);
    await plugin.initialize();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await plugin.dispose();
    await eventBus.dispose();
    await memory.dispose();
    await agents.dispose();
    fs.rmSync(base, { recursive: true, force: true });
  });

  async function scan(extra: Record<string, unknown>, payload: Record<string, unknown> = { files: [leak] }) {
    const { callback, waitForResult } = createMockCallback();
    const accepted = await plugin.executeTask({ ...createMockTaskRequest('sast-scan', payload), ...extra }, callback);
    expect(accepted.success).toBe(true);
    return waitForResult();
  }

  it('refuses a hardlinked file when the MCP server set the policy', async () => {
    const result = await scan({ readHardlinks: 'refuse-outside-node-modules' });
    expect(result.success, result.error).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    const evidence = (result.data as { evidence: { files: Array<{ path: string; status: string; reason?: string }> } }).evidence;
    expect(evidence.files).toContainEqual(expect.objectContaining({ path: leak, status: 'unreadable', reason: 'HARDLINKED' }));
  });

  it('reads it with no policy on the task, as `aqe fleet run scan` submits it', async () => {
    const result = await scan({});
    expect(result.success, result.error).toBe(true);
    const evidence = (result.data as { evidence: { files: Array<{ path: string; status: string }> } }).evidence;
    expect(evidence.files).toContainEqual(expect.objectContaining({ path: leak, status: 'analyzed' }));
  });

  it('ignores a policy in the payload: only the task request carries it', async () => {
    const result = await scan({ readHardlinks: 'refuse-outside-node-modules' }, { files: [leak], readHardlinks: 'allow' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
