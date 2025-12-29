/**
 * Codebase Analyzer for Product Factors Assessor
 *
 * Integrates with the Code Intelligence module to provide automated
 * codebase analysis for SFDIPOT assessment.
 *
 * Phases:
 * - Phase 1: ExternalSystemDetector for PLATFORM category
 * - Phase 2: ComponentBoundaryAnalyzer for STRUCTURE/INTERFACES
 * - Phase 3: Relationship-based coupling analysis with circular dependency detection
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
} from '../types';

// Import code intelligence components
import { ExternalSystemDetector } from '../../../code-intelligence/inference/ExternalSystemDetector';
import { ComponentBoundaryAnalyzer } from '../../../code-intelligence/inference/ComponentBoundaryAnalyzer';
import { C4ContextDiagramBuilder } from '../../../code-intelligence/visualization/C4ContextDiagramBuilder';
import { C4ContainerDiagramBuilder } from '../../../code-intelligence/visualization/C4ContainerDiagramBuilder';
import { C4ComponentDiagramBuilder } from '../../../code-intelligence/visualization/C4ComponentDiagramBuilder';

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

/**
 * Codebase Analyzer
 *
 * Provides automated codebase analysis by integrating with
 * the Code Intelligence module.
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
        result.couplingAnalysis = await this.analyzeCoupling(result.components, result.relationships);
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

      // ExternalSystemDetector takes rootDir in constructor
      const detector = new ExternalSystemDetector(this.config.rootDir);
      const detected = await detector.detect();

      // Map to our DetectedExternalSystem type
      for (const system of detected) {
        systems.push({
          id: system.id,
          name: system.name,
          type: this.mapExternalSystemType(system.type),
          technology: system.technology || system.name,
          detectedFrom: 'package.json',
          relationship: system.relationship as DetectedExternalSystem['relationship'],
        });
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] External system detection failed:', error);
    }

    return systems;
  }

  /**
   * Map external system type to our enum
   */
  private mapExternalSystemType(
    type: string
  ): DetectedExternalSystem['type'] {
    const typeMap: Record<string, DetectedExternalSystem['type']> = {
      database: 'database',
      cache: 'cache',
      queue: 'queue',
      api: 'api',
      storage: 'storage',
      auth: 'auth',
      monitoring: 'monitoring',
    };
    return typeMap[type] || 'api';
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
      try {
        await fs.access(srcDir);
      } catch {
        // Fall back to root dir
        console.log('[CodebaseAnalyzer] No src directory, analyzing root');
      }

      const analyzer = new ComponentBoundaryAnalyzer(this.config.rootDir, {
        excludePatterns: this.config.excludePatterns,
        analyzeImports: true,
        minFilesPerComponent: 2,
        maxDepth: 5,
      });

      const result = await analyzer.analyze();

      // Map components
      for (const comp of result.components) {
        components.push({
          id: comp.id,
          name: comp.name,
          type: comp.type as DetectedComponent['type'],
          boundary: comp.boundary,
          technology: comp.technology,
          files: comp.files,
          responsibilities: comp.responsibilities,
        });
      }

      // Map relationships
      for (const rel of result.relationships) {
        relationships.push({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type as DetectedRelationship['type'],
          weight: rel.count,
        });
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] Component analysis failed:', error);
    }

    return { components, relationships };
  }

  // ===========================================================================
  // Phase 3: Coupling Analysis
  // ===========================================================================

  /**
   * Analyze module coupling for risk prioritization
   *
   * Uses a simplified relationship-based analysis that detects:
   * - Coupling strength between component pairs
   * - Circular dependencies (bidirectional relationships)
   */
  private async analyzeCoupling(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): Promise<ModuleCouplingInfo[]> {
    const couplingInfo: ModuleCouplingInfo[] = [];

    try {
      if (components.length < 2) {
        return couplingInfo;
      }

      // Build component lookup
      const componentMap = new Map(components.map(c => [c.id, c]));

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
      const componentList = Array.from(components);
      for (let i = 0; i < componentList.length; i++) {
        for (let j = i + 1; j < componentList.length; j++) {
          const compA = componentList[i];
          const compB = componentList[j];

          // Count relationships between them
          const relsBetween = relationships.filter(
            r => (r.sourceId === compA.id && r.targetId === compB.id) ||
                 (r.sourceId === compB.id && r.targetId === compA.id)
          );

          if (relsBetween.length > 0) {
            const totalWeight = relsBetween.reduce((sum, r) => sum + (r.weight || 1), 0);
            const couplingStrength = Math.min(1, totalWeight / 10); // Normalize

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
   * Generate C4 architecture diagrams
   */
  private async generateC4Diagrams(
    result: CodeIntelligenceResult
  ): Promise<C4Diagrams> {
    const diagrams: C4Diagrams = {};

    try {
      // Get project metadata from package.json
      const projectMetadata = await this.getProjectMetadata();

      // Map external systems to expected format
      const externalSystems = result.externalSystems.map(sys => ({
        id: sys.id,
        name: sys.name,
        type: sys.type as any,
        technology: sys.technology,
        relationship: sys.relationship,
        description: `${sys.type}: ${sys.technology}`,
      }));

      // C4 Context Diagram - cast to any for minimal ProjectMetadata compatibility
      const contextBuilder = new C4ContextDiagramBuilder();
      diagrams.context = contextBuilder.build(projectMetadata as any, externalSystems);

      // C4 Container Diagram - cast to any for minimal ProjectMetadata compatibility
      const containerBuilder = new C4ContainerDiagramBuilder();
      diagrams.container = containerBuilder.build(projectMetadata as any, externalSystems);

      // C4 Component Diagram
      if (result.components.length > 0) {
        const componentBuilder = new C4ComponentDiagramBuilder();
        diagrams.component = componentBuilder.build(
          projectMetadata.name,
          result.components.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            description: c.responsibilities?.[0],
            technology: c.technology,
            files: c.files,
            boundary: c.boundary,
          })),
          result.relationships.map(r => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.type as any,
            count: r.weight,
          }))
        );
      }
    } catch (error) {
      console.error('[CodebaseAnalyzer] C4 diagram generation failed:', error);
    }

    return diagrams;
  }

  /**
   * Get project metadata from package.json
   * Returns a minimal ProjectMetadata-compatible object for C4 diagram generation
   */
  private async getProjectMetadata(): Promise<{ name: string; description: string }> {
    try {
      const packageJsonPath = path.join(this.config.rootDir, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
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

  /**
   * Infer containers from components
   */
  private inferContainers(
    components: DetectedComponent[],
    externalSystems: DetectedExternalSystem[]
  ): any[] {
    const containers: any[] = [];

    // Group components by boundary
    const boundaries = new Map<string, DetectedComponent[]>();
    for (const comp of components) {
      const boundary = comp.boundary || 'Core';
      if (!boundaries.has(boundary)) {
        boundaries.set(boundary, []);
      }
      boundaries.get(boundary)!.push(comp);
    }

    // Create containers for each boundary
    for (const [boundary, comps] of Array.from(boundaries.entries())) {
      containers.push({
        id: boundary.toLowerCase().replace(/\s+/g, '-'),
        name: boundary,
        type: this.inferContainerType(boundary),
        technology: comps[0]?.technology || 'TypeScript',
        description: `${boundary} layer containing ${comps.length} components`,
      });
    }

    return containers;
  }

  /**
   * Infer container type from boundary name
   */
  private inferContainerType(boundary: string): string {
    const lower = boundary.toLowerCase();
    if (lower.includes('api') || lower.includes('controller')) return 'application';
    if (lower.includes('data') || lower.includes('repository')) return 'database';
    if (lower.includes('service')) return 'service';
    if (lower.includes('ui') || lower.includes('presentation')) return 'application';
    return 'application';
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
        description: `Verify ${system.technology} connection handling (connect, disconnect, reconnect)`,
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
