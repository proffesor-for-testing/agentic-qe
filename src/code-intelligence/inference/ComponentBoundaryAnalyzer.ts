/**
 * Component Boundary Analyzer for C4 Model Integration
 *
 * Detects logical component boundaries within a codebase for C4 Component diagrams.
 * Analyzes directory structure, file organization, and import patterns to identify
 * components and their relationships.
 *
 * Supports detection of:
 * - Layered architecture (presentation, business, data layers)
 * - Modular architecture (domain modules)
 * - Feature-based architecture (vertical slices)
 * - Package-based organization
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import fg from 'fast-glob';
import type {
  Component,
  ComponentRelationship,
  ComponentAnalysisResult,
  ComponentBoundaryConfig,
} from './types';

const DEFAULT_CONFIG: ComponentBoundaryConfig = {
  rootDir: './src',
  minFilesPerComponent: 2,
  analyzeImports: true,
  excludePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**', '**/__mocks__/**'],
  maxDepth: 5,
};

/**
 * Layer patterns for detecting layered architecture
 */
interface LayerPattern {
  name: string;
  type: 'presentation' | 'business' | 'data' | 'infrastructure' | 'core' | 'utility';
  patterns: string[];
  responsibilities: string[];
}

const LAYER_PATTERNS: LayerPattern[] = [
  {
    name: 'Presentation',
    type: 'presentation',
    patterns: ['controllers', 'routes', 'handlers', 'views', 'pages', 'ui', 'api', 'cli', 'commands'],
    responsibilities: ['Handle HTTP requests', 'Manage user interface', 'Process API calls', 'Execute CLI commands'],
  },
  {
    name: 'Business Logic',
    type: 'business',
    patterns: ['services', 'domain', 'use-cases', 'usecases', 'business', 'logic', 'core', 'agents'],
    responsibilities: ['Implement business rules', 'Coordinate operations', 'Process domain logic', 'Manage workflows'],
  },
  {
    name: 'Data Access',
    type: 'data',
    patterns: ['repositories', 'models', 'entities', 'database', 'db', 'storage', 'dao', 'persistence'],
    responsibilities: ['Access database', 'Manage data persistence', 'Query data stores', 'Handle data models'],
  },
  {
    name: 'Infrastructure',
    type: 'infrastructure',
    patterns: ['mcp', 'providers', 'adapters', 'integrations', 'external', 'clients'],
    responsibilities: ['External integrations', 'Third-party services', 'Infrastructure concerns', 'Service adapters'],
  },
  {
    name: 'Core',
    type: 'core',
    patterns: ['core', 'shared', 'common'],
    responsibilities: ['Shared functionality', 'Common utilities', 'Core abstractions', 'Base classes'],
  },
  {
    name: 'Utilities',
    type: 'utility',
    patterns: ['utils', 'helpers', 'lib', 'tools'],
    responsibilities: ['Helper functions', 'Utility methods', 'Support tools', 'Common helpers'],
  },
];

/**
 * Component Boundary Analyzer
 *
 * Analyzes codebase structure to identify component boundaries
 * for C4 Component diagrams.
 */
export class ComponentBoundaryAnalyzer {
  private config: ComponentBoundaryConfig;
  private componentIdCounter = 0;
  private relationshipIdCounter = 0;

