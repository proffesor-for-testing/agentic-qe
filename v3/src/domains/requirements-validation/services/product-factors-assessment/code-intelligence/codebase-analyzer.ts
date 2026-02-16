/**
 * Codebase Analyzer for Product Factors Assessor
 *
 * Provides automated codebase analysis for SFDIPOT assessment.
 * This is a standalone implementation that can be extended with
 * additional code intelligence integrations.
 *
 * Phases:
 * - Phase 1: External system detection from package.json
 * - Phase 2: Component boundary analysis from directory structure
 * - Phase 3: Relationship-based coupling analysis
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import {
  CodeIntelligenceResult,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  ModuleCouplingInfo,
  C4Diagrams,
  TestIdea,
  HTSMCategory,
  Priority,
  AutomationFitness,
  generateTestId,
} from '../types/index.js';
import { safeJsonParse } from '../../../../../shared/safe-json.js';

/**
 * Configuration for CodebaseAnalyzer
 */
export interface CodebaseAnalyzerConfig {
  /** Enable external system detection (PLATFORM) */
  detectExternalSystems?: boolean;
  /** Enable component boundary analysis (STRUCTURE/INTERFACES) */
  analyzeComponents?: boolean;
  /** Enable module coupling analysis */
  analyzeCoupling?: boolean;
  /** Generate C4 diagrams */
  generateC4Diagrams?: boolean;
  /** Root directory for analysis */
  rootDir: string;
  /** Exclude patterns */
  excludePatterns?: string[];
}

const DEFAULT_CONFIG: Partial<CodebaseAnalyzerConfig> = {
  detectExternalSystems: true,
  analyzeComponents: true,
  analyzeCoupling: true,
  generateC4Diagrams: true,
  excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
};

// Known external system patterns for detection
const EXTERNAL_SYSTEM_PATTERNS: Record<string, { type: DetectedExternalSystem['type']; technology: string }> = {
  // Databases
  'pg': { type: 'database', technology: 'PostgreSQL' },
  'mysql': { type: 'database', technology: 'MySQL' },
  'mysql2': { type: 'database', technology: 'MySQL' },
  'mongodb': { type: 'database', technology: 'MongoDB' },
  'mongoose': { type: 'database', technology: 'MongoDB' },
  'sqlite3': { type: 'database', technology: 'SQLite' },
  'better-sqlite3': { type: 'database', technology: 'SQLite' },
  'prisma': { type: 'database', technology: 'Prisma ORM' },
  'typeorm': { type: 'database', technology: 'TypeORM' },
  'sequelize': { type: 'database', technology: 'Sequelize' },
  'drizzle-orm': { type: 'database', technology: 'Drizzle' },
  '@supabase/supabase-js': { type: 'database', technology: 'Supabase' },

  // Cache
  'redis': { type: 'cache', technology: 'Redis' },
  'ioredis': { type: 'cache', technology: 'Redis' },
  'memcached': { type: 'cache', technology: 'Memcached' },

  // Message Queues
  'amqplib': { type: 'queue', technology: 'RabbitMQ' },
  'kafkajs': { type: 'queue', technology: 'Kafka' },
  'bullmq': { type: 'queue', technology: 'BullMQ' },
  'bull': { type: 'queue', technology: 'Bull' },
  '@aws-sdk/client-sqs': { type: 'queue', technology: 'AWS SQS' },

  // Cloud Storage
  '@aws-sdk/client-s3': { type: 'storage', technology: 'AWS S3' },
  '@google-cloud/storage': { type: 'storage', technology: 'Google Cloud Storage' },
  '@azure/storage-blob': { type: 'storage', technology: 'Azure Blob Storage' },

  // Auth
  '@auth0/auth0-spa-js': { type: 'auth', technology: 'Auth0' },
  'passport': { type: 'auth', technology: 'Passport.js' },
  'jsonwebtoken': { type: 'auth', technology: 'JWT' },
  '@clerk/clerk-sdk-node': { type: 'auth', technology: 'Clerk' },

  // Monitoring
  '@sentry/node': { type: 'monitoring', technology: 'Sentry' },
  'newrelic': { type: 'monitoring', technology: 'New Relic' },
  '@datadog/dd-trace': { type: 'monitoring', technology: 'Datadog' },
  'pino': { type: 'monitoring', technology: 'Pino Logger' },
  'winston': { type: 'monitoring', technology: 'Winston Logger' },

  // APIs
  'axios': { type: 'api', technology: 'HTTP Client' },
  'node-fetch': { type: 'api', technology: 'HTTP Client' },
  'got': { type: 'api', technology: 'HTTP Client' },
  '@anthropic-ai/sdk': { type: 'api', technology: 'Anthropic API' },
  'openai': { type: 'api', technology: 'OpenAI API' },
  'stripe': { type: 'api', technology: 'Stripe API' },
  'twilio': { type: 'api', technology: 'Twilio API' },
};

