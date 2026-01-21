/**
 * C4 Diagram Builders Unit Tests
 *
 * Tests for C4ContextDiagramBuilder, C4ContainerDiagramBuilder, and C4ComponentDiagramBuilder
 */

import { describe, it, expect } from 'vitest';
import { C4ContextDiagramBuilder } from '../../../../src/code-intelligence/visualization/C4ContextDiagramBuilder.js';
import { C4ContainerDiagramBuilder } from '../../../../src/code-intelligence/visualization/C4ContainerDiagramBuilder.js';
import { C4ComponentDiagramBuilder } from '../../../../src/code-intelligence/visualization/C4ComponentDiagramBuilder.js';
import type {
  ProjectMetadata,
  Container,
  ExternalSystem,
  Component,
  ComponentRelationship,
} from '../../../../src/code-intelligence/inference/types.js';

describe('C4ContextDiagramBuilder', () => {
  const builder = new C4ContextDiagramBuilder();

  const mockMetadata: ProjectMetadata = {
    name: 'test-system',
    description: 'A test system for unit tests',
    systemType: 'monolith',
    technology: 'TypeScript',
    containers: [],
  };

  const mockExternalSystems: ExternalSystem[] = [
    {
      id: 'external-database-postgresql',
      name: 'PostgreSQL',
      type: 'database',
      technology: 'PostgreSQL',
      relationship: 'stores_data_in',
      description: 'Primary database',
    },
    {
      id: 'external-api-openai',
      name: 'OpenAI',
      type: 'api',
      technology: 'OpenAI API',
      relationship: 'uses',
      description: 'AI service',
    },
  ];

  it('should generate valid C4Context diagram header', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('C4Context');
    expect(diagram).toContain('title System Context diagram for test-system');
  });

  it('should include default user and developer personas', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('Person(user, "User", "A user of the system")');
    expect(diagram).toContain('Person(developer, "Developer", "A developer maintaining the system")');
  });

  it('should include the main system', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('System(test_system, "test-system", "A test system for unit tests")');
  });

  it('should include external systems', () => {
    const diagram = builder.build(mockMetadata, mockExternalSystems);

    expect(diagram).toContain('System_Ext(postgresql, "PostgreSQL"');
    expect(diagram).toContain('System_Ext(openai, "OpenAI"');
  });

  it('should include relationships between system and external systems', () => {
    const diagram = builder.build(mockMetadata, mockExternalSystems);

    expect(diagram).toContain('Rel(user, test_system, "Uses")');
    expect(diagram).toContain('Rel(developer, test_system, "Develops and maintains")');
    expect(diagram).toContain('Rel(test_system, postgresql,');
    expect(diagram).toContain('Rel(test_system, openai,');
  });

  it('should sanitize system names with special characters', () => {
    const metadataWithSpecialChars: ProjectMetadata = {
      ...mockMetadata,
      name: '@scope/my-package',
    };

    const diagram = builder.build(metadataWithSpecialChars, []);

    // Should sanitize to lowercase with underscores (@ and / are removed)
    expect(diagram).toContain('System(scopemy_package');
  });
});

describe('C4ContainerDiagramBuilder', () => {
  const builder = new C4ContainerDiagramBuilder();

  const mockContainers: Container[] = [
    {
      id: 'container-api',
      name: 'API Gateway',
      type: 'api',
      technology: 'Node.js',
      description: 'REST API endpoint',
      port: 3000,
    },
    {
      id: 'container-db',
      name: 'Database',
      type: 'database',
      technology: 'PostgreSQL',
      description: 'Primary data store',
    },
  ];

  const mockMetadata: ProjectMetadata = {
    name: 'microservice-app',
    description: 'A microservice application',
    systemType: 'microservice',
    technology: 'TypeScript',
    containers: mockContainers,
  };

  const mockExternalSystems: ExternalSystem[] = [
    {
      id: 'external-cache-redis',
      name: 'Redis',
      type: 'cache',
      technology: 'Redis',
      relationship: 'uses',
      description: 'Session cache',
    },
  ];

  it('should generate valid C4Container diagram header', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('C4Container');
    expect(diagram).toContain('title Container diagram for microservice-app');
  });

  it('should include containers from metadata', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('Container(api_gateway');
    expect(diagram).toContain('"API Gateway"');
  });

  it('should use ContainerDb for database containers', () => {
    const diagram = builder.build(mockMetadata, []);

    expect(diagram).toContain('ContainerDb(database');
  });

  it('should include external systems', () => {
    const diagram = builder.build(mockMetadata, mockExternalSystems);

    expect(diagram).toContain('Redis');
  });

  it('should handle empty containers list', () => {
    const emptyMetadata: ProjectMetadata = {
      ...mockMetadata,
      containers: [],
    };

    const diagram = builder.build(emptyMetadata, []);

    expect(diagram).toContain('C4Container');
    expect(diagram).toContain('title Container diagram for microservice-app');
  });
});

