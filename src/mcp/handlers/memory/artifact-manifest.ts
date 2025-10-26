/**
 * Artifact Manifest Handler
 *
 * Handles creation and management of artifact manifests for QE outputs.
 * Implements the artifact_manifest MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface ArtifactManifestParams {
  action: 'create' | 'get' | 'list' | 'update' | 'delete';
  manifestId?: string;
  artifacts?: Array<{
    type: string;
    path: string;
    metadata?: Record<string, any>;
  }>;
  updates?: Record<string, any>;
  filterBy?: Record<string, any>;
}

interface Artifact {
  type: string;
  path: string;
  metadata: Record<string, any>;
}

interface Manifest {
  manifestId: string;
  artifacts: Artifact[];
  createdAt: number;
  updatedAt: number;
  status: string;
  metadata: Record<string, any>;
}

/**
 * Handles artifact manifest operations for QE coordination
 */
export class ArtifactManifestHandler extends BaseHandler {
  private manifests: Map<string, Manifest>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor
  ) {
    super();
    this.manifests = new Map();
  }

  /**
   * Handle artifact manifest request
   */
  async handle(args: ArtifactManifestParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { action } = args;

      switch (action) {
        case 'create':
          return await this.createManifest(args, requestId);
        case 'get':
          return await this.getManifest(args, requestId);
        case 'list':
          return await this.listManifests(args, requestId);
        case 'update':
          return await this.updateManifest(args, requestId);
        case 'delete':
          return await this.deleteManifest(args, requestId);
        default:
          throw new Error(`Invalid action: ${action}`);
      }

    } catch (error) {
      this.log('error', 'Failed to execute artifact manifest operation', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Create artifact manifest
   */
  private async createManifest(args: ArtifactManifestParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['manifestId', 'artifacts']);

    const { manifestId, artifacts } = args;

    if (this.manifests.has(manifestId!)) {
      throw new Error(`Manifest already exists: ${manifestId}`);
    }

    const manifest: Manifest = {
      manifestId: manifestId!,
      artifacts: artifacts!.map(a => ({
        type: a.type,
        path: a.path,
        metadata: a.metadata || {}
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'created',
      metadata: {}
    };

    this.manifests.set(manifestId!, manifest);

    await this.hookExecutor.notify({
      message: `Artifact manifest created: ${manifestId}`,
      level: 'info'
    });

    this.log('info', `Artifact manifest created: ${manifestId}`, {
      artifactCount: artifacts!.length
    });

    return this.createSuccessResponse({
      created: true,
      manifestId,
      artifactCount: artifacts!.length,
      createdAt: manifest.createdAt
    }, requestId);
  }

  /**
   * Get artifact manifest
   */
  private async getManifest(args: ArtifactManifestParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['manifestId']);

    const { manifestId } = args;

    const manifest = this.manifests.get(manifestId!);
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }

    this.log('info', `Artifact manifest retrieved: ${manifestId}`);

    return this.createSuccessResponse({
      manifest: {
        manifestId: manifest.manifestId,
        artifacts: manifest.artifacts,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        status: manifest.status,
        metadata: manifest.metadata
      }
    }, requestId);
  }

  /**
   * List artifact manifests
   */
  private async listManifests(args: ArtifactManifestParams, requestId: string): Promise<HandlerResponse> {
    const { filterBy } = args;

    let manifests = Array.from(this.manifests.values());

    // Apply filters
    if (filterBy) {
      manifests = manifests.filter(m => {
        return Object.entries(filterBy).every(([key, value]) => {
          if (key === 'type') {
            return m.artifacts.some(a => a.type === value);
          }
          return m.metadata[key] === value;
        });
      });
    }

    this.log('info', `Listed artifact manifests`, { count: manifests.length });

    return this.createSuccessResponse({
      manifests: manifests.map(m => ({
        manifestId: m.manifestId,
        artifactCount: m.artifacts.length,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        status: m.status
      })),
      count: manifests.length
    }, requestId);
  }

  /**
   * Update artifact manifest
   */
  private async updateManifest(args: ArtifactManifestParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['manifestId', 'updates']);

    const { manifestId, updates } = args;

    const manifest = this.manifests.get(manifestId!);
    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }

    // Apply updates
    Object.assign(manifest, updates);
    manifest.updatedAt = Date.now();

    this.log('info', `Artifact manifest updated: ${manifestId}`);

    return this.createSuccessResponse({
      updated: true,
      manifestId,
      updatedAt: manifest.updatedAt
    }, requestId);
  }

  /**
   * Delete artifact manifest
   */
  private async deleteManifest(args: ArtifactManifestParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['manifestId']);

    const { manifestId } = args;

    const deleted = this.manifests.delete(manifestId!);
    if (!deleted) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }

    this.log('info', `Artifact manifest deleted: ${manifestId}`);

    return this.createSuccessResponse({
      deleted: true,
      manifestId
    }, requestId);
  }
}
