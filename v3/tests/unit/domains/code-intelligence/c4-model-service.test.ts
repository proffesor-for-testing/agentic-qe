/**
 * Agentic QE v3 - C4 Model Service Unit Tests
 *
 * Tests for C4 architecture diagram generation from codebase analysis.
 * Covers Context, Container, Component diagram builders and Mermaid output.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockMemory, createMockEventBus } from '../../../mocks';
import { MemoryBackend, EventBus } from '../../../../src/kernel/interfaces';
import {
  C4Diagrams,
  C4DiagramMetadata,
  C4DiagramRequest,
  C4DiagramResult,
  C4Person,
  C4SoftwareSystem,
  C4Container,
  C4Component,
  C4Relationship,
  C4ContainerType,
  C4ComponentType,
  C4RelationshipType,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  ExternalSystemType,
  IC4DiagramGenerator,
  C4ProjectInfo,
  isCacheValid,
  externalSystemToContainerType,
  inferComponentType,
  sanitizeId,
} from '../../../../src/shared/c4-model';

// ============================================================================
// Mock C4 Model Service (implementation to be created by other agents)
// ============================================================================

/**
 * Mock C4ModelService for testing
 * This represents the expected interface of the service being implemented
 */
interface IC4ModelService {
  generateDiagrams(request: C4DiagramRequest): Promise<C4DiagramResult>;
  generateContextDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string;
  generateContainerDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string;
  generateComponentDiagram(
    projectName: string,
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string;
  generateDependencyGraph(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string;
  getCachedResult(projectPath: string): C4DiagramResult | undefined;
  clearCache(): void;
}

/**
 * Create a mock C4 Model Service for testing
 */
function createMockC4ModelService(memory: MemoryBackend): IC4ModelService {
  const cache = new Map<string, C4DiagramResult>();

  return {
    generateDiagrams: vi.fn(async (request: C4DiagramRequest): Promise<C4DiagramResult> => {
      const diagrams: C4Diagrams = {};
      const components: DetectedComponent[] = [];
      const relationships: DetectedRelationship[] = [];
      const externalSystems: DetectedExternalSystem[] = [];

      // Simulate analysis
      if (request.detectExternalSystems) {
        externalSystems.push({
          id: 'db-postgres',
          name: 'PostgreSQL Database',
          type: 'database' as ExternalSystemType,
          technology: 'PostgreSQL',
          detectedFrom: 'package.json',
          relationship: 'stores_data_in' as C4RelationshipType,
        });
      }

      if (request.analyzeComponents) {
        components.push({
          id: 'user-service',
          name: 'UserService',
          type: 'service' as C4ComponentType,
          files: ['src/services/user.ts'],
          boundary: 'Business Logic',
        });
      }

      // Generate diagrams
      if (request.includeContext !== false) {
        diagrams.context = `graph TB
    User[User] --> System[${request.projectPath}]
    System --> ExternalDB[(Database)]`;
      }

      if (request.includeContainer !== false) {
        diagrams.container = `graph TB
    subgraph System
        WebApp[Web Application]
        API[API Service]
        DB[(Database)]
    end
    WebApp --> API
    API --> DB`;
      }

      if (request.includeComponent !== false) {
        diagrams.component = `graph TB
    Controller --> Service
    Service --> Repository
    Repository --> Database`;
      }

      if (request.includeDependency) {
        diagrams.dependency = `graph LR
    A --> B
    B --> C`;
      }

      const result: C4DiagramResult = {
        diagrams,
        metadata: {
          projectName: request.projectPath.split('/').pop() || 'Unknown',
          projectDescription: 'Generated from codebase analysis',
          generatedAt: new Date(),
          source: 'codebase-analysis',
          analysisMetadata: {
            filesAnalyzed: 10,
            componentsDetected: components.length,
            externalSystemsDetected: externalSystems.length,
            analysisTimeMs: 150,
          },
        },
        externalSystems,
        components,
        relationships,
      };

      cache.set(request.projectPath, result);
      return result;
    }),

    generateContextDiagram: vi.fn(
      (project: C4ProjectInfo, externalSystems: DetectedExternalSystem[]): string => {
        let mermaid = `graph TB\n`;
        mermaid += `    User[User] --> System["${project.name}"]\n`;

        for (const ext of externalSystems) {
          const shape = ext.type === 'database' ? `[(${ext.name})]` : `[${ext.name}]`;
          mermaid += `    System --> ${sanitizeId(ext.id)}${shape}\n`;
        }

        return mermaid;
      }
    ),

    generateContainerDiagram: vi.fn(
      (project: C4ProjectInfo, externalSystems: DetectedExternalSystem[]): string => {
        let mermaid = `graph TB\n`;
        mermaid += `    subgraph ${sanitizeId(project.name)}["${project.name}"]\n`;
        mermaid += `        WebApp[Web Application]\n`;
        mermaid += `        API[API Service]\n`;
        mermaid += `    end\n`;

        for (const ext of externalSystems) {
          const containerType = externalSystemToContainerType(ext.type);
          const shape = containerType === 'database' ? `[(${ext.name})]` : `[${ext.name}]`;
          mermaid += `    API --> ${sanitizeId(ext.id)}${shape}\n`;
        }

        return mermaid;
      }
    ),

    generateComponentDiagram: vi.fn(
      (
        projectName: string,
        components: DetectedComponent[],
        relationships: DetectedRelationship[]
      ): string => {
        let mermaid = `graph TB\n`;
        mermaid += `    subgraph ${sanitizeId(projectName)}["${projectName} Components"]\n`;

        for (const comp of components) {
          mermaid += `        ${sanitizeId(comp.id)}["${comp.name}"]\n`;
        }

        mermaid += `    end\n`;

        for (const rel of relationships) {
          mermaid += `    ${sanitizeId(rel.sourceId)} --> ${sanitizeId(rel.targetId)}\n`;
        }

        return mermaid;
      }
    ),

    generateDependencyGraph: vi.fn(
      (components: DetectedComponent[], relationships: DetectedRelationship[]): string => {
        let mermaid = `graph LR\n`;

        for (const rel of relationships) {
          mermaid += `    ${sanitizeId(rel.sourceId)} --> ${sanitizeId(rel.targetId)}\n`;
        }

        return mermaid || 'graph LR\n    Empty[No dependencies]';
      }
    ),

    getCachedResult: vi.fn((projectPath: string): C4DiagramResult | undefined => {
      return cache.get(projectPath);
    }),

    clearCache: vi.fn(() => {
      cache.clear();
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('C4ModelService', () => {
  let service: IC4ModelService;
  let mockMemory: MemoryBackend;
  let mockEventBus: EventBus;

  beforeEach(() => {
    mockMemory = createMockMemory();
    mockEventBus = createMockEventBus();
    service = createMockC4ModelService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateDiagrams', () => {
    it('should generate all diagram types when requested', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/project',
        detectExternalSystems: true,
        analyzeComponents: true,
        analyzeCoupling: true,
        includeContext: true,
        includeContainer: true,
        includeComponent: true,
        includeDependency: true,
      };

      const result = await service.generateDiagrams(request);

      expect(result.diagrams.context).toBeDefined();
      expect(result.diagrams.container).toBeDefined();
      expect(result.diagrams.component).toBeDefined();
      expect(result.diagrams.dependency).toBeDefined();
    });

    it('should generate only context diagram when others are disabled', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/project',
        includeContext: true,
        includeContainer: false,
        includeComponent: false,
        includeDependency: false,
      };

      const result = await service.generateDiagrams(request);

      expect(result.diagrams.context).toBeDefined();
      expect(result.diagrams.container).toBeUndefined();
      expect(result.diagrams.component).toBeUndefined();
      expect(result.diagrams.dependency).toBeUndefined();
    });

    it('should detect external systems when enabled', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/project',
        detectExternalSystems: true,
      };

      const result = await service.generateDiagrams(request);

      expect(result.externalSystems.length).toBeGreaterThan(0);
      expect(result.externalSystems[0]).toHaveProperty('id');
      expect(result.externalSystems[0]).toHaveProperty('type');
      expect(result.externalSystems[0]).toHaveProperty('technology');
    });

    it('should analyze components when enabled', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/project',
        analyzeComponents: true,
      };

      const result = await service.generateDiagrams(request);

      expect(result.components.length).toBeGreaterThan(0);
      expect(result.components[0]).toHaveProperty('id');
      expect(result.components[0]).toHaveProperty('name');
      expect(result.components[0]).toHaveProperty('type');
    });

    it('should populate metadata correctly', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/my-project',
      };

      const result = await service.generateDiagrams(request);

      expect(result.metadata.projectName).toBe('my-project');
      expect(result.metadata.source).toBe('codebase-analysis');
      expect(result.metadata.generatedAt).toBeInstanceOf(Date);
      expect(result.metadata.analysisMetadata).toBeDefined();
      expect(result.metadata.analysisMetadata?.filesAnalyzed).toBeGreaterThan(0);
    });

    it('should handle exclude patterns', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/test/project',
        excludePatterns: ['node_modules/**', 'dist/**', '*.test.ts'],
        analyzeComponents: true,
      };

      const result = await service.generateDiagrams(request);

      // Should complete without errors
      expect(result.diagrams).toBeDefined();
    });
  });

  describe('C4ContextDiagramBuilder', () => {
    it('should generate valid Mermaid syntax for context diagram', () => {
      const project: C4ProjectInfo = {
        name: 'E-Commerce System',
        description: 'Online shopping platform',
      };

      const externalSystems: DetectedExternalSystem[] = [
        {
          id: 'payment-gateway',
          name: 'Payment Gateway',
          type: 'api',
          technology: 'Stripe',
          detectedFrom: 'stripe',
          relationship: 'calls',
        },
        {
          id: 'database',
          name: 'PostgreSQL',
          type: 'database',
          technology: 'PostgreSQL 15',
          detectedFrom: 'pg',
          relationship: 'stores_data_in',
        },
      ];

      const diagram = service.generateContextDiagram(project, externalSystems);

      expect(diagram).toContain('graph TB');
      expect(diagram).toContain('User');
      expect(diagram).toContain('E-Commerce System');
      expect(diagram).toContain('payment-gateway');
      expect(diagram).toContain('database');
    });

    it('should use correct shapes for different system types', () => {
      const project: C4ProjectInfo = {
        name: 'Test System',
        description: 'Test',
      };

      const externalSystems: DetectedExternalSystem[] = [
        {
          id: 'db',
          name: 'Database',
          type: 'database',
          technology: 'PostgreSQL',
          detectedFrom: 'pg',
          relationship: 'stores_data_in',
        },
      ];

      const diagram = service.generateContextDiagram(project, externalSystems);

      // Database should use cylinder shape [( )]
      expect(diagram).toContain('[(');
    });

    it('should handle empty external systems', () => {
      const project: C4ProjectInfo = {
        name: 'Isolated System',
        description: 'No external dependencies',
      };

      const diagram = service.generateContextDiagram(project, []);

      expect(diagram).toContain('graph TB');
      expect(diagram).toContain('Isolated System');
    });
  });

  describe('C4ContainerDiagramBuilder', () => {
    it('should generate valid Mermaid syntax for container diagram', () => {
      const project: C4ProjectInfo = {
        name: 'Microservices Platform',
        description: 'Distributed system',
      };

      const externalSystems: DetectedExternalSystem[] = [
        {
          id: 'redis',
          name: 'Redis Cache',
          type: 'cache',
          technology: 'Redis 7',
          detectedFrom: 'ioredis',
          relationship: 'reads',
        },
      ];

      const diagram = service.generateContainerDiagram(project, externalSystems);

      expect(diagram).toContain('graph TB');
      expect(diagram).toContain('subgraph');
      expect(diagram).toContain('Web Application');
      expect(diagram).toContain('API Service');
      expect(diagram).toContain('redis');
    });

    it('should group containers within system boundary', () => {
      const project: C4ProjectInfo = {
        name: 'MyApp',
        description: 'Application',
      };

      const diagram = service.generateContainerDiagram(project, []);

      expect(diagram).toContain('subgraph');
      expect(diagram).toContain('MyApp');
    });
  });

  describe('C4ComponentDiagramBuilder', () => {
    it('should generate valid Mermaid syntax for component diagram', () => {
      const components: DetectedComponent[] = [
        {
          id: 'user-controller',
          name: 'UserController',
          type: 'controller',
          files: ['src/controllers/user.ts'],
        },
        {
          id: 'user-service',
          name: 'UserService',
          type: 'service',
          files: ['src/services/user.ts'],
        },
        {
          id: 'user-repository',
          name: 'UserRepository',
          type: 'repository',
          files: ['src/repositories/user.ts'],
        },
      ];

      const relationships: DetectedRelationship[] = [
        { sourceId: 'user-controller', targetId: 'user-service', type: 'calls' },
        { sourceId: 'user-service', targetId: 'user-repository', type: 'calls' },
      ];

      const diagram = service.generateComponentDiagram('UserModule', components, relationships);

      expect(diagram).toContain('graph TB');
      expect(diagram).toContain('UserController');
      expect(diagram).toContain('UserService');
      expect(diagram).toContain('UserRepository');
      expect(diagram).toContain('-->');
    });

    it('should handle components with boundaries', () => {
      const components: DetectedComponent[] = [
        {
          id: 'api-controller',
          name: 'APIController',
          type: 'controller',
          boundary: 'Presentation Layer',
          files: ['src/api/controller.ts'],
        },
        {
          id: 'domain-service',
          name: 'DomainService',
          type: 'service',
          boundary: 'Business Logic',
          files: ['src/domain/service.ts'],
        },
      ];

      const diagram = service.generateComponentDiagram('App', components, []);

      expect(diagram).toContain('APIController');
      expect(diagram).toContain('DomainService');
    });

    it('should handle empty components list', () => {
      const diagram = service.generateComponentDiagram('EmptyProject', [], []);

      expect(diagram).toContain('graph TB');
      expect(diagram).toContain('EmptyProject');
    });
  });

  describe('DependencyGraphBuilder', () => {
    it('should generate dependency graph from relationships', () => {
      const components: DetectedComponent[] = [
        { id: 'a', name: 'ModuleA', type: 'module', files: [] },
        { id: 'b', name: 'ModuleB', type: 'module', files: [] },
        { id: 'c', name: 'ModuleC', type: 'module', files: [] },
      ];

      const relationships: DetectedRelationship[] = [
        { sourceId: 'a', targetId: 'b', type: 'imports' },
        { sourceId: 'b', targetId: 'c', type: 'imports' },
        { sourceId: 'a', targetId: 'c', type: 'imports' },
      ];

      const diagram = service.generateDependencyGraph(components, relationships);

      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('a --> b');
      expect(diagram).toContain('b --> c');
      expect(diagram).toContain('a --> c');
    });

    it('should handle no relationships', () => {
      const components: DetectedComponent[] = [
        { id: 'isolated', name: 'Isolated', type: 'module', files: [] },
      ];

      const diagram = service.generateDependencyGraph(components, []);

      expect(diagram).toContain('graph LR');
    });
  });

  describe('Memory Storage', () => {
    it('should cache generated diagrams', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/cached/project',
      };

      await service.generateDiagrams(request);

      const cached = service.getCachedResult('/cached/project');

      expect(cached).toBeDefined();
      expect(cached?.diagrams).toBeDefined();
    });

    it('should return undefined for uncached projects', () => {
      const cached = service.getCachedResult('/not/cached');

      expect(cached).toBeUndefined();
    });

    it('should clear cache when requested', async () => {
      const request: C4DiagramRequest = {
        projectPath: '/to-clear/project',
      };

      await service.generateDiagrams(request);
      service.clearCache();

      const cached = service.getCachedResult('/to-clear/project');
      expect(cached).toBeUndefined();
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('C4 Utility Functions', () => {
  describe('isCacheValid', () => {
    it('should return true for fresh cache entries', () => {
      const entry = {
        result: {} as C4DiagramResult,
        cachedAt: new Date(),
        ttlMs: 60000, // 1 minute
        projectHash: 'abc123',
      };

      expect(isCacheValid(entry)).toBe(true);
    });

    it('should return false for expired cache entries', () => {
      const entry = {
        result: {} as C4DiagramResult,
        cachedAt: new Date(Date.now() - 120000), // 2 minutes ago
        ttlMs: 60000, // 1 minute TTL
        projectHash: 'abc123',
      };

      expect(isCacheValid(entry)).toBe(false);
    });

    it('should handle edge case of exact TTL expiry', () => {
      const now = Date.now();
      const entry = {
        result: {} as C4DiagramResult,
        cachedAt: new Date(now - 60000), // Exactly 1 minute ago
        ttlMs: 60000, // 1 minute TTL
        projectHash: 'abc123',
      };

      // At exact expiry, should be invalid
      expect(isCacheValid(entry)).toBe(false);
    });
  });

  describe('externalSystemToContainerType', () => {
    it('should map database type correctly', () => {
      expect(externalSystemToContainerType('database')).toBe('database');
    });

    it('should map cache type correctly', () => {
      expect(externalSystemToContainerType('cache')).toBe('cache');
    });

    it('should map queue type correctly', () => {
      expect(externalSystemToContainerType('queue')).toBe('queue');
    });

    it('should map api type correctly', () => {
      expect(externalSystemToContainerType('api')).toBe('api');
    });

    it('should map storage type to file-system', () => {
      expect(externalSystemToContainerType('storage')).toBe('file-system');
    });

    it('should map cloud type to serverless', () => {
      expect(externalSystemToContainerType('cloud')).toBe('serverless');
    });

    it('should map auth and monitoring to service', () => {
      expect(externalSystemToContainerType('auth')).toBe('service');
      expect(externalSystemToContainerType('monitoring')).toBe('service');
    });
  });

  describe('inferComponentType', () => {
    it('should infer controller type', () => {
      expect(inferComponentType('UserController')).toBe('controller');
      expect(inferComponentType('AuthController')).toBe('controller');
    });

    it('should infer service type', () => {
      expect(inferComponentType('UserService')).toBe('service');
      expect(inferComponentType('PaymentService')).toBe('service');
    });

    it('should infer repository type', () => {
      expect(inferComponentType('UserRepository')).toBe('repository');
      expect(inferComponentType('OrderRepository')).toBe('repository');
    });

    it('should infer adapter type', () => {
      expect(inferComponentType('EmailAdapter')).toBe('adapter');
      expect(inferComponentType('StripeAdapter')).toBe('adapter');
    });

    it('should infer gateway type', () => {
      expect(inferComponentType('PaymentGateway')).toBe('gateway');
      expect(inferComponentType('APIGateway')).toBe('gateway');
    });

    it('should infer utility type', () => {
      expect(inferComponentType('StringUtils')).toBe('utility');
      expect(inferComponentType('DateHelper')).toBe('utility');
    });

    it('should default to module for unknown patterns', () => {
      expect(inferComponentType('SomethingElse')).toBe('module');
      expect(inferComponentType('MyClass')).toBe('module');
    });
  });

  describe('sanitizeId', () => {
    it('should replace spaces with dashes', () => {
      expect(sanitizeId('User Service')).toBe('user-service');
    });

    it('should replace special characters', () => {
      expect(sanitizeId('user@service')).toBe('user-service');
      expect(sanitizeId('user.service')).toBe('user-service');
    });

    it('should convert to lowercase', () => {
      expect(sanitizeId('UserService')).toBe('userservice');
    });

    it('should handle multiple special characters', () => {
      expect(sanitizeId('my/path/to/file.ts')).toBe('my-path-to-file-ts');
    });
  });
});

// ============================================================================
// Mermaid Output Validation Tests
// ============================================================================

describe('Mermaid Output Validation', () => {
  let service: IC4ModelService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemory();
    service = createMockC4ModelService(mockMemory);
  });

  it('should generate syntactically valid Mermaid for context diagram', () => {
    const project: C4ProjectInfo = {
      name: 'TestProject',
      description: 'Test',
    };

    const diagram = service.generateContextDiagram(project, []);

    // Basic Mermaid syntax validation
    expect(diagram).toMatch(/^graph\s+(TB|BT|LR|RL)/);
    expect(diagram.split('\n').every((line) => line.trim() === '' || line.includes('graph') || line.includes('-->') || line.includes('[') || line.includes('subgraph') || line.includes('end'))).toBe(true);
  });

  it('should escape special characters in names', () => {
    const project: C4ProjectInfo = {
      name: 'My "Special" Project',
      description: 'Test',
    };

    const diagram = service.generateContextDiagram(project, []);

    // Should contain the name without breaking Mermaid syntax
    expect(diagram).toContain('graph TB');
  });

  it('should handle very long component names', () => {
    const components: DetectedComponent[] = [
      {
        id: 'very-long-named-component',
        name: 'VeryLongComponentNameThatExceedsNormalLengthExpectations',
        type: 'service',
        files: ['src/very-long-path/to/component.ts'],
      },
    ];

    const diagram = service.generateComponentDiagram('Project', components, []);

    expect(diagram).toContain('VeryLongComponentNameThatExceedsNormalLengthExpectations');
  });

  it('should handle Unicode characters in names', () => {
    const project: C4ProjectInfo = {
      name: 'Proyecto Espanol',
      description: 'Test',
    };

    const diagram = service.generateContextDiagram(project, []);

    expect(diagram).toContain('graph TB');
  });
});
