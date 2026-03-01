/**
 * Agentic QE v3 - Code Intelligence to Product Factors Integration Tests
 *
 * End-to-end tests for C4 diagram generation and cross-domain data flow
 * between code-intelligence and requirements-validation (product-factors-assessor).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockMemory, createMockEventBus, createMockAgentCoordinator } from '../mocks';
import { MemoryBackend, EventBus, AgentCoordinator } from '../../src/kernel/interfaces';
import { DomainEvent, DomainName, ok, err, Result } from '../../src/shared/types';
import {
  C4Diagrams,
  C4DiagramResult,
  C4DiagramRequest,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  C4DiagramsGeneratedPayload,
  C4ComponentType,
  ExternalSystemType,
  C4RelationshipType,
  sanitizeId,
  inferComponentType,
  externalSystemToContainerType,
} from '../../src/shared/c4-model';
import {
  CodeIntelligenceEvents,
  createEvent,
} from '../../src/shared/events/domain-events';

// ============================================================================
// Integration Test Fixtures
// ============================================================================

/**
 * Create a realistic C4 diagram result for testing
 */
function createRealisticC4DiagramResult(
  projectName: string
): C4DiagramResult {
  const externalSystems: DetectedExternalSystem[] = [
    {
      id: 'postgresql-db',
      name: 'PostgreSQL Database',
      type: 'database',
      technology: 'PostgreSQL 15.2',
      detectedFrom: 'pg',
      relationship: 'stores_data_in',
    },
    {
      id: 'redis-cache',
      name: 'Redis Cache',
      type: 'cache',
      technology: 'Redis 7.0',
      detectedFrom: 'ioredis',
      relationship: 'reads',
    },
    {
      id: 'stripe-api',
      name: 'Stripe Payment API',
      type: 'api',
      technology: 'REST API',
      detectedFrom: 'stripe',
      relationship: 'calls',
    },
  ];

  const components: DetectedComponent[] = [
    {
      id: 'user-controller',
      name: 'UserController',
      type: 'controller',
      boundary: 'Presentation Layer',
      files: ['src/controllers/user.controller.ts'],
      responsibilities: ['Handle HTTP requests', 'Input validation'],
    },
    {
      id: 'user-service',
      name: 'UserService',
      type: 'service',
      boundary: 'Business Logic',
      files: ['src/services/user.service.ts'],
      responsibilities: ['User business logic', 'Transaction management'],
    },
    {
      id: 'user-repository',
      name: 'UserRepository',
      type: 'repository',
      boundary: 'Data Access',
      files: ['src/repositories/user.repository.ts'],
      responsibilities: ['Database operations', 'Query building'],
    },
    {
      id: 'payment-service',
      name: 'PaymentService',
      type: 'service',
      boundary: 'Business Logic',
      files: ['src/services/payment.service.ts'],
      responsibilities: ['Payment processing', 'Stripe integration'],
    },
    {
      id: 'cache-adapter',
      name: 'CacheAdapter',
      type: 'adapter',
      boundary: 'Infrastructure',
      files: ['src/adapters/cache.adapter.ts'],
      responsibilities: ['Redis caching', 'Cache invalidation'],
    },
  ];

  const relationships: DetectedRelationship[] = [
    { sourceId: 'user-controller', targetId: 'user-service', type: 'calls' },
    { sourceId: 'user-service', targetId: 'user-repository', type: 'calls' },
    { sourceId: 'user-service', targetId: 'cache-adapter', type: 'uses' },
    { sourceId: 'user-service', targetId: 'payment-service', type: 'calls' },
    { sourceId: 'payment-service', targetId: 'stripe-api', type: 'calls' },
    { sourceId: 'user-repository', targetId: 'postgresql-db', type: 'stores_data_in' },
    { sourceId: 'cache-adapter', targetId: 'redis-cache', type: 'reads' },
  ];

  const contextDiagram = `graph TB
    User[User] --> |Uses| System["${projectName}"]
    System --> |Stores data in| DB[(PostgreSQL Database)]
    System --> |Caches data in| Redis[(Redis Cache)]
    System --> |Processes payments via| Stripe[Stripe API]`;

  const containerDiagram = `graph TB
    subgraph ${sanitizeId(projectName)}["${projectName}"]
        WebApp[Web Application<br/>React SPA]
        API[API Service<br/>Node.js Express]
    end

    WebApp --> API
    API --> DB[(PostgreSQL)]
    API --> Cache[(Redis)]
    API --> Stripe[Stripe API]`;

  const componentDiagram = `graph TB
    subgraph Presentation["Presentation Layer"]
        UserController[UserController]
    end

    subgraph Business["Business Logic"]
        UserService[UserService]
        PaymentService[PaymentService]
    end

    subgraph DataAccess["Data Access"]
        UserRepository[UserRepository]
        CacheAdapter[CacheAdapter]
    end

    UserController --> UserService
    UserService --> UserRepository
    UserService --> CacheAdapter
    UserService --> PaymentService`;

  const dependencyGraph = `graph LR
    user-controller --> user-service
    user-service --> user-repository
    user-service --> cache-adapter
    user-service --> payment-service
    payment-service -.-> stripe-api
    user-repository -.-> postgresql-db
    cache-adapter -.-> redis-cache`;

  return {
    diagrams: {
      context: contextDiagram,
      container: containerDiagram,
      component: componentDiagram,
      dependency: dependencyGraph,
    },
    metadata: {
      projectName,
      projectDescription: `E-commerce platform with ${components.length} components`,
      generatedAt: new Date(),
      source: 'codebase-analysis',
      analysisMetadata: {
        filesAnalyzed: 45,
        componentsDetected: components.length,
        externalSystemsDetected: externalSystems.length,
        analysisTimeMs: 234,
      },
    },
    externalSystems,
    components,
    relationships,
  };
}

