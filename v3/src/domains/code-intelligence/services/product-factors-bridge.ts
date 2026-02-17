/**
 * Agentic QE v3 - Product Factors Bridge Service
 *
 * Provides integration between the code-intelligence domain and the
 * product-factors-assessor in the requirements-validation domain.
 *
 * This bridge:
 * - Allows product-factors-assessor to request C4 data from code-intelligence
 * - Provides cached C4 diagrams to avoid regeneration
 * - Subscribes to code-intelligence events for reactive updates
 *
 * Event-driven architecture following V3 patterns.
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Result, ok, err, DomainEvent } from '../../../shared/types';
import { EventBus, MemoryBackend, Subscription } from '../../../kernel/interfaces';
import {
  CodeIntelligenceEvents,
  C4DiagramsGeneratedPayload,
  createEvent,
} from '../../../shared/events/domain-events';
import { toError } from '../../../shared/error-utils.js';
import {
  C4Diagrams,
  C4DiagramResult,
  C4DiagramRequest,
  C4DiagramMetadata,
  C4CacheEntry,
  C4ProjectInfo,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  ModuleCouplingInfo,
  ExternalSystemType,
  C4RelationshipType,
  isCacheValid,
  sanitizeId,
  inferComponentType,
  IC4DiagramGenerator,
} from '../../../shared/c4-model';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ProductFactorsBridgeConfig {
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtlMs: number;
  /** Whether to publish events */
  publishEvents: boolean;
  /** Exclude patterns for analysis */
  excludePatterns: string[];
  /** Maximum files to analyze */
  maxFiles: number;
}

const DEFAULT_CONFIG: ProductFactorsBridgeConfig = {
  cacheTtlMs: 3600000, // 1 hour
  publishEvents: true,
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
  ],
  maxFiles: 1000,
};

// Known external system patterns for detection
const EXTERNAL_SYSTEM_PATTERNS: Record<
  string,
  { type: ExternalSystemType; technology: string }
> = {
  // Databases
  pg: { type: 'database', technology: 'PostgreSQL' },
  mysql: { type: 'database', technology: 'MySQL' },
  mysql2: { type: 'database', technology: 'MySQL' },
  mongodb: { type: 'database', technology: 'MongoDB' },
  mongoose: { type: 'database', technology: 'MongoDB' },
  sqlite3: { type: 'database', technology: 'SQLite' },
  'better-sqlite3': { type: 'database', technology: 'SQLite' },
  prisma: { type: 'database', technology: 'Prisma ORM' },
  typeorm: { type: 'database', technology: 'TypeORM' },
  sequelize: { type: 'database', technology: 'Sequelize' },
  'drizzle-orm': { type: 'database', technology: 'Drizzle' },
  '@supabase/supabase-js': { type: 'database', technology: 'Supabase' },

  // Cache
  redis: { type: 'cache', technology: 'Redis' },
  ioredis: { type: 'cache', technology: 'Redis' },
  memcached: { type: 'cache', technology: 'Memcached' },

  // Message Queues
  amqplib: { type: 'queue', technology: 'RabbitMQ' },
  kafkajs: { type: 'queue', technology: 'Kafka' },
  bullmq: { type: 'queue', technology: 'BullMQ' },
  bull: { type: 'queue', technology: 'Bull' },
  '@aws-sdk/client-sqs': { type: 'queue', technology: 'AWS SQS' },

  // Cloud Storage
  '@aws-sdk/client-s3': { type: 'storage', technology: 'AWS S3' },
  '@google-cloud/storage': { type: 'storage', technology: 'Google Cloud Storage' },
  '@azure/storage-blob': { type: 'storage', technology: 'Azure Blob Storage' },

  // Auth
  '@auth0/auth0-spa-js': { type: 'auth', technology: 'Auth0' },
  passport: { type: 'auth', technology: 'Passport.js' },
  jsonwebtoken: { type: 'auth', technology: 'JWT' },
  '@clerk/clerk-sdk-node': { type: 'auth', technology: 'Clerk' },

  // Monitoring
  '@sentry/node': { type: 'monitoring', technology: 'Sentry' },
  newrelic: { type: 'monitoring', technology: 'New Relic' },
  '@datadog/dd-trace': { type: 'monitoring', technology: 'Datadog' },
  pino: { type: 'monitoring', technology: 'Pino Logger' },
  winston: { type: 'monitoring', technology: 'Winston Logger' },

  // APIs
  axios: { type: 'api', technology: 'HTTP Client' },
  'node-fetch': { type: 'api', technology: 'HTTP Client' },
  got: { type: 'api', technology: 'HTTP Client' },
  '@anthropic-ai/sdk': { type: 'api', technology: 'Anthropic API' },
  openai: { type: 'api', technology: 'OpenAI API' },
  stripe: { type: 'api', technology: 'Stripe API' },
  twilio: { type: 'api', technology: 'Twilio API' },
};

