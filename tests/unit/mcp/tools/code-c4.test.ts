/**
 * ADR-112 — qe/code/c4 MCP tool tests, incl. MCP-CLI parity.
 *
 * The MCP tool and the CLI both drive the SAME ProductFactorsBridgeService
 * pipeline, so a generate over a fixture must yield the same diagrams +
 * confidence the CLI's coordinator path produces (CLAUDE.md MCP-CLI parity rule).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockMemory } from '../../../mocks';
import { CodeC4Tool } from '../../../../src/mcp/tools/code-intelligence/c4';
import { ProductFactorsBridgeService } from '../../../../src/domains/code-intelligence/services/product-factors-bridge';
import { InMemoryEventBus } from '../../../../src/kernel/event-bus';
import type { MCPToolContext } from '../../../../src/mcp/tools/base';

let tmp: string;

function makeFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mcp-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'billing-svc', description: 'Billing service', dependencies: { pg: '^8.0.0' },
  }));
  for (const sub of ['controllers', 'services']) {
    fs.mkdirSync(path.join(dir, 'src', sub), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', sub, 'billing.ts'), `export class Billing_${sub} {}\n`);
  }
  return dir;
}

const ctx = (memory: ReturnType<typeof createMockMemory>): MCPToolContext => ({
  requestId: 'test', startTime: Date.now(), memory,
});

beforeEach(() => { tmp = makeFixture(); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('qe/code/c4 MCP tool', () => {
  it('should_be_named_and_domain_scoped', () => {
    const tool = new CodeC4Tool();
    expect(tool.config.name).toBe('qe/code/c4');
    expect(tool.config.domain).toBe('code-intelligence');
  });

  it('should_generate_C4_diagrams_with_a_confidence_assessment', async () => {
    const tool = new CodeC4Tool();
    const res = await tool.execute({ action: 'generate', projectPath: tmp, level: 'all' }, ctx(createMockMemory()));
    expect(res.success).toBe(true);
    const gen = res.data?.generateResult;
    expect(gen?.diagrams.context).toContain('C4Context');
    expect(gen?.diagrams.component).toContain('C4Component');
    expect(gen?.confidence).toBeDefined();
    expect(['high', 'medium', 'low']).toContain(gen!.confidence!.level);
  });

  it('should_respect_the_level_parameter', async () => {
    const tool = new CodeC4Tool();
    const res = await tool.execute({ action: 'generate', projectPath: tmp, level: 'context' }, ctx(createMockMemory()));
    expect(res.success).toBe(true);
    const gen = res.data?.generateResult;
    expect(gen?.diagrams.context).toBeDefined();
    expect(gen?.diagrams.component).toBeUndefined();
  });

  it('should_require_a_query_for_search', async () => {
    const tool = new CodeC4Tool();
    const res = await tool.execute({ action: 'search' }, ctx(createMockMemory()));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/query/i);
  });

  it('should_return_hits_for_search_after_generate_persists_embeddings', async () => {
    // ADR-112: generate embeds + persists diagrams; search finds them via the
    // shared memory + namespace. Same tool instance + same context memory.
    const tool = new CodeC4Tool();
    const context = ctx(createMockMemory());

    const gen = await tool.execute({ action: 'generate', projectPath: tmp, level: 'all' }, context);
    expect(gen.success).toBe(true);

    const found = await tool.execute({ action: 'search', query: 'billing service architecture', limit: 5 }, context);
    expect(found.success).toBe(true);
    expect(found.data?.searchResult?.total).toBeGreaterThan(0);
  });

  it('should_produce_diagrams_matching_the_bridge_pipeline_the_CLI_uses', async () => {
    // MCP path
    const tool = new CodeC4Tool();
    const mcp = await tool.execute({ action: 'generate', projectPath: tmp, level: 'all' }, ctx(createMockMemory()));
    expect(mcp.success).toBe(true);

    // CLI/coordinator path = the same bridge pipeline
    const bridge = new ProductFactorsBridgeService(new InMemoryEventBus(), createMockMemory(), { publishEvents: false });
    const cli = await bridge.requestC4Diagrams({
      projectPath: tmp,
      includeContext: true, includeContainer: true, includeComponent: true, includeDependency: true,
      analyzeComponents: true, detectExternalSystems: true, analyzeCoupling: true,
    });
    expect(cli.success).toBe(true);
    if (!cli.success) return;

    const gen = mcp.data!.generateResult!;
    expect(gen.componentsDetected).toBe(cli.value.components.length);
    expect(gen.externalSystemsDetected).toBe(cli.value.externalSystems.length);
    expect(gen.diagrams.context).toBe(cli.value.diagrams.context);
    expect(gen.diagrams.component).toBe(cli.value.diagrams.component);
  });
});