  constructor(
    rootDir: string,
    config: Partial<ComponentBoundaryConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      rootDir,
    };
  }

  /**
   * Analyze codebase to detect component boundaries.
   */
  async analyze(): Promise<ComponentAnalysisResult> {
    const startTime = Date.now();

    // Step 1: Detect components based on directory structure
    const components = await this.detectComponents();

    // Step 2: Analyze relationships between components
    const relationships = this.config.analyzeImports
      ? await this.analyzeRelationships(components)
      : [];

    const analysisTime = Date.now() - startTime;

    console.log(`[ComponentBoundaryAnalyzer] Analysis complete in ${analysisTime}ms`);
    console.log(`[ComponentBoundaryAnalyzer] Found ${components.length} components, ${relationships.length} relationships`);

    return {
      components,
      relationships,
      metadata: {
        timestamp: Date.now(),
        durationMs: analysisTime,
        filesAnalyzed: components.reduce((sum, c) => sum + c.files.length, 0),
        containersDetected: 0,
        layersDetected: components.filter(c => c.type === 'layer').length,
      },
    };
  }

  /**
   * Detect components based on directory structure.
   */
  private async detectComponents(): Promise<Component[]> {
    const components: Component[] = [];

    // Get all source files
    const files = await this.getSourceFiles();

    // Group files by directory
    const filesByDir = this.groupFilesByDirectory(files);

    // Analyze each directory as potential component
    for (const [dir, dirFiles] of filesByDir.entries()) {
      if (dirFiles.length < this.config.minFilesPerComponent) {
        continue;
      }

      const component = this.createComponentFromDirectory(dir, dirFiles);
      if (component) {
        components.push(component);
      }
    }

    // Sort components by type and name
    components.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.name.localeCompare(b.name);
    });

    return components;
  }

  /**
   * Get all source files excluding test files and node_modules.
   */
  private async getSourceFiles(): Promise<string[]> {
    const patterns = [
      `${this.config.rootDir}/**/*.ts`,
      `${this.config.rootDir}/**/*.tsx`,
      `${this.config.rootDir}/**/*.js`,
      `${this.config.rootDir}/**/*.jsx`,
      `${this.config.rootDir}/**/*.py`,
      `${this.config.rootDir}/**/*.go`,
      `${this.config.rootDir}/**/*.rs`,
    ];

    const files = await fg(patterns, {
      ignore: this.config.excludePatterns,
      absolute: true,
      onlyFiles: true,
    });

    return files;
  }

  /**
   * Group files by their parent directory.
   */
  private groupFilesByDirectory(files: string[]): Map<string, string[]> {
    const filesByDir = new Map<string, string[]>();

    for (const file of files) {
      const dir = path.dirname(file);

      // Only consider directories at appropriate depth
      const relativePath = path.relative(this.config.rootDir, dir);
      const depth = relativePath.split(path.sep).length;

      if (depth > this.config.maxDepth) {
        continue;
      }

      const existing = filesByDir.get(dir) || [];
      existing.push(file);
      filesByDir.set(dir, existing);
    }

    return filesByDir;
  }

  /**
   * Create a component from a directory and its files.
   */
  private createComponentFromDirectory(
    dir: string,
    files: string[]
  ): Component | null {
    const relativePath = path.relative(this.config.rootDir, dir);
    const dirName = path.basename(dir);

    // Skip root directory
    if (relativePath === '' || relativePath === '.') {
      return null;
    }

    // Detect component type and metadata
    const layerInfo = this.detectLayerType(dirName, relativePath);

    const componentId = this.generateComponentId();
    const componentName = this.formatComponentName(dirName);

    const component: Component = {
      id: componentId,
      name: componentName,
      type: layerInfo.type,
      description: layerInfo.description,
      technology: this.detectTechnology(files),
      files: files.map(f => path.relative(this.config.rootDir, f)),
      responsibilities: layerInfo.responsibilities,
    };

    return component;
  }

  /**
   * Detect layer type from directory name and path.
   */
  private detectLayerType(
    dirName: string,
    relativePath: string
  ): { type: Component['type']; description?: string; responsibilities: string[] } {
    const lowerDirName = dirName.toLowerCase();
    const lowerPath = relativePath.toLowerCase();

    // Check against layer patterns
    for (const layer of LAYER_PATTERNS) {
      for (const pattern of layer.patterns) {
        if (lowerDirName === pattern || lowerDirName.includes(pattern) || lowerPath.includes(pattern)) {
          return {
            type: 'layer',
            description: `${layer.name} layer handling ${layer.responsibilities[0].toLowerCase()}`,
            responsibilities: layer.responsibilities,
          };
        }
      }
    }

    // Check for feature-based structure (e.g., src/features/user, src/domains/auth)
    if (lowerPath.includes('features') || lowerPath.includes('domains') || lowerPath.includes('modules')) {
      return {
        type: 'feature',
        description: `Feature module for ${dirName}`,
        responsibilities: [`Manage ${dirName} feature`, 'Handle related business logic'],
      };
    }

    // Default to module type
    return {
      type: 'module',
      description: `Module for ${dirName}`,
      responsibilities: [`Provide ${dirName} functionality`],
    };
  }

  /**
   * Detect primary technology from file extensions.
   */
  private detectTechnology(files: string[]): string {
    const extensions = files.map(f => path.extname(f));
    const counts = new Map<string, number>();

    for (const ext of extensions) {
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }

    // Find most common extension
    let maxExt = '.ts';
    let maxCount = 0;

    for (const [ext, count] of counts.entries()) {
      if (count > maxCount) {
        maxExt = ext;
        maxCount = count;
      }
    }

    // Map extension to technology
    const techMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript/React',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript/React',
      '.py': 'Python',
      '.go': 'Go',
      '.rs': 'Rust',
    };

    return techMap[maxExt] || 'Unknown';
  }

  /**
   * Analyze relationships between components based on import patterns.
   */
  private async analyzeRelationships(
    components: Component[]
  ): Promise<ComponentRelationship[]> {
    const relationships: ComponentRelationship[] = [];
    const relationshipSet = new Set<string>(); // Prevent duplicates

    for (const sourceComponent of components) {
      for (const file of sourceComponent.files) {
        const filePath = path.join(this.config.rootDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const imports = this.extractImports(content);

          for (const importPath of imports) {
            const targetComponent = this.findComponentByImport(importPath, components, filePath);

            if (targetComponent && targetComponent.id !== sourceComponent.id) {
              const relationshipKey = `${sourceComponent.id}->${targetComponent.id}`;

              if (!relationshipSet.has(relationshipKey)) {
                relationships.push({
                  sourceId: sourceComponent.id,
                  targetId: targetComponent.id,
                  type: 'uses',
                  count: 1,
                });
                relationshipSet.add(relationshipKey);
              }
            }
          }
        } catch (error) {
          // Skip files that can't be read
          console.warn(`[ComponentBoundaryAnalyzer] Failed to read ${filePath}:`, error);
        }
      }
    }

    return relationships;
  }

  /**
   * Extract import paths from file content.
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];

    // Match ES6 imports
    const es6ImportRegex = /import\s+(?:[\w*\s{},]*)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Match CommonJS require
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Find component that contains the imported file.
   */
  private findComponentByImport(
    importPath: string,
    components: Component[],
    sourceFilePath: string
  ): Component | null {
    // Skip external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    // Resolve import path
    const sourceDir = path.dirname(sourceFilePath);
    const resolvedPath = path.resolve(sourceDir, importPath);
    const relativePath = path.relative(this.config.rootDir, resolvedPath);

    // Try with common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
    const candidates = [
      relativePath,
      ...extensions.map(ext => relativePath + ext),
      path.join(relativePath, 'index.ts'),
      path.join(relativePath, 'index.js'),
    ];

    // Find component containing any candidate path
    for (const component of components) {
      for (const candidate of candidates) {
        if (component.files.some((f: string) => f === candidate || f.startsWith(candidate + path.sep))) {
          return component;
        }
      }
    }

    return null;
  }


  /**
   * Generate unique component ID.
   */
  private generateComponentId(): string {
    return `component-${++this.componentIdCounter}`;
  }

  /**
   * Format directory name as component name.
   */
  private formatComponentName(dirName: string): string {
    // Convert kebab-case or snake_case to Title Case
    return dirName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
