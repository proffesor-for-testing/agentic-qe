/**
 * ADR-112 — C4 generation pipeline end-to-end (the path `aqe code c4` drives).
 *
 * Exercises the REAL bridge over a temp fixture: detect (fs scan + deps) →
 * map → C4ModelService render → confidence gate. No kernel, no memory.db.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockMemory, createMockEventBus } from '../../../mocks';
import { ProductFactorsBridgeService } from '../../../../src/domains/code-intelligence/services/product-factors-bridge';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-e2e-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'checkout-svc',
    description: 'Order checkout service',
    dependencies: { pg: '^8.0.0', express: '^4.0.0', ioredis: '^5.0.0' },
  }));
  // The detector treats top-level src/ subdirectories as components.
  for (const dir of ['controllers', 'services', 'repositories']) {
    fs.mkdirSync(path.join(tmp, 'src', dir), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src', dir, 'order.ts'), `export class Order_${dir} {}\n`);
  }
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ADR-112 C4 generation pipeline (user path)', () => {
  let bridge: ProductFactorsBridgeService;

  beforeEach(() => {
    bridge = new ProductFactorsBridgeService(createMockEventBus(), createMockMemory(), { publishEvents: false });
  });

  it('should_generate_valid_C4_context_container_and_component_diagrams', async () => {
    const res = await bridge.requestC4Diagrams({
      projectPath: tmp,
      includeContext: true,
      includeContainer: true,
      includeComponent: true,
      analyzeComponents: true,
      detectExternalSystems: true,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.diagrams.context).toContain('C4Context');
    expect(res.value.diagrams.container).toContain('C4Container');
    expect(res.value.diagrams.component).toContain('C4Component');
  });

  it('should_detect_external_systems_from_dependencies', async () => {
    const res = await bridge.requestC4Diagrams({ projectPath: tmp, detectExternalSystems: true });
    expect(res.success).toBe(true);
    if (!res.success) return;
    const names = res.value.externalSystems.map((e) => e.technology);
    // pg → PostgreSQL, ioredis → Redis (known dependency patterns)
    expect(names).toContain('PostgreSQL');
  });

  it('should_fail_loud_not_silently_when_the_render_engine_fails', async () => {
    // ADR-112 C6: a C4ModelService failure must surface as an error, NOT be
    // masked by a silent fallback to a weaker inline diagram.
    const bridge = new ProductFactorsBridgeService(createMockEventBus(), createMockMemory(), { publishEvents: false });
    // Force the render engine to fail.
    (bridge as unknown as { getC4Service: () => unknown }).getC4Service = () => ({
      buildContext: async () => ({ success: false, error: new Error('boom') }),
      buildContainer: async () => ({ success: false, error: new Error('boom') }),
      buildComponent: async () => ({ success: false, error: new Error('boom') }),
    });

    const res = await bridge.requestC4Diagrams({ projectPath: tmp, includeContext: true, analyzeComponents: true });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.message).toContain('boom');
  });

  it('should_attach_a_deterministic_confidence_assessment_to_metadata', async () => {
    const res = await bridge.requestC4Diagrams({ projectPath: tmp, analyzeComponents: true });
    expect(res.success).toBe(true);
    if (!res.success) return;
    const confidence = res.value.metadata.analysisMetadata?.confidence;
    expect(confidence).toBeDefined();
    expect(['high', 'medium', 'low']).toContain(confidence!.level);
    expect(confidence!.reasons.length).toBeGreaterThan(0);
  });
});
