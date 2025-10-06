import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SwarmMemoryManager } from './memory/SwarmMemoryManager';

/**
 * ArtifactManifest - Small metadata stored in memory
 * Actual content is stored in files, referenced by ID
 */
export interface ArtifactManifest {
  id: string;
  kind: 'code' | 'doc' | 'data' | 'config';
  path: string;
  sha256: string;
  tags: string[];
  size: number;
  createdAt: number;
  previousVersion?: string;
}

/**
 * Artifact creation options
 */
export interface ArtifactCreateOptions {
  kind: 'code' | 'doc' | 'data' | 'config';
  path: string;
  tags: string[];
}

/**
 * Artifact version creation options
 */
export interface ArtifactVersionOptions {
  path?: string;
  tags: string[];
}

/**
 * Artifact query result
 */
export interface ArtifactQueryResult {
  id: string;
  manifest: ArtifactManifest;
}

/**
 * Artifact retrieval result
 */
export interface ArtifactRetrievalResult {
  id: string;
  manifest: ArtifactManifest;
  content: string;
}

/**
 * ArtifactWorkflow - Artifact-Centric Design with Manifest Storage
 *
 * Implements Claude Flow's artifact-centric pattern:
 * - Large outputs (code, docs, data) stored as files
 * - Small manifests stored in memory (artifacts table)
 * - SHA256 integrity verification
 * - Tag-based organization
 * - Version history tracking
 * - Reference by ID, not content
 *
 * Based on AQE-IMPROVEMENT-PLAN.md Phase 1
 */
export class ArtifactWorkflow {
  private memory: SwarmMemoryManager;
  private artifactsDir: string;

  constructor(memory: SwarmMemoryManager, artifactsDir: string = '.aqe/artifacts') {
    this.memory = memory;
    this.artifactsDir = artifactsDir;

    // Ensure artifacts directory exists
    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
  }

  /**
   * Create a new artifact with content storage and manifest
   *
   * @param content - Artifact content (code, doc, data, config)
   * @param options - Artifact metadata (kind, path, tags)
   * @returns Artifact ID for reference
   */
  async createArtifact(
    content: string,
    options: ArtifactCreateOptions
  ): Promise<string> {
    // Validate inputs
    if (!content) {
      throw new Error('Artifact content cannot be empty');
    }

    if (!this.isValidKind(options.kind)) {
      throw new Error(`Invalid artifact kind: ${options.kind}`);
    }

    if (!options.path) {
      throw new Error('Artifact path is required');
    }

    // Generate unique artifact ID
    const artifactId = `artifact:${uuidv4()}`;

    // Compute SHA256 hash for integrity
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    // Store artifact content to file
    const filePath = path.join(this.artifactsDir, options.path);
    const fileDir = path.dirname(filePath);

    // Create nested directories if needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    // Create manifest (small metadata)
    const manifest: ArtifactManifest = {
      id: artifactId,
      kind: options.kind,
      path: options.path,
      sha256: sha256,
      tags: options.tags,
      size: content.length,
      createdAt: Date.now()
    };

    // Store manifest in artifacts table (TTL 0 - never expires)
    await this.memory.store(artifactId, manifest, {
      partition: 'artifacts',
      ttl: 0
    });

    return artifactId;
  }

  /**
   * Retrieve artifact by ID with integrity verification
   *
   * @param artifactId - Artifact ID to retrieve
   * @returns Artifact manifest and content
   */
  async retrieveArtifact(artifactId: string): Promise<ArtifactRetrievalResult> {
    // Validate artifact ID format
    if (!artifactId.startsWith('artifact:')) {
      throw new Error(`Invalid artifact ID format: ${artifactId}`);
    }

    // Retrieve manifest from memory
    const manifestEntry = await this.memory.retrieve(artifactId, {
      partition: 'artifacts'
    });

    const manifest = manifestEntry.value as ArtifactManifest;

    // Read artifact content from file
    const filePath = path.join(this.artifactsDir, manifest.path);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Verify SHA256 integrity
    const computedHash = crypto.createHash('sha256').update(content).digest('hex');

    if (computedHash !== manifest.sha256) {
      throw new Error(`Artifact integrity check failed for ${artifactId}`);
    }

    return {
      id: artifactId,
      manifest,
      content
    };
  }

  /**
   * Query artifacts by tags (AND logic - all tags must match)
   *
   * @param tags - Tags to filter by
   * @returns Array of matching artifacts
   */
  async queryByTags(tags: string[]): Promise<ArtifactQueryResult[]> {
    // Query all artifacts
    const allArtifacts = await this.memory.query('artifact:*', {
      partition: 'artifacts'
    });

    // Filter by tags (AND logic) and limit results
    const results = allArtifacts
      .filter((entry: any) => {
        const manifest = entry.value as ArtifactManifest;
        return tags.every(tag => manifest.tags.includes(tag));
      })
      .slice(0, 1000);

    return results.map((entry: any) => ({
      id: entry.key,
      manifest: entry.value as ArtifactManifest
    }));
  }

  /**
   * Query artifacts by kind
   *
   * @param kind - Artifact kind to filter by
   * @returns Array of matching artifacts
   */
  async queryByKind(kind: string): Promise<ArtifactQueryResult[]> {
    const allArtifacts = await this.memory.query('artifact:*', {
      partition: 'artifacts'
    });

    const results = allArtifacts
      .filter((entry: any) => {
        const manifest = entry.value as ArtifactManifest;
        return manifest.kind === kind;
      })
      .slice(0, 1000);

    return results.map((entry: any) => ({
      id: entry.key,
      manifest: entry.value as ArtifactManifest
    }));
  }

