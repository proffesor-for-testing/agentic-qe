/**
 * ADR-112 C2 — KG → component relationship aggregation tests.
 */

import { describe, it, expect } from 'vitest';
import type { DetectedComponent } from '../../../../src/shared/c4-model';
import {
  aggregateDependencyMapToComponentRelationships,
  createKnowledgeGraphRelationshipResolver,
  type DependencyMapLike,
} from '../../../../src/domains/code-intelligence/services/c4-model/kg-relationships';

const PROJECT = '/proj';
const components: DetectedComponent[] = [
  { id: 'controllers', name: 'Controllers', type: 'controller', files: ['src/controllers/order.ts'] },
  { id: 'services', name: 'Services', type: 'service', files: ['src/services/order.ts'] },
  { id: 'repositories', name: 'Repositories', type: 'repository', files: ['src/repositories/order.ts'] },
];

// edges reference node ids; nodes carry id+path (abs, as the KG returns them)
const depMap: DependencyMapLike = {
  nodes: [
    { id: 'n1', path: '/proj/src/controllers/order.ts' },
    { id: 'n2', path: '/proj/src/services/order.ts' },
    { id: 'n3', path: '/proj/src/repositories/order.ts' },
  ],
  edges: [
    { source: 'n1', target: 'n2' }, // controllers → services
    { source: 'n2', target: 'n3' }, // services → repositories
  ],
};

describe('aggregateDependencyMapToComponentRelationships', () => {
  it('should_fold_file_edges_into_component_relationships', () => {
    const rels = aggregateDependencyMapToComponentRelationships(components, depMap, PROJECT);
    expect(rels).toEqual(
      expect.arrayContaining([
        { sourceId: 'controllers', targetId: 'services', type: 'depends_on', weight: 1 },
        { sourceId: 'services', targetId: 'repositories', type: 'depends_on', weight: 1 },
      ]),
    );
  });

  it('should_drop_self_edges_within_one_component', () => {
    const selfEdge: DependencyMapLike = {
      nodes: [
        { id: 'a', path: '/proj/src/services/order.ts' },
        { id: 'b', path: '/proj/src/services/order.ts' },
      ],
      edges: [{ source: 'a', target: 'b' }],
    };
    expect(aggregateDependencyMapToComponentRelationships(components, selfEdge, PROJECT)).toHaveLength(0);
  });

  it('should_accumulate_weight_for_repeated_component_edges', () => {
    const multi: DependencyMapLike = {
      nodes: [
        { id: 'c1', path: '/proj/src/controllers/order.ts' },
        { id: 's1', path: '/proj/src/services/order.ts' },
      ],
      edges: [
        { source: 'c1', target: 's1' },
        { source: 'c1', target: 's1' },
      ],
    };
    const rels = aggregateDependencyMapToComponentRelationships(components, multi, PROJECT);
    expect(rels[0].weight).toBe(2);
  });

  it('should_ignore_edges_to_files_outside_any_component', () => {
    const external: DependencyMapLike = {
      nodes: [
        { id: 'c1', path: '/proj/src/controllers/order.ts' },
        { id: 'x', path: '/proj/node_modules/lib/index.ts' },
      ],
      edges: [{ source: 'c1', target: 'x' }],
    };
    expect(aggregateDependencyMapToComponentRelationships(components, external, PROJECT)).toHaveLength(0);
  });
});

describe('createKnowledgeGraphRelationshipResolver', () => {
  it('should_return_null_when_there_are_no_files', async () => {
    const kg = { index: async () => ({ success: true }), mapDependencies: async () => ({ success: true, value: { nodes: [], edges: [] } }) };
    const resolver = createKnowledgeGraphRelationshipResolver(kg);
    expect(await resolver([], PROJECT)).toBeNull();
  });

  it('should_return_null_on_a_KG_miss_so_the_heuristic_stands', async () => {
    const kg = { index: async () => ({ success: true }), mapDependencies: async () => ({ success: false }) };
    const resolver = createKnowledgeGraphRelationshipResolver(kg);
    expect(await resolver(components, PROJECT)).toBeNull();
  });

  it('should_aggregate_real_edges_from_the_kg', async () => {
    const kg = {
      index: async () => ({ success: true }),
      mapDependencies: async () => ({ success: true, value: depMap }),
    };
    const resolver = createKnowledgeGraphRelationshipResolver(kg);
    const rels = await resolver(components, PROJECT);
    expect(rels).not.toBeNull();
    expect(rels!.length).toBe(2);
  });

  it('should_index_incrementally_before_mapping', async () => {
    const calls: Array<{ paths: string[]; incremental?: boolean }> = [];
    const kg = {
      index: async (req: { paths: string[]; incremental?: boolean }) => { calls.push(req); return { success: true }; },
      mapDependencies: async () => ({ success: true, value: depMap }),
    };
    await createKnowledgeGraphRelationshipResolver(kg)(components, PROJECT);
    expect(calls).toHaveLength(1);
    expect(calls[0].incremental).toBe(true);
    expect(calls[0].paths).toContain('/proj/src/controllers/order.ts');
  });
});
