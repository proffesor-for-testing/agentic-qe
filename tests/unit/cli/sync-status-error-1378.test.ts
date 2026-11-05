/**
 * #1378: `aqe sync status` shows a source that could not be counted (e.g. a
 * corrupt JSON store) as ✗ with its error and "Records: N/A", not 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getStatus = vi.fn();
vi.mock('../../../src/sync/index.js', () => ({
  createSyncAgent: vi.fn(() => ({ initialize: vi.fn(), getStatus, close: vi.fn() })),
  syncToCloud: vi.fn(), syncIncrementalToCloud: vi.fn(), pullFromCloud: vi.fn(), pullIncrementalFromCloud: vi.fn(),
  pullTablesProblem: vi.fn(() => null),
  DEFAULT_SYNC_CONFIG: { sync: { sources: [] } },
  DEFAULT_PULL_CONFIG: { sources: [] },
}));
vi.mock('ora', () => ({
  default: () => {
    const s = { text: '', start: () => s, stop: () => s, fail: vi.fn(), succeed: vi.fn(), info: vi.fn() };
    return s;
  },
}));

import { createSyncCommands } from '../../../src/cli/commands/sync.js';

describe('aqe sync status with an unreadable source (#1378)', () => {
  let out: string[];
  beforeEach(() => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  });
  afterEach(() => vi.restoreAllMocks());

  it('prints ✗ and Records: N/A for the source with an error, and its count for the others', async () => {
    getStatus.mockResolvedValue({ sources: [
      { name: 'claude-flow-memory', type: 'json', targetTable: 't', recordCount: 0, enabled: true, priority: 'medium',
        error: 'JSON source claude-flow-memory could not be parsed: store.json: not valid JSON' },
      { name: 'root-qe-patterns', type: 'sqlite', targetTable: 'q', recordCount: 2, enabled: true, priority: 'high' },
    ] });
    await createSyncCommands().parseAsync(['node', 'sync', 'status']);
    const text = out.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    const block = (name: string) => text.slice(text.indexOf(name) - 2, text.indexOf('Priority', text.indexOf(name)));
    expect(block('claude-flow-memory')).toMatch(/^✗ claude-flow-memory[\s\S]*Records: N\/A/);
    expect(text).toMatch(/Error: JSON source claude-flow-memory could not be parsed/);
    expect(block('root-qe-patterns')).toMatch(/^✓ root-qe-patterns[\s\S]*Records: 2/);
  });
});