  /**
   * Query artifacts by kind AND tags
   *
   * @param kind - Artifact kind
   * @param tags - Tags to filter by
   * @returns Array of matching artifacts
   */
  async queryByKindAndTags(
    kind: string,
    tags: string[]
  ): Promise<ArtifactQueryResult[]> {
    const allArtifacts = await this.memory.query('artifact:*', {
      partition: 'artifacts'
    });

    const results = allArtifacts
      .filter((entry: any) => {
        const manifest = entry.value as ArtifactManifest;
        return (
          manifest.kind === kind &&
          tags.every(tag => manifest.tags.includes(tag))
        );
      })
      .slice(0, 1000);

    return results.map((entry: any) => ({
      id: entry.key,
      manifest: entry.value as ArtifactManifest
    }));
  }

  /**
   * Create a new version of an existing artifact
   *
   * @param previousArtifactId - ID of the previous version
   * @param content - New content
   * @param options - Version options (path, tags)
   * @returns New artifact ID
   */
  async createArtifactVersion(
    previousArtifactId: string,
    content: string,
    options: ArtifactVersionOptions
  ): Promise<string> {
    // Retrieve previous version to inherit metadata
    const previousEntry = await this.memory.retrieve(previousArtifactId, {
      partition: 'artifacts'
    });

    const previousManifest = previousEntry.value as ArtifactManifest;

    // Generate unique artifact ID first
    const newArtifactId = `artifact:${uuidv4()}`;

    // If path not provided, create versioned path to avoid overwrites
    let newPath = options.path;
    if (!newPath) {
      const pathParts = path.parse(previousManifest.path);
      const timestamp = Date.now();
      newPath = path.join(
        pathParts.dir,
        `${pathParts.name}.v${timestamp}${pathParts.ext}`
      );
    }

    // Compute SHA256 hash for integrity
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    // Store artifact content to file
    const filePath = path.join(this.artifactsDir, newPath);
    const fileDir = path.dirname(filePath);

    // Create nested directories if needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    // Create new manifest with version link
    const newManifest: ArtifactManifest = {
      id: newArtifactId,
      kind: previousManifest.kind,
      path: newPath,
      sha256: sha256,
      tags: options.tags,
      size: content.length,
      createdAt: Date.now(),
      previousVersion: previousArtifactId
    };

    // Store manifest in artifacts table
    await this.memory.store(newArtifactId, newManifest, {
      partition: 'artifacts',
      ttl: 0
    });

    return newArtifactId;
  }

  /**
   * Get version history for an artifact
   *
   * @param artifactId - Artifact ID
   * @returns Array of artifacts in version chain (newest first)
   */
  async getVersionHistory(artifactId: string): Promise<ArtifactRetrievalResult[]> {
    const history: ArtifactRetrievalResult[] = [];
    let currentId: string | undefined = artifactId;

    while (currentId) {
      const artifact = await this.retrieveArtifact(currentId);
      history.push(artifact);
      currentId = artifact.manifest.previousVersion;
    }

    return history;
  }

  /**
   * Get the latest version of an artifact
   *
   * @param artifactId - Any artifact ID in the version chain
   * @returns Latest version
   */
  async getLatestVersion(artifactId: string): Promise<ArtifactRetrievalResult> {
    // Get all artifacts and find ones pointing to this artifact
    const allArtifacts = await this.memory.query('artifact:*', {
      partition: 'artifacts'
    });

    // Build version graph
    const versionMap = new Map<string, string>(); // previousId -> currentId

    allArtifacts.slice(0, 1000).forEach((entry: any) => {
      const manifest = entry.value as ArtifactManifest;
      if (manifest.previousVersion) {
        versionMap.set(manifest.previousVersion, manifest.id);
      }
    });

    // Follow chain to find latest
    let latestId = artifactId;
    while (versionMap.has(latestId)) {
      latestId = versionMap.get(latestId)!;
    }

    return this.retrieveArtifact(latestId);
  }

  /**
   * List all artifacts
   *
   * @param options - Query options (limit)
   * @returns Array of all artifacts
   */
  async listArtifacts(options?: { limit?: number }): Promise<ArtifactQueryResult[]> {
    const allArtifacts = await this.memory.query('artifact:*', {
      partition: 'artifacts'
    });

    const limitedResults = allArtifacts.slice(0, options?.limit || 1000);

    return limitedResults.map((entry: any) => ({
      id: entry.key,
      manifest: entry.value as ArtifactManifest
    }));
  }

  /**
   * Delete an artifact and its file
   *
   * @param artifactId - Artifact ID to delete
   */
  async deleteArtifact(artifactId: string): Promise<void> {
    // Retrieve manifest to get file path
    const manifestEntry = await this.memory.retrieve(artifactId, {
      partition: 'artifacts'
    });

    const manifest = manifestEntry.value as ArtifactManifest;

    // Delete file
    const filePath = path.join(this.artifactsDir, manifest.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete manifest from database
    await this.memory.delete(artifactId, 'artifacts');
  }

  /**
   * Delete an artifact and all its versions
   *
   * @param artifactId - Artifact ID (any version in chain)
   */
  async deleteArtifactWithVersions(artifactId: string): Promise<void> {
    const history = await this.getVersionHistory(artifactId);

    for (const artifact of history) {
      await this.deleteArtifact(artifact.id);
    }
  }

  /**
   * Validate artifact kind
   */
  private isValidKind(kind: string): boolean {
    return ['code', 'doc', 'data', 'config'].includes(kind);
  }
}