/**
 * Codebase Analyzer
 *
 * Provides automated codebase analysis for SFDIPOT assessment.
 */
export class CodebaseAnalyzer {
  private config: CodebaseAnalyzerConfig;

  constructor(config: CodebaseAnalyzerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a codebase and return structured results
   */
  async analyze(): Promise<CodeIntelligenceResult> {
    const startTime = Date.now();
    const result: CodeIntelligenceResult = {
      externalSystems: [],
      components: [],
      relationships: [],
      couplingAnalysis: [],
      c4Diagrams: {},
      metadata: {
        filesAnalyzed: 0,
        componentsDetected: 0,
        externalSystemsDetected: 0,
        analysisTimeMs: 0,
      },
    };

    try {
      // Phase 1: Detect external systems from package.json
      if (this.config.detectExternalSystems) {
        console.log('[CodebaseAnalyzer] Phase 1: Detecting external systems...');
        result.externalSystems = await this.detectExternalSystems();
        result.metadata.externalSystemsDetected = result.externalSystems.length;
      }

      // Phase 2: Analyze component boundaries
      if (this.config.analyzeComponents) {
        console.log('[CodebaseAnalyzer] Phase 2: Analyzing components...');
        const componentResult = await this.analyzeComponents();
        result.components = componentResult.components;
        result.relationships = componentResult.relationships;
        result.metadata.componentsDetected = result.components.length;
      }

      // Phase 3: Analyze module coupling
      if (this.config.analyzeCoupling && result.components.length > 0) {
        console.log('[CodebaseAnalyzer] Phase 3: Analyzing coupling...');
        result.couplingAnalysis = this.analyzeCoupling(result.components, result.relationships);
      }

      // Generate C4 diagrams
      if (this.config.generateC4Diagrams) {
        console.log('[CodebaseAnalyzer] Generating C4 diagrams...');
        result.c4Diagrams = await this.generateC4Diagrams(result);
      }

      result.metadata.analysisTimeMs = Date.now() - startTime;
      console.log(`[CodebaseAnalyzer] Analysis complete in ${result.metadata.analysisTimeMs}ms`);

    } catch (error) {
      console.error('[CodebaseAnalyzer] Analysis failed:', error);
      result.metadata.analysisTimeMs = Date.now() - startTime;
    }

    return result;
  }

  // ===========================================================================
  // Phase 1: External System Detection
  // ===========================================================================

  /**
   * Detect external systems from package.json dependencies
   */
  private async detectExternalSystems(): Promise<DetectedExternalSystem[]> {
    const systems: DetectedExternalSystem[] = [];

    try {
      const packageJsonPath = path.join(this.config.rootDir, 'package.json');

      // Check if package.json exists
      try {
        await fs.access(packageJsonPath);
      } catch {
        console.log('[CodebaseAnalyzer] No package.json found, skipping external system detection');
        return systems;
      }

      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = safeJsonParse(content);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const [depName, _version] of Object.entries(allDeps)) {
        const pattern = EXTERNAL_SYSTEM_PATTERNS[depName];
        if (pattern) {
          systems.push({
            id: depName.replace(/[^a-zA-Z0-9]/g, '-'),
            name: pattern.technology,
            type: pattern.type,
            technology: pattern.technology,
            detectedFrom: 'package.json',
            relationship: 'uses',
          });
        }
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] External system detection failed:', error);
    }

    return systems;
  }

  // ===========================================================================
  // Phase 2: Component Analysis
  // ===========================================================================

