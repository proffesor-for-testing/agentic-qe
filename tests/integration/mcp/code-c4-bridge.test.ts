/**
 * ADR-112 — qe/code/c4 is actually SERVED through the protocol-server bridge.
 *
 * The protocol server registers QE_TOOLS via registerMissingQETools(). This
 * proves the new tool reaches that path with a definition + working handler
 * (CLAUDE.md: MCP fixes must be verified through the server path, not just the
 * in-process tool class).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerMissingQETools } from '../../../src/mcp/qe-tool-bridge';

interface CapturedEntry {
  definition: { name: string; description?: string; parameters?: unknown[] };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-bridge-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'svc', dependencies: { pg: '^8.0.0' } }));
  fs.mkdirSync(path.join(tmp, 'src', 'services'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'services', 'a.ts'), 'export class A {}\n');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('qe/code/c4 served via the QE tool bridge', () => {
  it('should_register_qe_code_c4_with_a_definition_and_handler', async () => {
    const entries: CapturedEntry[] = [];
    registerMissingQETools((e) => entries.push(e as unknown as CapturedEntry));

    const c4 = entries.find((e) => e.definition.name === 'qe/code/c4');
    expect(c4, 'qe/code/c4 must be bridged into the server').toBeDefined();
    expect(typeof c4!.handler).toBe('function');
    expect(c4!.definition.parameters?.length).toBeGreaterThan(0);
  });

  it('should_execute_generate_through_the_bridged_handler', async () => {
    const entries: CapturedEntry[] = [];
    registerMissingQETools((e) => entries.push(e as unknown as CapturedEntry));
    const c4 = entries.find((e) => e.definition.name === 'qe/code/c4')!;

    const out = (await c4.handler({ action: 'generate', projectPath: tmp, level: 'context' })) as {
      success?: boolean; data?: { generateResult?: { diagrams?: { context?: string } } };
      generateResult?: { diagrams?: { context?: string } };
    };
    // The bridge may unwrap ToolResult; accept either shape.
    const ctxDiagram = out?.data?.generateResult?.diagrams?.context ?? out?.generateResult?.diagrams?.context;
    expect(ctxDiagram, JSON.stringify(out).slice(0, 300)).toContain('C4Context');
  });
});
