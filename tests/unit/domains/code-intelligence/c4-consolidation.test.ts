/**
 * ADR-112 C1 — consolidation parity proof.
 *
 * The bridge keeps detection; rendering moves to C4ModelService. This guards the
 * seam end-to-end (detected → mapping → service → Mermaid): every detected
 * element must survive, and the output must carry the C4 tokens the
 * product-factors architecture-parser keys on (Person(/Container(/Component().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockMemory } from '../../../mocks';
import type {
  C4ProjectInfo,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
} from '../../../../src/shared/c4-model';
import { C4ModelService } from '../../../../src/domains/code-intelligence/services/c4-model';
import {
  toContextRequest,
  toContainerRequest,
  toComponentRequest,
} from '../../../../src/domains/code-intelligence/services/c4-model/from-detected';

const project: C4ProjectInfo = { name: 'CheckoutApp', description: 'Order checkout service' };
const externalSystems: DetectedExternalSystem[] = [
  { id: 'pg', name: 'PostgreSQL', type: 'database', technology: 'PostgreSQL', detectedFrom: 'pg', relationship: 'reads' },
];
const components: DetectedComponent[] = [
  { id: 'order-controller', name: 'OrderController', type: 'controller', files: ['src/order.controller.ts'] },
  { id: 'order-service', name: 'OrderService', type: 'service', files: ['src/order.service.ts'] },
];
const relationships: DetectedRelationship[] = [
  { sourceId: 'order-controller', targetId: 'order-service', type: 'calls' },
];

describe('ADR-112 consolidation: detected → C4ModelService → Mermaid', () => {
  let service: C4ModelService;

  beforeEach(() => {
    service = new C4ModelService(createMockMemory(), { enableEmbeddings: false });
  });

  it('should_render_a_valid_C4Context_with_the_system_and_external_systems', async () => {
    const res = await service.buildContext(toContextRequest(project, externalSystems));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.mermaid).toContain('C4Context');
    expect(res.value.mermaid).toContain('PostgreSQL');
  });

  it('should_render_a_valid_C4Container_with_the_application_container', async () => {
    const res = await service.buildContainer(toContainerRequest(project, externalSystems));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.mermaid).toContain('C4Container');
    expect(res.value.mermaid).toMatch(/Container\(/);
  });

  it('should_preserve_every_detected_component_name_in_the_component_diagram', async () => {
    const res = await service.buildComponent(toComponentRequest(components, relationships));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.mermaid).toContain('C4Component');
    for (const c of components) {
      expect(res.value.mermaid).toContain(c.name);
    }
  });

  it('should_emit_parser_compatible_Component_tokens', async () => {
    // The product-factors architecture-parser extracts names via /Component\(\w+,\s*"([^"]+)"/.
    const res = await service.buildComponent(toComponentRequest(components, relationships));
    expect(res.success).toBe(true);
    if (!res.success) return;
    const names = [...res.value.mermaid.matchAll(/Component\((\w+),\s*"([^"]+)"/g)].map((m) => m[2]);
    expect(names).toEqual(expect.arrayContaining(['OrderController', 'OrderService']));
  });
});