/**
 * Mock C4 Model Service for integration testing
 */
interface IC4ModelService {
  generateDiagrams(request: C4DiagramRequest): Promise<C4DiagramResult>;
  storeResult(projectPath: string, result: C4DiagramResult): Promise<void>;
  publishEvent(result: C4DiagramResult, projectPath: string): Promise<void>;
}

function createMockC4ModelService(
  memory: MemoryBackend,
  eventBus: EventBus
): IC4ModelService {
  return {
    generateDiagrams: vi.fn(
      async (request: C4DiagramRequest): Promise<C4DiagramResult> => {
        const projectName = request.projectPath.split('/').pop() || 'Unknown';
        return createRealisticC4DiagramResult(projectName);
      }
    ),

    storeResult: vi.fn(
      async (projectPath: string, result: C4DiagramResult): Promise<void> => {
        await memory.set(`code-intelligence:c4:${projectPath}`, result);
      }
    ),

    publishEvent: vi.fn(
      async (result: C4DiagramResult, projectPath: string): Promise<void> => {
        const event = createEvent<C4DiagramsGeneratedPayload>(
          CodeIntelligenceEvents.KnowledgeGraphUpdated,
          'code-intelligence',
          {
            requestId: `req-${Date.now()}`,
            projectPath,
            diagrams: result.diagrams,
            componentsDetected: result.components.length,
            externalSystemsDetected: result.externalSystems.length,
            relationshipsDetected: result.relationships.length,
            analysisTimeMs: result.metadata.analysisMetadata?.analysisTimeMs ?? 0,
          }
        );
        await eventBus.publish(event);
      }
    ),
  };
}

/**
 * Mock Product Factors Service for integration testing
 */
interface IProductFactorsService {
  consumeC4Data(projectPath: string): Promise<Result<{
    externalSystemsUsed: number;
    componentsAnalyzed: number;
    testIdeasGenerated: number;
    platformCoverage: string[];
    structureCoverage: string[];
  }, Error>>;

  subscribeToC4Updates(callback: (diagrams: C4Diagrams) => void): { unsubscribe: () => void };
}