  /**
   * Analyze component boundaries in the codebase
   */
  private async analyzeComponents(): Promise<{
    components: DetectedComponent[];
    relationships: DetectedRelationship[];
  }> {
    const components: DetectedComponent[] = [];
    const relationships: DetectedRelationship[] = [];

    try {
      const srcDir = path.join(this.config.rootDir, 'src');

      // Check if src directory exists
      let analyzeDir = this.config.rootDir;
      try {
        await fs.access(srcDir);
        analyzeDir = srcDir;
      } catch {
        console.log('[CodebaseAnalyzer] No src directory, analyzing root');
      }

      // Get top-level directories as components
      const entries = await fs.readdir(analyzeDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldExclude(entry.name)) {
          const componentPath = path.join(analyzeDir, entry.name);
          const files = await this.getFilesInDirectory(componentPath);

          if (files.length > 0) {
            components.push({
              id: entry.name,
              name: this.formatComponentName(entry.name),
              type: this.inferComponentType(entry.name),
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

          // Infer relationships based on common patterns
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
      console.error('[CodebaseAnalyzer] Component analysis failed:', error);
    }

    return { components, relationships };
  }

  private shouldExclude(name: string): boolean {
    const excludeNames = ['node_modules', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'];
    return excludeNames.includes(name) || name.startsWith('.');
  }

  private async getFilesInDirectory(dir: string, maxDepth = 3): Promise<string[]> {
    const files: string[] = [];

    const scan = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (this.shouldExclude(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(this.config.rootDir, fullPath);

          if (entry.isDirectory()) {
            await scan(fullPath, depth + 1);
          } else if (entry.isFile() && this.isSourceFile(entry.name)) {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Non-critical: permission errors when scanning directories
        console.debug('[CodebaseAnalyzer] Directory scan error:', error instanceof Error ? error.message : error);
      }
    };

    await scan(dir, 0);
    return files;
  }

  private isSourceFile(name: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
    return extensions.some(ext => name.endsWith(ext)) && !name.endsWith('.d.ts');
  }

  private formatComponentName(name: string): string {
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private inferComponentType(name: string): DetectedComponent['type'] {
    const lower = name.toLowerCase();
    if (lower.includes('service') || lower.includes('api')) return 'layer';
    if (lower.includes('controller') || lower.includes('handler')) return 'layer';
    if (lower.includes('model') || lower.includes('entity')) return 'module';
    if (lower.includes('util') || lower.includes('helper')) return 'module';
    if (lower.includes('domain')) return 'feature';
    if (lower.includes('infra')) return 'layer';
    if (lower.includes('package') || lower.includes('pkg')) return 'package';
    return 'module';
  }

  private inferBoundary(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('api') || lower.includes('controller')) return 'API Layer';
    if (lower.includes('service')) return 'Service Layer';
    if (lower.includes('domain')) return 'Domain Layer';
    if (lower.includes('infra') || lower.includes('database')) return 'Infrastructure Layer';
    if (lower.includes('ui') || lower.includes('component')) return 'Presentation Layer';
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
    // Common relationship patterns
    const patterns = [
      ['service', 'model'],
      ['service', 'repository'],
      ['controller', 'service'],
      ['api', 'service'],
      ['domain', 'infra'],
    ];

    const lowerA = idA.toLowerCase();
    const lowerB = idB.toLowerCase();

    return patterns.some(([a, b]) =>
      (lowerA.includes(a) && lowerB.includes(b)) ||
      (lowerA.includes(b) && lowerB.includes(a))
    );
  }

  // ===========================================================================
  // Phase 3: Coupling Analysis
  // ===========================================================================

  /**
   * Analyze module coupling for risk prioritization
   */
  private analyzeCoupling(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): ModuleCouplingInfo[] {
    const couplingInfo: ModuleCouplingInfo[] = [];

    try {
      if (components.length < 2) {
        return couplingInfo;
      }

      // Detect circular dependencies (A -> B and B -> A)
      const circularPairs = new Set<string>();
      for (const rel of relationships) {
        const reverseExists = relationships.some(
          r => r.sourceId === rel.targetId && r.targetId === rel.sourceId
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

          // Count relationships between them
          const relsBetween = relationships.filter(
            r => (r.sourceId === compA.id && r.targetId === compB.id) ||
                 (r.sourceId === compB.id && r.targetId === compA.id)
          );

          if (relsBetween.length > 0) {
            const totalWeight = relsBetween.reduce((sum, r) => sum + (r.weight || 1), 0);
            const couplingStrength = Math.min(1, totalWeight / 10);

            const pairKey = [compA.id, compB.id].sort().join('::');
            const isCircular = circularPairs.has(pairKey);

            couplingInfo.push({
              moduleA: compA.name,
              moduleB: compB.name,
              couplingStrength,
              isCircular,
              recommendation: this.getCouplingRecommendation(couplingStrength, isCircular),
            });
          }
        }
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] Coupling analysis failed:', error);
    }

    return couplingInfo;
  }

  /**
   * Get recommendation based on coupling strength
   */
  private getCouplingRecommendation(strength: number, isCircular: boolean): string {
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

  // ===========================================================================
  // C4 Diagram Generation
  // ===========================================================================

  /**
   * Generate C4 architecture diagrams in Mermaid format
   */
  private async generateC4Diagrams(result: CodeIntelligenceResult): Promise<C4Diagrams> {
    const diagrams: C4Diagrams = {};

    try {
      const projectMetadata = await this.getProjectMetadata();

      // C4 Context Diagram
      diagrams.context = this.generateContextDiagram(projectMetadata, result.externalSystems);

      // C4 Container Diagram
      diagrams.container = this.generateContainerDiagram(projectMetadata, result.externalSystems);

      // C4 Component Diagram
      if (result.components.length > 0) {
        diagrams.component = this.generateComponentDiagram(projectMetadata.name, result.components, result.relationships);
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] C4 diagram generation failed:', error);
    }

    return diagrams;
  }

  private generateContextDiagram(
    project: { name: string; description: string },
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

  private generateContainerDiagram(
    project: { name: string; description: string },
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

  private generateComponentDiagram(
    projectName: string,
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string {
    let mermaid = `C4Component
  title Component diagram for ${projectName}

  Container_Boundary(app, "Application") {
`;

    for (const comp of components) {
      mermaid += `    Component(${comp.id}, "${comp.name}", "${comp.technology}", "${comp.responsibilities?.[0] || ''}")
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

  /**
   * Get project metadata from package.json
   */
  private async getProjectMetadata(): Promise<{ name: string; description: string }> {
    try {
      const packageJsonPath = path.join(this.config.rootDir, 'package.json');
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

  // ===========================================================================
  // Test Idea Generation from Code Intelligence
  // ===========================================================================

  /**
   * Generate test ideas from detected external systems (PLATFORM category)
   */
  generatePlatformTestIdeas(externalSystems: DetectedExternalSystem[]): TestIdea[] {
    const ideas: TestIdea[] = [];

    for (const system of externalSystems) {
      // Connection test
      ideas.push({
        id: generateTestId(HTSMCategory.PLATFORM),
        category: HTSMCategory.PLATFORM,
        subcategory: 'ExternalSoftware',
        description: `Test ${system.technology} connection handling (connect, disconnect, reconnect)`,
        priority: Priority.P1,
        automationFitness: AutomationFitness.Integration,
        tags: ['platform', 'integration', system.type, system.technology.toLowerCase()],
        rationale: `Auto-detected ${system.technology} dependency from ${system.detectedFrom}`,
      });

      // Error handling test
      ideas.push({
        id: generateTestId(HTSMCategory.PLATFORM),
        category: HTSMCategory.PLATFORM,
        subcategory: 'ExternalSoftware',
        description: `Test ${system.technology} unavailability handling (timeout, connection refused)`,
        priority: Priority.P0,
        automationFitness: AutomationFitness.Integration,
        tags: ['platform', 'resilience', 'error-handling', system.technology.toLowerCase()],
        rationale: `Critical: System must handle ${system.technology} failures gracefully`,
      });

      // Type-specific tests
      const typeSpecificIdeas = this.getTypeSpecificTestIdeas(system);
      ideas.push(...typeSpecificIdeas);
    }

    return ideas;
  }

  /**
   * Get type-specific test ideas for an external system
   */
  private getTypeSpecificTestIdeas(system: DetectedExternalSystem): TestIdea[] {
    const ideas: TestIdea[] = [];

    switch (system.type) {
      case 'database':
        ideas.push({
          id: generateTestId(HTSMCategory.DATA),
          category: HTSMCategory.DATA,
          subcategory: 'Persistence',
          description: `Test ${system.technology} transaction isolation and rollback`,
          priority: Priority.P0,
          automationFitness: AutomationFitness.Integration,
          tags: ['database', 'transactions', system.technology.toLowerCase()],
          rationale: `Database integrity is critical for ${system.technology}`,
        });
        ideas.push({
          id: generateTestId(HTSMCategory.TIME),
          category: HTSMCategory.TIME,
          subcategory: 'Concurrency',
          description: `Test ${system.technology} concurrent access and locking`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Concurrency,
          tags: ['database', 'concurrency', system.technology.toLowerCase()],
          rationale: 'Concurrent database access can cause race conditions',
        });
        break;

      case 'cache':
        ideas.push({
          id: generateTestId(HTSMCategory.TIME),
          category: HTSMCategory.TIME,
          subcategory: 'Timing',
          description: `Test ${system.technology} cache TTL expiration behavior`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['cache', 'ttl', system.technology.toLowerCase()],
          rationale: 'Cache expiration affects data freshness',
        });
        ideas.push({
          id: generateTestId(HTSMCategory.DATA),
          category: HTSMCategory.DATA,
          subcategory: 'Lifecycle',
          description: `Test ${system.technology} cache invalidation on data updates`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['cache', 'invalidation', system.technology.toLowerCase()],
          rationale: 'Stale cache data causes consistency issues',
        });
        break;

      case 'queue':
        ideas.push({
          id: generateTestId(HTSMCategory.TIME),
          category: HTSMCategory.TIME,
          subcategory: 'Sequencing',
          description: `Test ${system.technology} message ordering guarantees`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['queue', 'ordering', system.technology.toLowerCase()],
          rationale: 'Message order may be critical for processing',
        });
        ideas.push({
          id: generateTestId(HTSMCategory.FUNCTION),
          category: HTSMCategory.FUNCTION,
          subcategory: 'ErrorHandling',
          description: `Test ${system.technology} dead letter queue handling`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['queue', 'dlq', 'error-handling', system.technology.toLowerCase()],
          rationale: 'Failed messages must not be lost',
        });
        break;

      case 'api':
        ideas.push({
          id: generateTestId(HTSMCategory.INTERFACES),
          category: HTSMCategory.INTERFACES,
          subcategory: 'ApiSdk',
          description: `Test ${system.technology} API rate limiting handling`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['api', 'rate-limiting', system.technology.toLowerCase()],
          rationale: 'External APIs enforce rate limits',
        });
        ideas.push({
          id: generateTestId(HTSMCategory.FUNCTION),
          category: HTSMCategory.FUNCTION,
          subcategory: 'Security',
          description: `Test ${system.technology} API authentication token refresh`,
          priority: Priority.P0,
          automationFitness: AutomationFitness.Security,
          tags: ['api', 'auth', 'security', system.technology.toLowerCase()],
          rationale: 'API tokens expire and must be refreshed',
        });
        break;
    }

    return ideas;
  }

  /**
   * Generate test ideas from component analysis (STRUCTURE/INTERFACES)
   */
  generateStructureTestIdeas(components: DetectedComponent[]): TestIdea[] {
    const ideas: TestIdea[] = [];

    for (const component of components) {
      // Component integration test
      if (component.type === 'module' || component.type === 'layer') {
        ideas.push({
          id: generateTestId(HTSMCategory.STRUCTURE),
          category: HTSMCategory.STRUCTURE,
          subcategory: 'Dependencies',
          description: `Test ${component.name} module integration with its dependencies`,
          priority: Priority.P2,
          automationFitness: AutomationFitness.Integration,
          tags: ['structure', 'module', 'integration', component.name.toLowerCase()],
          rationale: `Auto-detected ${component.type}: ${component.name}`,
        });
      }

      // Interface tests based on boundary
      if (component.boundary?.toLowerCase().includes('api') ||
          component.boundary?.toLowerCase().includes('controller')) {
        ideas.push({
          id: generateTestId(HTSMCategory.INTERFACES),
          category: HTSMCategory.INTERFACES,
          subcategory: 'ApiSdk',
          description: `Test ${component.name} API contract compliance`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.API,
          tags: ['api', 'contract', component.name.toLowerCase()],
          rationale: `Component ${component.name} is in API layer`,
        });
      }
    }

    return ideas;
  }

  /**
   * Generate test ideas from coupling analysis
   */
  generateCouplingTestIdeas(couplingInfo: ModuleCouplingInfo[]): TestIdea[] {
    const ideas: TestIdea[] = [];

    for (const coupling of couplingInfo) {
      if (coupling.isCircular) {
        ideas.push({
          id: generateTestId(HTSMCategory.STRUCTURE),
          category: HTSMCategory.STRUCTURE,
          subcategory: 'Dependencies',
          description: `Test circular dependency between ${coupling.moduleA} and ${coupling.moduleB}`,
          priority: Priority.P0,
          automationFitness: AutomationFitness.Integration,
          tags: ['structure', 'circular-dependency', 'high-risk'],
          rationale: coupling.recommendation,
        });
      } else if (coupling.couplingStrength > 0.7) {
        ideas.push({
          id: generateTestId(HTSMCategory.STRUCTURE),
          category: HTSMCategory.STRUCTURE,
          subcategory: 'Dependencies',
          description: `Test tight coupling between ${coupling.moduleA} and ${coupling.moduleB}`,
          priority: Priority.P1,
          automationFitness: AutomationFitness.Integration,
          tags: ['structure', 'high-coupling', 'refactoring-candidate'],
          rationale: coupling.recommendation,
        });
      }
    }

    return ideas;
  }
}
