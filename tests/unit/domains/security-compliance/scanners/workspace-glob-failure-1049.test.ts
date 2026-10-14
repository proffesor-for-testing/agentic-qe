/**
 * #1049 review round 4 (B1, fail-closed): a workspace pattern that cannot be
 * expanded is reported as an error, never skipped silently. The glob engine
 * is made to throw to exercise that path.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('tinyglobby', () => ({
  glob: vi.fn(async (pattern: string) => {
    if (pattern.startsWith('broken')) throw new Error('simulated glob failure');
    return [];
  }),
}));

import { expandWorkspaces } from '../../../../../src/domains/security-compliance/services/scanners/workspace-members';

describe('expandWorkspaces fail-closed (#1049)', () => {
  it('an unexpandable pattern is an error, the others still expand', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aqe-1049-globfail-'));
    try {
      writeFileSync(path.join(root, 'package.json'), '{}');
      const result = await expandWorkspaces(root, ['broken/**', 'packages/*']);
      expect(result.errors).toEqual([expect.stringMatching(/workspace pattern "broken\/\*\*" could not be expanded \(simulated glob failure\)/)]);
      expect(result.members).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