function createMockProductFactorsService(
  memory: MemoryBackend,
  eventBus: EventBus
): IProductFactorsService {
  const callbacks: Array<(diagrams: C4Diagrams) => void> = [];

  // Subscribe to C4 events
  eventBus.subscribe<C4DiagramsGeneratedPayload>(
    CodeIntelligenceEvents.KnowledgeGraphUpdated,
    async (event) => {
      if (event.payload?.diagrams) {
        callbacks.forEach((cb) => cb(event.payload.diagrams));
      }
    }
  );

  return {
    consumeC4Data: vi.fn(
      async (projectPath: string): Promise<Result<{
        externalSystemsUsed: number;
        componentsAnalyzed: number;
        testIdeasGenerated: number;
        platformCoverage: string[];
        structureCoverage: string[];
      }, Error>> => {
        const c4Data = await memory.get<C4DiagramResult>(
          `code-intelligence:c4:${projectPath}`
        );

        if (!c4Data) {
          return err(new Error(`No C4 data found for ${projectPath}`));
        }

        // Simulate test idea generation from C4 data
        const platformCoverage = c4Data.externalSystems.map((sys) => {
          const type = externalSystemToContainerType(sys.type);
          return `PLATFORM:${type.toUpperCase()}:${sys.name}`;
        });

        const structureCoverage = c4Data.components.map((comp) => {
          return `STRUCTURE:${comp.type.toUpperCase()}:${comp.name}`;
        });

        // Calculate test ideas (2 per external system + 3 per component)
        const testIdeasGenerated =
          c4Data.externalSystems.length * 2 + c4Data.components.length * 3;

        return ok({
          externalSystemsUsed: c4Data.externalSystems.length,
          componentsAnalyzed: c4Data.components.length,
          testIdeasGenerated,
          platformCoverage,
          structureCoverage,
        });
      }
    ),

    subscribeToC4Updates: vi.fn(
      (callback: (diagrams: C4Diagrams) => void): { unsubscribe: () => void } => {
        callbacks.push(callback);
        return {
          unsubscribe: () => {
            const index = callbacks.indexOf(callback);
            if (index >= 0) callbacks.splice(index, 1);
          },
        };
      }
    ),
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Code Intelligence to Product Factors Integration', () => {
  let memory: MemoryBackend;
  let eventBus: EventBus;
  let coordinator: AgentCoordinator;
  let c4Service: IC4ModelService;
  let productFactorsService: IProductFactorsService;

  beforeEach(async () => {
    memory = createMockMemory();
    eventBus = createMockEventBus();
    coordinator = createMockAgentCoordinator();
    c4Service = createMockC4ModelService(memory, eventBus);
    productFactorsService = createMockProductFactorsService(memory, eventBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End C4 Diagram Generation', () => {
    it('should generate C4 diagrams and store them for cross-domain access', async () => {
      const projectPath = '/test/ecommerce-app';

      // Step 1: Generate C4 diagrams via code-intelligence
      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        detectExternalSystems: true,
        analyzeComponents: true,
        analyzeCoupling: true,
        includeContext: true,
        includeContainer: true,
        includeComponent: true,
        includeDependency: true,
      });

      expect(c4Result.diagrams.context).toBeDefined();
      expect(c4Result.diagrams.container).toBeDefined();
      expect(c4Result.diagrams.component).toBeDefined();
      expect(c4Result.diagrams.dependency).toBeDefined();
      expect(c4Result.externalSystems.length).toBeGreaterThan(0);
      expect(c4Result.components.length).toBeGreaterThan(0);

      // Step 2: Store result in memory for cross-domain access
      await c4Service.storeResult(projectPath, c4Result);

      // Step 3: Verify stored data is accessible
      const storedData = await memory.get<C4DiagramResult>(
        `code-intelligence:c4:${projectPath}`
      );

      expect(storedData).toBeDefined();
      expect(storedData?.diagrams).toEqual(c4Result.diagrams);
      expect(storedData?.externalSystems).toHaveLength(
        c4Result.externalSystems.length
      );
    });

    it('should publish events when C4 diagrams are generated', async () => {
      const projectPath = '/test/event-project';
      const eventReceived = vi.fn();

      // Subscribe to events
      eventBus.subscribe<C4DiagramsGeneratedPayload>(
        CodeIntelligenceEvents.KnowledgeGraphUpdated,
        async (event) => {
          eventReceived(event);
        }
      );

      // Generate and store
      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        detectExternalSystems: true,
        analyzeComponents: true,
      });
      await c4Service.storeResult(projectPath, c4Result);

      // Publish event
      await c4Service.publishEvent(c4Result, projectPath);

      expect(eventReceived).toHaveBeenCalled();
      expect(eventReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
          source: 'code-intelligence',
          payload: expect.objectContaining({
            projectPath,
            componentsDetected: c4Result.components.length,
            externalSystemsDetected: c4Result.externalSystems.length,
          }),
        })
      );
    });
  });

  describe('Product Factors Assessor C4 Data Consumption', () => {
    it('should consume C4 data from code-intelligence domain', async () => {
      const projectPath = '/test/consumer-project';

      // Generate and store C4 data
      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        detectExternalSystems: true,
        analyzeComponents: true,
      });
      await c4Service.storeResult(projectPath, c4Result);

      // Consume in product-factors-assessor
      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        expect(consumeResult.value.externalSystemsUsed).toBe(
          c4Result.externalSystems.length
        );
        expect(consumeResult.value.componentsAnalyzed).toBe(
          c4Result.components.length
        );
        expect(consumeResult.value.testIdeasGenerated).toBeGreaterThan(0);
      }
    });

    it('should generate PLATFORM test ideas from external systems', async () => {
      const projectPath = '/test/platform-test';

      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        detectExternalSystems: true,
      });
      await c4Service.storeResult(projectPath, c4Result);

      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        // Should have PLATFORM coverage for each external system
        expect(consumeResult.value.platformCoverage.length).toBe(
          c4Result.externalSystems.length
        );

        // Should include database, cache, and API platform types
        const platformTypes = consumeResult.value.platformCoverage.map((p) =>
          p.split(':')[1]
        );
        expect(platformTypes).toContain('DATABASE');
        expect(platformTypes).toContain('CACHE');
        expect(platformTypes).toContain('API');
      }
    });

    it('should generate STRUCTURE test ideas from components', async () => {
      const projectPath = '/test/structure-test';

      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        analyzeComponents: true,
      });
      await c4Service.storeResult(projectPath, c4Result);

      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        expect(consumeResult.value.structureCoverage.length).toBe(
          c4Result.components.length
        );

        // Should include different component types
        const structureTypes = consumeResult.value.structureCoverage.map((s) =>
          s.split(':')[1]
        );
        expect(structureTypes).toContain('CONTROLLER');
        expect(structureTypes).toContain('SERVICE');
        expect(structureTypes).toContain('REPOSITORY');
      }
    });

    it('should handle missing C4 data gracefully', async () => {
      const consumeResult = await productFactorsService.consumeC4Data(
        '/nonexistent/project'
      );

      expect(consumeResult.success).toBe(false);
      if (!consumeResult.success) {
        expect(consumeResult.error.message).toContain('No C4 data found');
      }
    });
  });

  describe('Event Flow Between Domains', () => {
    it('should notify product-factors when C4 data is updated', async () => {
      const projectPath = '/test/event-flow';
      const updateCallback = vi.fn();

      // Subscribe to updates in product-factors
      productFactorsService.subscribeToC4Updates(updateCallback);

      // Generate C4 data and publish event
      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        includeContext: true,
        includeContainer: true,
      });
      await c4Service.storeResult(projectPath, c4Result);
      await c4Service.publishEvent(c4Result, projectPath);

      expect(updateCallback).toHaveBeenCalled();
      expect(updateCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.any(String),
          container: expect.any(String),
        })
      );
    });

    it('should support incremental updates', async () => {
      const projectPath = '/test/incremental';
      const updateCallbacks: C4Diagrams[] = [];

      productFactorsService.subscribeToC4Updates((diagrams) => {
        updateCallbacks.push(diagrams);
      });

      // First update
      const c4Result1 = await c4Service.generateDiagrams({
        projectPath,
        includeContext: true,
      });
      await c4Service.storeResult(projectPath, c4Result1);
      await c4Service.publishEvent(c4Result1, projectPath);

      // Second update (simulating code changes)
      const c4Result2 = await c4Service.generateDiagrams({
        projectPath,
        includeContext: true,
        includeComponent: true,
      });
      await c4Service.storeResult(projectPath, c4Result2);
      await c4Service.publishEvent(c4Result2, projectPath);

      expect(updateCallbacks).toHaveLength(2);
    });

    it('should correlate events across domains', async () => {
      const projectPath = '/test/correlation';
      const correlationId = `corr-${Date.now()}`;
      const eventHistory: DomainEvent[] = [];

      // Track all events
      eventBus.subscribe('*', async (event) => {
        eventHistory.push(event);
      });

      // Generate with correlation
      const c4Result = await c4Service.generateDiagrams({ projectPath });
      await c4Service.storeResult(projectPath, c4Result);

      // Publish with correlation ID
      const event = createEvent<C4DiagramsGeneratedPayload>(
        CodeIntelligenceEvents.KnowledgeGraphUpdated,
        'code-intelligence',
        {
          requestId: correlationId,
          projectPath,
          diagrams: c4Result.diagrams,
          componentsDetected: c4Result.components.length,
          externalSystemsDetected: c4Result.externalSystems.length,
          relationshipsDetected: c4Result.relationships.length,
          analysisTimeMs: 150,
        },
        correlationId
      );
      await eventBus.publish(event);

      // Verify event was captured
      const matchingEvents = (await eventBus.getHistory()).filter(
        (e) => e.correlationId === correlationId
      );
      expect(matchingEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Full Integration Workflow', () => {
    it('should complete full workflow from codebase to test ideas', async () => {
      const projectPath = '/test/full-workflow';

      // Step 1: Code Intelligence generates C4 diagrams
      const c4Result = await c4Service.generateDiagrams({
        projectPath,
        detectExternalSystems: true,
        analyzeComponents: true,
        analyzeCoupling: true,
        includeContext: true,
        includeContainer: true,
        includeComponent: true,
        includeDependency: true,
      });

      expect(c4Result.diagrams.context).toBeDefined();
      expect(c4Result.externalSystems.length).toBe(3); // PostgreSQL, Redis, Stripe
      expect(c4Result.components.length).toBe(5); // Our 5 components

      // Step 2: Store in shared memory
      await c4Service.storeResult(projectPath, c4Result);

      // Step 3: Publish event for cross-domain notification
      await c4Service.publishEvent(c4Result, projectPath);

      // Step 4: Product Factors consumes C4 data
      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        // Step 5: Verify test idea generation
        expect(consumeResult.value.testIdeasGenerated).toBe(
          3 * 2 + 5 * 3 // 3 external systems * 2 + 5 components * 3 = 21
        );

        // Step 6: Verify SFDIPOT coverage
        expect(consumeResult.value.platformCoverage).toContain(
          'PLATFORM:DATABASE:PostgreSQL Database'
        );
        expect(consumeResult.value.platformCoverage).toContain(
          'PLATFORM:CACHE:Redis Cache'
        );
        expect(consumeResult.value.structureCoverage).toContain(
          'STRUCTURE:CONTROLLER:UserController'
        );
        expect(consumeResult.value.structureCoverage).toContain(
          'STRUCTURE:SERVICE:UserService'
        );
      }
    });

    it('should handle concurrent requests from multiple projects', async () => {
      const projects = [
        '/project/alpha',
        '/project/beta',
        '/project/gamma',
      ];

      // Generate C4 diagrams for all projects concurrently
      const generatePromises = projects.map(async (projectPath) => {
        const result = await c4Service.generateDiagrams({
          projectPath,
          detectExternalSystems: true,
          analyzeComponents: true,
        });
        await c4Service.storeResult(projectPath, result);
        return result;
      });

      const results = await Promise.all(generatePromises);

      // Verify all projects have data
      for (let i = 0; i < projects.length; i++) {
        const projectPath = projects[i];
        const storedData = await memory.get<C4DiagramResult>(
          `code-intelligence:c4:${projectPath}`
        );
        expect(storedData).toBeDefined();
        expect(storedData?.metadata.projectName).toBe(projectPath.split('/').pop());
      }

      // Consume in product-factors for all projects
      const consumePromises = projects.map((projectPath) =>
        productFactorsService.consumeC4Data(projectPath)
      );

      const consumeResults = await Promise.all(consumePromises);

      // Verify all consumptions succeeded
      consumeResults.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty project gracefully', async () => {
      const projectPath = '/test/empty-project';

      // Create minimal C4 result
      const minimalResult: C4DiagramResult = {
        diagrams: { context: 'graph TB\n    Empty[No components detected]' },
        metadata: {
          projectName: 'empty-project',
          projectDescription: 'Empty project',
          generatedAt: new Date(),
          source: 'codebase-analysis',
          analysisMetadata: {
            filesAnalyzed: 0,
            componentsDetected: 0,
            externalSystemsDetected: 0,
            analysisTimeMs: 10,
          },
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await c4Service.storeResult(projectPath, minimalResult);

      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        expect(consumeResult.value.externalSystemsUsed).toBe(0);
        expect(consumeResult.value.componentsAnalyzed).toBe(0);
        expect(consumeResult.value.testIdeasGenerated).toBe(0);
      }
    });

    it('should handle special characters in project paths', async () => {
      const projectPath = '/test/my project (1)/src';

      const c4Result = await c4Service.generateDiagrams({ projectPath });
      await c4Service.storeResult(projectPath, c4Result);

      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
    });

    it('should handle very large component sets', async () => {
      const projectPath = '/test/large-project';

      // Create result with many components
      const largeResult = createRealisticC4DiagramResult('large-project');
      for (let i = 0; i < 100; i++) {
        largeResult.components.push({
          id: `component-${i}`,
          name: `Component${i}`,
          type: inferComponentType(`Service${i}`) as C4ComponentType,
          files: [`src/components/component-${i}.ts`],
        });
      }

      await c4Service.storeResult(projectPath, largeResult);

      const consumeResult = await productFactorsService.consumeC4Data(projectPath);

      expect(consumeResult.success).toBe(true);
      if (consumeResult.success) {
        expect(consumeResult.value.componentsAnalyzed).toBe(
          largeResult.components.length
        );
        // 3 external systems * 2 + 105 components * 3 = 321
        expect(consumeResult.value.testIdeasGenerated).toBe(321);
      }
    });
  });
});
