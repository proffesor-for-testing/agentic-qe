/**
 * #999 MCP-CLI parity: the MCP `code_index` result carries the project metrics
 * the index-code handler collected through the code-intelligence coordinator.
 */
import { describe, expect, it } from 'vitest';
// Side-effect import: domain-handler-configs participates in a circular import
// with domain-handlers, so the barrel must be initialized first.
import '../../../../src/mcp/handlers/domain-handlers';
import { codeIndexConfig } from '../../../../src/mcp/handlers/domain-handler-configs.js';

describe('code_index result mapping (#999)', () => {
  it('passes the handler projectMetrics through to the MCP result', () => {
    const projectMetrics = { root: '/p', loc: 3, locByLanguage: { TypeScript: 3 }, tests: 1, toolsUsed: ['node-native'] };
    const result = codeIndexConfig.mapToResult('t1', {
      filesIndexed: 1, symbolsExtracted: 2, relationsFound: 1, projectMetrics,
    }, 5, undefined);
    expect(result.projectMetrics).toEqual(projectMetrics);
    expect(result.filesIndexed).toBe(1);
  });

  it('omits projectMetrics when the handler collected none', () => {
    const result = codeIndexConfig.mapToResult('t2', { filesIndexed: 1 }, 5, undefined);
    expect(result).not.toHaveProperty('projectMetrics');
  });
});
