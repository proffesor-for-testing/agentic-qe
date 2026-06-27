/**
 * ADR-112 — Detected → C4 spec mapping unit tests.
 *
 * Guards the consolidation seam: every detected element (component, relationship,
 * external system) must survive into a C4ModelService spec, and the enum
 * translations must land on valid domain vocabulary.
 */

import { describe, it, expect } from 'vitest';
import type {
  C4ProjectInfo,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
} from '../../../../src/shared/c4-model';
import {
  mapExternalSystemType,
  mapComponentType,
  toExternalSystemSpecs,
  toComponentSpecs,
  toComponentRelationshipSpecs,
  toContextRequest,
  toContainerRequest,
  toComponentRequest,
  DEFAULT_CONTAINER_NAME,
} from '../../../../src/domains/code-intelligence/services/c4-model/from-detected';

const project: C4ProjectInfo = { name: 'MyApp', description: 'A test app' };

const externalSystems: DetectedExternalSystem[] = [
  { id: 'pg', name: 'PostgreSQL', type: 'database', technology: 'PostgreSQL', detectedFrom: 'pg', relationship: 'reads' },
  { id: 'redis', name: 'Redis', type: 'cache', technology: 'Redis', detectedFrom: 'ioredis', relationship: 'uses' },
];

const components: DetectedComponent[] = [
  { id: 'user-controller', name: 'UserController', type: 'controller', files: ['src/user.controller.ts'], responsibilities: ['Handle user routes'] },
  { id: 'user-service', name: 'UserService', type: 'service', files: ['src/user.service.ts'] },
];

const relationships: DetectedRelationship[] = [
  { sourceId: 'user-controller', targetId: 'user-service', type: 'calls', weight: 3 },
];

describe('mapExternalSystemType', () => {
  it('should_map_queue_to_message_queue', () => {
    expect(mapExternalSystemType('queue')).toBe('message_queue');
  });

  it('should_map_auth_to_authentication', () => {
    expect(mapExternalSystemType('auth')).toBe('authentication');
  });

  it('should_map_cloud_to_third_party', () => {
    expect(mapExternalSystemType('cloud')).toBe('third_party');
  });
});

describe('mapComponentType', () => {
  it('should_pass_through_supported_types', () => {
    expect(mapComponentType('controller')).toBe('controller');
    expect(mapComponentType('repository')).toBe('repository');
  });

  it('should_fold_unsupported_types_to_module_so_none_are_dropped', () => {
    expect(mapComponentType('layer')).toBe('module');
    expect(mapComponentType('feature')).toBe('module');
    expect(mapComponentType('package')).toBe('module');
    expect(mapComponentType('other')).toBe('module');
  });

  it('should_fold_transformer_to_adapter', () => {
    expect(mapComponentType('transformer')).toBe('adapter');
  });
});

describe('toExternalSystemSpecs', () => {
  it('should_preserve_every_external_system', () => {
    const specs = toExternalSystemSpecs(externalSystems);
    expect(specs).toHaveLength(externalSystems.length);
  });

  it('should_carry_name_technology_and_relationship_description', () => {
    const [pg] = toExternalSystemSpecs(externalSystems);
    expect(pg).toMatchObject({ name: 'PostgreSQL', type: 'database', technology: 'PostgreSQL', relationshipDescription: 'reads' });
  });
});

describe('toComponentSpecs', () => {
  it('should_preserve_every_component_with_files_and_responsibilities', () => {
    const specs = toComponentSpecs(components);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      name: 'UserController',
      type: 'controller',
      files: ['src/user.controller.ts'],
      responsibilities: ['Handle user routes'],
    });
  });
});

describe('toComponentRelationshipSpecs', () => {
  it('should_translate_ids_back_to_component_names', () => {
    const specs = toComponentRelationshipSpecs(components, relationships);
    expect(specs).toEqual([{ from: 'UserController', to: 'UserService', type: 'calls' }]);
  });

  it('should_drop_relationships_whose_endpoints_are_unknown', () => {
    const dangling: DetectedRelationship[] = [{ sourceId: 'user-controller', targetId: 'ghost', type: 'calls' }];
    expect(toComponentRelationshipSpecs(components, dangling)).toHaveLength(0);
  });

  it('should_translate_divergent_relationship_verbs_to_domain_vocabulary', () => {
    const reads: DetectedRelationship[] = [{ sourceId: 'user-service', targetId: 'user-controller', type: 'reads' }];
    expect(toComponentRelationshipSpecs(components, reads)[0].type).toBe('reads_from');
  });
});

describe('toContextRequest', () => {
  it('should_use_project_name_and_description_and_all_external_systems', () => {
    const req = toContextRequest(project, externalSystems);
    expect(req.systemName).toBe('MyApp');
    expect(req.systemDescription).toBe('A test app');
    expect(req.externalSystems).toHaveLength(2);
  });
});

describe('toContainerRequest', () => {
  it('should_model_a_single_application_container', () => {
    const req = toContainerRequest(project, externalSystems);
    expect(req.containers).toHaveLength(1);
    expect(req.containers[0]).toMatchObject({ name: DEFAULT_CONTAINER_NAME, technology: 'TypeScript' });
  });

  it('should_draw_a_dependency_from_app_to_each_external_system', () => {
    const req = toContainerRequest(project, externalSystems);
    expect(req.dependencies).toHaveLength(2);
    expect(req.dependencies?.every((d) => d.from === DEFAULT_CONTAINER_NAME)).toBe(true);
  });
});

describe('toComponentRequest', () => {
  it('should_default_to_the_application_container_and_keep_components_and_relationships', () => {
    const req = toComponentRequest(components, relationships);
    expect(req.containerName).toBe(DEFAULT_CONTAINER_NAME);
    expect(req.components).toHaveLength(2);
    expect(req.relationships).toHaveLength(1);
  });
});