// ============================================================================
// Product Factors Bridge Service Interface
// ============================================================================

export interface IProductFactorsBridge {
  /** Initialize the bridge and subscribe to events */
  initialize(): Promise<void>;

  /** Dispose and cleanup */
  dispose(): Promise<void>;

  /** Request C4 diagrams for a project */
  requestC4Diagrams(
    request: C4DiagramRequest
  ): Promise<Result<C4DiagramResult, Error>>;

  /** Get cached C4 diagrams if available */
  getCachedDiagrams(projectPath: string): Promise<C4DiagramResult | null>;

  /** Invalidate cache for a project */
  invalidateCache(projectPath: string): Promise<void>;

  /** Get external systems for a project */
  getExternalSystems(
    projectPath: string
  ): Promise<Result<DetectedExternalSystem[], Error>>;

  /** Get components for a project */
  getComponents(
    projectPath: string
  ): Promise<Result<DetectedComponent[], Error>>;
}

// ============================================================================
// Product Factors Bridge Service Implementation
// ============================================================================

/**
 * Product Factors Bridge Service
 *
 * Bridges code-intelligence C4 capabilities with product-factors-assessor.
 */
export class ProductFactorsBridgeService
  implements IProductFactorsBridge, IC4DiagramGenerator
{
  private readonly config: ProductFactorsBridgeConfig;
  private initialized = false;
  private eventSubscriptions: Subscription[] = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    config: Partial<ProductFactorsBridgeConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to code-intelligence events
    this.subscribeToEvents();

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    // Unsubscribe from events
    for (const subscription of this.eventSubscriptions) {
      subscription.unsubscribe();
    }
    this.eventSubscriptions = [];

    this.initialized = false;
  }

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  private subscribeToEvents(): void {
    // Subscribe to knowledge graph updates to invalidate cache
    const sub1 = this.eventBus.subscribe(
      CodeIntelligenceEvents.KnowledgeGraphUpdated,
      this.handleKnowledgeGraphUpdated.bind(this)
    );
    this.eventSubscriptions.push(sub1);

    // Subscribe to impact analysis for cache updates
    const sub2 = this.eventBus.subscribe(
      CodeIntelligenceEvents.ImpactAnalysisCompleted,
      this.handleImpactAnalysisCompleted.bind(this)
    );
    this.eventSubscriptions.push(sub2);
  }

  private async handleKnowledgeGraphUpdated(
    event: DomainEvent
  ): Promise<void> {
    // Invalidate relevant caches when knowledge graph is updated
    console.log(
      '[ProductFactorsBridge] Knowledge graph updated, considering cache invalidation'
    );
    // Note: We don't have project path in this event, so we rely on hash-based invalidation
  }

  private async handleImpactAnalysisCompleted(
    event: DomainEvent
  ): Promise<void> {
    // Track impacted files for potential cache invalidation
    const payload = event.payload as { changedFiles?: string[] };
    if (payload.changedFiles && payload.changedFiles.length > 0) {
      console.log(
        `[ProductFactorsBridge] Impact analysis detected ${payload.changedFiles.length} changed files`
      );
    }
  }

  // ==========================================================================
  // C4 Diagram Request
  // ==========================================================================

  async requestC4Diagrams(
    request: C4DiagramRequest
  ): Promise<Result<C4DiagramResult, Error>> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Check cache first
      const cached = await this.getCachedDiagrams(request.projectPath);
      if (cached) {
        console.log(
          `[ProductFactorsBridge] Returning cached C4 diagrams for ${request.projectPath}`
        );
        return ok(cached);
      }

      // Generate new diagrams
      const result = await this.generateC4Diagrams(request);

      if (result.success) {
        // Cache the result
        await this.cacheResult(request.projectPath, result.value);

        // Publish event
        if (this.config.publishEvents) {
          await this.publishC4DiagramsGenerated(
            requestId,
            request.projectPath,
            result.value,
            Date.now() - startTime
          );
        }
      }

      return result;
    } catch (error) {
      const errorObj = toError(error);
      return err(errorObj);
    }
  }

  // ==========================================================================
  // C4 Diagram Generation
  // ==========================================================================

  private async generateC4Diagrams(
    request: C4DiagramRequest
  ): Promise<Result<C4DiagramResult, Error>> {
    const startTime = Date.now();

    try {
      // Get project metadata
      const projectInfo = await this.getProjectMetadata(request.projectPath);

      // Detect external systems
      let externalSystems: DetectedExternalSystem[] = [];
      if (request.detectExternalSystems !== false) {
        externalSystems = await this.detectExternalSystems(request.projectPath);
      }

      // Analyze components
      let components: DetectedComponent[] = [];
      let relationships: DetectedRelationship[] = [];
      if (request.analyzeComponents !== false) {
        const componentResult = await this.analyzeComponents(request.projectPath);
        components = componentResult.components;
        relationships = componentResult.relationships;
      }

      // Analyze coupling
      let couplingAnalysis: ModuleCouplingInfo[] | undefined;
      if (request.analyzeCoupling && components.length > 1) {
        couplingAnalysis = this.analyzeCoupling(components, relationships);
      }

      // Generate diagrams
      const diagrams: C4Diagrams = {};

      if (request.includeContext !== false) {
        diagrams.context = this.generateContextDiagram(projectInfo, externalSystems);
      }

      if (request.includeContainer !== false) {
        diagrams.container = this.generateContainerDiagram(
          projectInfo,
          externalSystems
        );
      }

      if (request.includeComponent !== false && components.length > 0) {
        diagrams.component = this.generateComponentDiagram(
          projectInfo.name,
          components,
          relationships
        );
      }

      if (request.includeDependency && components.length > 0) {
        diagrams.dependency = this.generateDependencyGraph(
          components,
          relationships
        );
      }

      const metadata: C4DiagramMetadata = {
        projectName: projectInfo.name,
        projectDescription: projectInfo.description,
        generatedAt: new Date(),
        source: 'codebase-analysis',
        analysisMetadata: {
          filesAnalyzed: components.reduce((sum, c) => sum + c.files.length, 0),
          componentsDetected: components.length,
          externalSystemsDetected: externalSystems.length,
          analysisTimeMs: Date.now() - startTime,
        },
      };

      return ok({
        diagrams,
        metadata,
        externalSystems,
        components,
        relationships,
        couplingAnalysis,
      });
    } catch (error) {
      const errorObj = toError(error);
      return err(errorObj);
    }
  }

  // ==========================================================================
  // IC4DiagramGenerator Implementation
  // ==========================================================================

  generateContextDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string {
    let mermaid = `C4Context
  title System Context diagram for ${project.name}

  Person(user, "User", "A user of the system")
  System(system, "${project.name}", "${project.description}")
`;

    for (const sys of externalSystems) {
      mermaid += `  System_Ext(${sys.id}, "${sys.name}", "${sys.type}")
`;
    }

    mermaid += `
  Rel(user, system, "Uses")
`;

    for (const sys of externalSystems) {
      mermaid += `  Rel(system, ${sys.id}, "${sys.relationship}")
`;
    }

    return mermaid;
  }

  generateContainerDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string {
    let mermaid = `C4Container
  title Container diagram for ${project.name}

  Person(user, "User", "A user of the system")

  Container_Boundary(c1, "${project.name}") {
    Container(app, "Application", "TypeScript", "Main application")
  }
`;

    for (const sys of externalSystems) {
      mermaid += `  System_Ext(${sys.id}, "${sys.name}", "${sys.type}")
`;
    }

    mermaid += `
  Rel(user, app, "Uses")
`;

    for (const sys of externalSystems) {
      mermaid += `  Rel(app, ${sys.id}, "${sys.relationship}")
`;
    }

    return mermaid;
  }

  generateComponentDiagram(
    projectName: string,
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string {
    let mermaid = `C4Component
  title Component diagram for ${projectName}

  Container_Boundary(app, "Application") {
`;

    for (const comp of components) {
      const responsibility = comp.responsibilities?.[0] || '';
      mermaid += `    Component(${comp.id}, "${comp.name}", "${comp.technology || 'TypeScript'}", "${responsibility}")
`;
    }

    mermaid += `  }
`;

    for (const rel of relationships) {
      mermaid += `  Rel(${rel.sourceId}, ${rel.targetId}, "${rel.type}")
`;
    }

    return mermaid;
  }

  generateDependencyGraph(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string {
    let mermaid = `graph TD
`;

    // Add nodes
    for (const comp of components) {
      mermaid += `  ${comp.id}["${comp.name}"]
`;
    }

    // Add edges
    for (const rel of relationships) {
      const arrow = rel.type === 'depends_on' ? '-->|depends|' : '-->';
      mermaid += `  ${rel.sourceId} ${arrow} ${rel.targetId}
`;
    }

    return mermaid;
  }

  // ==========================================================================
  // Analysis Methods
  // ==========================================================================

  private async getProjectMetadata(
    projectPath: string
  ): Promise<C4ProjectInfo> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = safeJsonParse(content);
      return {
        name: pkg.name || 'Project',
        description: pkg.description || 'Application system',
      };
    } catch {
      return {
        name: 'Project',
        description: 'Application system',
      };
    }
  }

  private async detectExternalSystems(
    projectPath: string
  ): Promise<DetectedExternalSystem[]> {
    const systems: DetectedExternalSystem[] = [];

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');

      // Check if package.json exists
      try {
        await fs.access(packageJsonPath);
      } catch {
        return systems;
      }

      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = safeJsonParse(content);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const [depName] of Object.entries(allDeps)) {
        const pattern = EXTERNAL_SYSTEM_PATTERNS[depName];
        if (pattern) {
          systems.push({
            id: sanitizeId(depName),
            name: pattern.technology,
            type: pattern.type,
            technology: pattern.technology,
            detectedFrom: 'package.json',
            relationship: this.inferRelationship(pattern.type),
          });
        }
      }
    } catch (error) {
      console.error(
        '[ProductFactorsBridge] External system detection failed:',
        error
      );
    }

    return systems;
  }

  private inferRelationship(type: ExternalSystemType): C4RelationshipType {
    switch (type) {
      case 'database':
        return 'stores_data_in';
      case 'auth':
        return 'authenticates_with';
      case 'queue':
        return 'sends';
      default:
        return 'uses';
    }
  }

  private async analyzeComponents(
    projectPath: string
  ): Promise<{
    components: DetectedComponent[];
    relationships: DetectedRelationship[];
  }> {
    const components: DetectedComponent[] = [];
    const relationships: DetectedRelationship[] = [];

    try {
      const srcDir = path.join(projectPath, 'src');

      // Check if src directory exists
      let analyzeDir = projectPath;
      try {
        await fs.access(srcDir);
        analyzeDir = srcDir;
      } catch {
        // Use root directory
      }

      // Get top-level directories as components
      const entries = await fs.readdir(analyzeDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          const componentPath = path.join(analyzeDir, entry.name);
          const files = await this.getFilesInDirectory(
            componentPath,
            projectPath
          );

          if (files.length > 0) {
            components.push({
              id: sanitizeId(entry.name),
              name: this.formatComponentName(entry.name),
              type: inferComponentType(entry.name),
              boundary: this.inferBoundary(entry.name),
              technology: 'TypeScript',
              files,
              responsibilities: [this.inferResponsibility(entry.name)],
            });
          }
        }
      }

      // Detect relationships based on naming conventions
      for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
          const compA = components[i];
          const compB = components[j];

          if (this.likelyHasRelationship(compA.id, compB.id)) {
            relationships.push({
              sourceId: compA.id,
              targetId: compB.id,
              type: 'uses',
              weight: 1,
            });
          }
        }
      }
    } catch (error) {
      console.error('[ProductFactorsBridge] Component analysis failed:', error);
    }

    return { components, relationships };
  }

  private shouldExclude(name: string): boolean {
    const excludeNames = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '__tests__',
      '__mocks__',
    ];
    return excludeNames.includes(name) || name.startsWith('.');
  }

  private async getFilesInDirectory(
    dir: string,
    rootDir: string,
    maxDepth = 3
  ): Promise<string[]> {
    const files: string[] = [];

    const scan = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (this.shouldExclude(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(rootDir, fullPath);

          if (entry.isDirectory()) {
            await scan(fullPath, depth + 1);
          } else if (entry.isFile() && this.isSourceFile(entry.name)) {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Non-critical: permission errors when scanning directories
        console.debug('[ProductFactorsBridge] Directory scan error:', error instanceof Error ? error.message : error);
      }
    };

    await scan(dir, 0);
    return files;
  }

  private isSourceFile(name: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
    return (
      extensions.some((ext) => name.endsWith(ext)) && !name.endsWith('.d.ts')
    );
  }

  private formatComponentName(name: string): string {
    return name
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private inferBoundary(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('api') || lower.includes('controller')) return 'API Layer';
    if (lower.includes('service')) return 'Service Layer';
    if (lower.includes('domain')) return 'Domain Layer';
    if (lower.includes('infra') || lower.includes('database'))
      return 'Infrastructure Layer';
    if (lower.includes('ui') || lower.includes('component'))
      return 'Presentation Layer';
    return 'Core';
  }

  private inferResponsibility(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('auth')) return 'Authentication and authorization';
    if (lower.includes('user')) return 'User management';
    if (lower.includes('api')) return 'API endpoint handling';
    if (lower.includes('service')) return 'Business logic processing';
    if (lower.includes('model')) return 'Data modeling and validation';
    if (lower.includes('util')) return 'Utility functions';
    if (lower.includes('config')) return 'Configuration management';
    return `${this.formatComponentName(name)} functionality`;
  }

  private likelyHasRelationship(idA: string, idB: string): boolean {
    const patterns = [
      ['service', 'model'],
      ['service', 'repository'],
      ['controller', 'service'],
      ['api', 'service'],
      ['domain', 'infra'],
    ];

    const lowerA = idA.toLowerCase();
    const lowerB = idB.toLowerCase();

    return patterns.some(
      ([a, b]) =>
        (lowerA.includes(a) && lowerB.includes(b)) ||
        (lowerA.includes(b) && lowerB.includes(a))
    );
  }

  private analyzeCoupling(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): ModuleCouplingInfo[] {
    const couplingInfo: ModuleCouplingInfo[] = [];

    try {
      if (components.length < 2) {
        return couplingInfo;
      }

      // Detect circular dependencies
      const circularPairs = new Set<string>();
      for (const rel of relationships) {
        const reverseExists = relationships.some(
          (r) => r.sourceId === rel.targetId && r.targetId === rel.sourceId
        );
        if (reverseExists) {
          const pairKey = [rel.sourceId, rel.targetId].sort().join('::');
          circularPairs.add(pairKey);
        }
      }

      // Analyze coupling between component pairs
      for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
          const compA = components[i];
          const compB = components[j];

          const relsBetween = relationships.filter(
            (r) =>
              (r.sourceId === compA.id && r.targetId === compB.id) ||
              (r.sourceId === compB.id && r.targetId === compA.id)
          );

          if (relsBetween.length > 0) {
            const totalWeight = relsBetween.reduce(
              (sum, r) => sum + (r.weight || 1),
              0
            );
            const couplingStrength = Math.min(1, totalWeight / 10);

            const pairKey = [compA.id, compB.id].sort().join('::');
            const isCircular = circularPairs.has(pairKey);

            couplingInfo.push({
              moduleA: compA.name,
              moduleB: compB.name,
              couplingStrength,
              isCircular,
              recommendation: this.getCouplingRecommendation(
                couplingStrength,
                isCircular
              ),
            });
          }
        }
      }
    } catch (error) {
      console.error('[ProductFactorsBridge] Coupling analysis failed:', error);
    }

    return couplingInfo;
  }

  private getCouplingRecommendation(
    strength: number,
    isCircular: boolean
  ): string {
    if (isCircular) {
      return 'CRITICAL: Circular dependency detected. Consider extracting shared interface.';
    }
    if (strength > 0.8) {
      return 'HIGH: Tightly coupled. Consider interface segregation or facade pattern.';
    }
    if (strength > 0.5) {
      return 'MEDIUM: Moderate coupling. Monitor for growth.';
    }
    return 'LOW: Acceptable coupling level.';
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  async getCachedDiagrams(projectPath: string): Promise<C4DiagramResult | null> {
    const cacheKey = this.getCacheKey(projectPath);

    const cached = await this.memory.get<C4CacheEntry>(cacheKey);
    if (cached && isCacheValid(cached)) {
      return cached.result;
    }

    return null;
  }

  async invalidateCache(projectPath: string): Promise<void> {
    const cacheKey = this.getCacheKey(projectPath);
    await this.memory.delete(cacheKey);
  }

  private async cacheResult(
    projectPath: string,
    result: C4DiagramResult
  ): Promise<void> {
    const cacheKey = this.getCacheKey(projectPath);
    const projectHash = await this.computeProjectHash(projectPath);

    const cacheEntry: C4CacheEntry = {
      result,
      cachedAt: new Date(),
      ttlMs: this.config.cacheTtlMs,
      projectHash,
    };

    await this.memory.set(cacheKey, cacheEntry, {
      namespace: 'code-intelligence',
      ttl: this.config.cacheTtlMs,
    });
  }

  private getCacheKey(projectPath: string): string {
    return `c4-diagrams:${sanitizeId(projectPath)}`;
  }

  private async computeProjectHash(projectPath: string): Promise<string> {
    // Simple hash based on package.json and file count
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return this.hashString(content);
    } catch {
      return this.hashString(projectPath + Date.now());
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash).toString(16);
  }

  // ==========================================================================
  // Direct Access Methods
  // ==========================================================================

  async getExternalSystems(
    projectPath: string
  ): Promise<Result<DetectedExternalSystem[], Error>> {
    try {
      const cached = await this.getCachedDiagrams(projectPath);
      if (cached) {
        return ok(cached.externalSystems);
      }

      const systems = await this.detectExternalSystems(projectPath);
      return ok(systems);
    } catch (error) {
      const errorObj = toError(error);
      return err(errorObj);
    }
  }

  async getComponents(
    projectPath: string
  ): Promise<Result<DetectedComponent[], Error>> {
    try {
      const cached = await this.getCachedDiagrams(projectPath);
      if (cached) {
        return ok(cached.components);
      }

      const { components } = await this.analyzeComponents(projectPath);
      return ok(components);
    } catch (error) {
      const errorObj = toError(error);
      return err(errorObj);
    }
  }

  // ==========================================================================
  // Event Publishing
  // ==========================================================================

  private async publishC4DiagramsGenerated(
    requestId: string,
    projectPath: string,
    result: C4DiagramResult,
    analysisTimeMs: number
  ): Promise<void> {
    const payload: C4DiagramsGeneratedPayload = {
      requestId,
      projectPath,
      componentsDetected: result.components.length,
      externalSystemsDetected: result.externalSystems.length,
      relationshipsDetected: result.relationships.length,
      analysisTimeMs,
      hasContextDiagram: !!result.diagrams.context,
      hasContainerDiagram: !!result.diagrams.container,
      hasComponentDiagram: !!result.diagrams.component,
    };

    const event = createEvent(
      CodeIntelligenceEvents.C4DiagramsGenerated,
      'code-intelligence',
      payload
    );

    await this.eventBus.publish(event);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a ProductFactorsBridge instance
 */
export function createProductFactorsBridge(
  eventBus: EventBus,
  memory: MemoryBackend,
  config?: Partial<ProductFactorsBridgeConfig>
): IProductFactorsBridge {
  return new ProductFactorsBridgeService(eventBus, memory, config);
}
