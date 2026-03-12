/**
 * YAML Pipeline Registry (Imp-9)
 *
 * Scans a directory for YAML pipeline files, loads them via
 * YamlPipelineLoader, and registers them with the WorkflowOrchestrator.
 *
 * Supports dynamic registration from raw YAML strings, and de-registration
 * of pipelines removed from disk.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  Result,
  ok,
  err,
} from '../shared/types/index.js';
import type {
  WorkflowDefinition,
  IWorkflowOrchestrator,
} from './workflow-types.js';
import { YamlPipelineLoader } from './yaml-pipeline-loader.js';

// ============================================================================
// Constants
// ============================================================================

/** Default directory for pipeline YAML files */
export const DEFAULT_PIPELINES_DIR = '.agentic-qe/pipelines';

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

// ============================================================================
// Types
// ============================================================================

export interface PipelineLoadResult {
  /** IDs of successfully loaded pipelines */
  loaded: string[];
  /** Errors encountered during loading */
  errors: Array<{ file: string; error: string }>;
}

// ============================================================================
// YAML Pipeline Registry
// ============================================================================

export class YamlPipelineRegistry {
  private readonly loader: YamlPipelineLoader;
  /** Tracks which pipeline IDs were loaded from which files */
  private readonly fileToPipelineId: Map<string, string> = new Map();

  constructor(loader?: YamlPipelineLoader) {
    this.loader = loader ?? new YamlPipelineLoader();
  }

  /**
   * Scan a directory for *.yaml / *.yml files and register all pipelines
   * with the given orchestrator. De-registers pipelines whose files
   * have been removed since the last scan.
   *
   * @param orchestrator - The workflow orchestrator to register pipelines with
   * @param directory - Directory to scan (default: `.agentic-qe/pipelines/`)
   * @param vars - Optional variables for interpolation
   */
  async loadAllPipelines(
    orchestrator: IWorkflowOrchestrator,
    directory?: string,
    vars?: Record<string, unknown>,
  ): Promise<PipelineLoadResult> {
    const dir = directory ?? DEFAULT_PIPELINES_DIR;
    const result: PipelineLoadResult = { loaded: [], errors: [] };

    // Check if directory exists
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => e.isFile() && YAML_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .map((e) => e.name);
    } catch (error) {
      // Directory doesn't exist — not an error, just nothing to load
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // De-register any previously loaded pipelines since dir is gone
        this.deregisterRemovedPipelines(orchestrator, new Set());
        return result;
      }
      result.errors.push({
        file: dir,
        error: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
      });
      return result;
    }

    const currentFiles = new Set<string>();

    for (const fileName of entries) {
      const filePath = path.join(dir, fileName);
      currentFiles.add(filePath);

      try {
        const loadResult = await this.loader.loadFromFile(filePath, vars);

        if (!loadResult.success) {
          result.errors.push({ file: fileName, error: loadResult.error.message });
          continue;
        }

        const definition = loadResult.value;
        const registerResult = orchestrator.registerWorkflow(definition);

        if (!registerResult.success) {
          result.errors.push({ file: fileName, error: registerResult.error.message });
          continue;
        }

        this.fileToPipelineId.set(filePath, definition.id);
        result.loaded.push(definition.id);
      } catch (error) {
        result.errors.push({
          file: fileName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // De-register pipelines whose files no longer exist
    this.deregisterRemovedPipelines(orchestrator, currentFiles);

    return result;
  }

  /**
   * Register a single pipeline from a raw YAML string.
   *
   * @param orchestrator - The workflow orchestrator to register the pipeline with
   * @param yaml - Raw YAML content
   * @param vars - Optional variables for interpolation
   */
  registerPipeline(
    orchestrator: IWorkflowOrchestrator,
    yaml: string,
    vars?: Record<string, unknown>,
  ): Result<WorkflowDefinition, Error> {
    const parseResult = this.loader.parse(yaml, vars);
    if (!parseResult.success) return parseResult;

    const definition = parseResult.value;
    const registerResult = orchestrator.registerWorkflow(definition);

    if (!registerResult.success) {
      return err(registerResult.error);
    }

    return ok(definition);
  }

  /**
   * Get the loader instance (useful for validation-only operations).
   */
  getLoader(): YamlPipelineLoader {
    return this.loader;
  }

  /**
   * Get the mapping of files to pipeline IDs.
   */
  getLoadedPipelines(): ReadonlyMap<string, string> {
    return this.fileToPipelineId;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * De-register any pipelines whose source files are no longer present
   * in the current set of files on disk.
   */
  private deregisterRemovedPipelines(
    orchestrator: IWorkflowOrchestrator,
    currentFiles: Set<string>,
  ): void {
    const toRemove: string[] = [];

    for (const [filePath, pipelineId] of this.fileToPipelineId) {
      if (!currentFiles.has(filePath)) {
        orchestrator.unregisterWorkflow(pipelineId);
        toRemove.push(filePath);
      }
    }

    for (const filePath of toRemove) {
      this.fileToPipelineId.delete(filePath);
    }
  }
}