describe('C4ComponentDiagramBuilder', () => {
  const builder = new C4ComponentDiagramBuilder();

  const mockComponents: Component[] = [
    {
      id: 'component-1',
      name: 'UserController',
      type: 'layer',
      description: 'Handles user requests',
      technology: 'TypeScript',
      files: ['src/controllers/UserController.ts'],
      responsibilities: ['Handle user HTTP requests'],
    },
    {
      id: 'component-2',
      name: 'UserService',
      type: 'layer',
      description: 'Business logic for users',
      technology: 'TypeScript',
      files: ['src/services/UserService.ts'],
      responsibilities: ['Implement user business logic'],
    },
    {
      id: 'component-3',
      name: 'UserRepository',
      type: 'layer',
      description: 'Data access for users',
      technology: 'TypeScript',
      files: ['src/repositories/UserRepository.ts'],
      responsibilities: ['Manage user data'],
    },
  ];

  const mockRelationships: ComponentRelationship[] = [
    {
      sourceId: 'component-1',
      targetId: 'component-2',
      type: 'uses',
      count: 5,
    },
    {
      sourceId: 'component-2',
      targetId: 'component-3',
      type: 'uses',
      count: 3,
    },
  ];

  it('should generate valid C4Component diagram header', () => {
    const diagram = builder.build('API Application', mockComponents, []);

    expect(diagram).toContain('C4Component');
    expect(diagram).toContain('title Component diagram for API Application');
  });

  it('should include components with proper formatting', () => {
    const diagram = builder.build('API Application', mockComponents, []);

    expect(diagram).toContain('Component(usercontroller');
    expect(diagram).toContain('"UserController"');
    expect(diagram).toContain('Component(userservice');
    expect(diagram).toContain('Component(userrepository');
  });

  it('should infer technology type for controllers', () => {
    const diagram = builder.build('API Application', mockComponents, []);

    expect(diagram).toContain('MVC Controller');
  });

  it('should infer technology type for services', () => {
    const diagram = builder.build('API Application', mockComponents, []);

    expect(diagram).toContain('Service Component');
  });

  it('should infer technology type for repositories', () => {
    const diagram = builder.build('API Application', mockComponents, []);

    expect(diagram).toContain('Data Access Object');
  });

  it('should include relationships using sourceId/targetId', () => {
    const diagram = builder.build('API Application', mockComponents, mockRelationships);

    // Relationships use the component IDs (sourceId/targetId)
    expect(diagram).toContain('Rel(component_1, component_2');
    expect(diagram).toContain('Rel(component_2, component_3');
  });

  it('should handle empty components list', () => {
    const diagram = builder.build('Empty Container', [], []);

    expect(diagram).toContain('C4Component');
    expect(diagram).toContain('title Component diagram for Empty Container');
    expect(diagram).toContain('Component(empty, "No Components"');
  });

  it('should group components by boundary', () => {
    const componentsWithBoundary: Component[] = [
      {
        ...mockComponents[0],
        boundary: 'Controllers',
      },
      {
        ...mockComponents[1],
        boundary: 'Services',
      },
    ];

    const diagram = builder.build('API Application', componentsWithBoundary, []);

    expect(diagram).toContain('Container_Boundary(controllers, "Controllers")');
    expect(diagram).toContain('Container_Boundary(services, "Services")');
  });

  it('should deduplicate relationships', () => {
    const duplicateRelationships: ComponentRelationship[] = [
      {
        sourceId: 'component-1',
        targetId: 'component-2',
        type: 'uses',
        count: 1,
      },
      {
        sourceId: 'component-1',
        targetId: 'component-2',
        type: 'uses',
        count: 2,
      },
    ];

    const diagram = builder.build('API Application', mockComponents, duplicateRelationships);

    // Count occurrences of the relationship - should only appear once
    const matches = diagram.match(/Rel\(component_1, component_2/g) || [];
    expect(matches.length).toBe(1);
  });

  it('should get correct relationship descriptions', () => {
    const variousRelationships: ComponentRelationship[] = [
      { sourceId: 'component-1', targetId: 'component-2', type: 'calls' },
      { sourceId: 'component-2', targetId: 'component-3', type: 'depends_on' },
      { sourceId: 'component-1', targetId: 'component-3', type: 'imports' },
    ];

    const diagram = builder.build('API Application', mockComponents, variousRelationships);

    expect(diagram).toContain('"Calls"');
    expect(diagram).toContain('"Depends on"');
    expect(diagram).toContain('"Imports"');
  });
});

describe('C4 Diagram Integration', () => {
  it('should produce valid Mermaid syntax for all diagram types', () => {
    const contextBuilder = new C4ContextDiagramBuilder();
    const containerBuilder = new C4ContainerDiagramBuilder();
    const componentBuilder = new C4ComponentDiagramBuilder();

    const metadata: ProjectMetadata = {
      name: 'integration-test',
      systemType: 'microservice',
      technology: 'TypeScript',
      containers: [
        { id: 'c1', name: 'API', type: 'api', technology: 'Node.js' },
      ],
    };

    const contextDiagram = contextBuilder.build(metadata, []);
    const containerDiagram = containerBuilder.build(metadata, []);
    const componentDiagram = componentBuilder.build('API', [], []);

    // All should be valid Mermaid C4 diagrams
    expect(contextDiagram.startsWith('C4Context')).toBe(true);
    expect(containerDiagram.startsWith('C4Container')).toBe(true);
    expect(componentDiagram.startsWith('C4Component')).toBe(true);

    // Should not have undefined or null values
    expect(contextDiagram).not.toContain('undefined');
    expect(containerDiagram).not.toContain('undefined');
    expect(componentDiagram).not.toContain('undefined');
    expect(contextDiagram).not.toContain('null');
    expect(containerDiagram).not.toContain('null');
    expect(componentDiagram).not.toContain('null');
  });
});
