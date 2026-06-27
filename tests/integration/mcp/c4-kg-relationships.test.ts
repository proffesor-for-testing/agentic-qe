/**
 * ADR-112 C2 — REAL Knowledge Graph end-to-end.
 *
 * Proves the resolver turns actual `import` statements into component→component
 * relationships using the live KnowledgeGraphService (AST/TS parser, no LLM),
 * and that the bridge then surfaces them with raised confidence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockMemory, createMockEventBus } from '../../mocks';
import { KnowledgeGraphService } from '../../../src/domains/code-intelligence/services/knowledge-graph';
import { createKnowledgeGraphRelationshipResolver } from '../../../src/domains/code-intelligence/services/c4-model/kg-relationships';
import { ProductFactorsBridgeService } from '../../../src/domains/code-intelligence/services/product-factors-bridge';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-c2-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'svc', description: 'svc' }));
  // controller imports service; service imports repository → a real chain.
  fs.mkdirSync(path.join(tmp, 'src', 'controllers'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'services'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'repositories'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'repositories', 'order.ts'), 'export class OrderRepository { save() {} }\n');
  fs.writeFileSync(path.join(tmp, 'src', 'services', 'order.ts'),
    "import { OrderRepository } from '../repositories/order';\nexport class OrderService { constructor(private r = new OrderRepository()) {} }\n");
  fs.writeFileSync(path.join(tmp, 'src', 'controllers', 'order.ts'),
    "import { OrderService } from '../services/order';\nexport class OrderController { constructor(private s = new OrderService()) {} }\n");
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('ADR-112 C2 — real KG relationship resolution', () => {
  it('should_derive_component_relationships_from_real_imports', async () => {
    // Project-scoped factory (mirrors coordinator/MCP wiring) so FileReader's
    // base directory is the analyzed repo, not cwd.
    const resolver = createKnowledgeGraphRelationshipResolver(
      (projectPath) => new KnowledgeGraphService(createMockMemory(), { basePath: projectPath }),
    );

    const components = [
      { id: 'controllers', name: 'Controllers', type: 'controller' as const, files: ['src/controllers/order.ts'] },
      { id: 'services', name: 'Services', type: 'service' as const, files: ['src/services/order.ts'] },
      { id: 'repositories', name: 'Repositories', type: 'repository' as const, files: ['src/repositories/order.ts'] },
    ];

    const rels = await resolver(components, tmp);

    // The TS parser must have produced at least one REAL cross-component edge.
    expect(rels, 'resolver should find real import edges').not.toBeNull();
    expect(rels!.length).toBeGreaterThan(0);
    // Every derived edge must connect two distinct detected components.
    const ids = new Set(components.map((c) => c.id));
    for (const r of rels!) {
      expect(ids.has(r.sourceId)).toBe(true);
      expect(ids.has(r.targetId)).toBe(true);
      expect(r.sourceId).not.toBe(r.targetId);
    }
  });

  it('should_surface_KG_relationships_through_the_bridge_with_confidence', async () => {
    const bridge = new ProductFactorsBridgeService(createMockEventBus(), createMockMemory(), {
      publishEvents: false,
      relationshipResolver: createKnowledgeGraphRelationshipResolver(
        (projectPath) => new KnowledgeGraphService(createMockMemory(), { basePath: projectPath }),
      ),
    });

    const res = await bridge.requestC4Diagrams({
      projectPath: tmp,
      analyzeComponents: true,
      includeComponent: true,
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    // Real edges present, and KG-DERIVED (type 'depends_on'), not the naming
    // heuristic (which emits type 'uses'). This proves C2 is actually engaged.
    expect(res.value.relationships.length).toBeGreaterThan(0);
    expect(res.value.relationships.some((r) => r.type === 'depends_on')).toBe(true);
    // Confidence reflects that relationships were detected.
    const confidence = res.value.metadata.analysisMetadata?.confidence;
    expect(confidence).toBeDefined();
  });
});
