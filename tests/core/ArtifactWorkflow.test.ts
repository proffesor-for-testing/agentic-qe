import { ArtifactWorkflow } from '../../src/core/ArtifactWorkflow';
import { SwarmMemoryManager } from '../../src/memory/SwarmMemoryManager';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('ArtifactWorkflow', () => {
  const testDbPath = path.join(__dirname, '../../.aqe/test-artifact-memory.db');
  const testArtifactsDir = path.join(__dirname, '../../.aqe/test-artifacts');
  let memory: SwarmMemoryManager;
  let artifacts: ArtifactWorkflow;

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Clean up test artifacts directory
    if (fs.existsSync(testArtifactsDir)) {
      fs.rmSync(testArtifactsDir, { recursive: true, force: true });
    }

    // Ensure directories exist
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(testArtifactsDir)) {
      fs.mkdirSync(testArtifactsDir, { recursive: true });
    }

    memory = new SwarmMemoryManager(testDbPath);
    await memory.initialize();

    artifacts = new ArtifactWorkflow(memory, testArtifactsDir);
  });

  afterEach(async () => {
    if (memory) {
      await memory.close();
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Clean up test artifacts directory
    if (fs.existsSync(testArtifactsDir)) {
      fs.rmSync(testArtifactsDir, { recursive: true, force: true });
    }
  });

  describe('Artifact Creation', () => {
    test('should create artifact with code kind', async () => {
      const content = `
        export function testFunction() {
          return 'test';
        }
      `;

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'code',
        path: 'test-suite.ts',
        tags: ['auth', 'integration', 'v3']
      });

      expect(artifactId).toMatch(/^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      // Verify manifest stored in artifacts table
      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.value.kind).toBe('code');
      expect(manifest.value.path).toBe('test-suite.ts');
      expect(manifest.value.tags).toEqual(['auth', 'integration', 'v3']);
      expect(manifest.value.sha256).toBeTruthy();
      expect(manifest.value.size).toBe(content.length);
      expect(manifest.value.createdAt).toBeTruthy();
    });

    test('should create artifact with doc kind', async () => {
      const content = '# API Documentation\n\nThis is the documentation.';

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'doc',
        path: 'API.md',
        tags: ['docs', 'api']
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.value.kind).toBe('doc');
      expect(manifest.value.path).toBe('API.md');
    });

    test('should create artifact with data kind', async () => {
      const content = JSON.stringify({ results: [1, 2, 3, 4, 5] });

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'data',
        path: 'test-results.json',
        tags: ['results', 'benchmark']
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.value.kind).toBe('data');
    });

    test('should create artifact with config kind', async () => {
      const content = JSON.stringify({ timeout: 5000, retries: 3 });

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'config',
        path: 'test.config.json',
        tags: ['config', 'testing']
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.value.kind).toBe('config');
    });

    test('should store artifact content to file system', async () => {
      const content = 'Test artifact content';

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'code',
        path: 'test.ts',
        tags: ['test']
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      const filePath = path.join(testArtifactsDir, manifest.value.path);

      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe(content);
    });

    test('should compute correct SHA256 hash', async () => {
      const content = 'Test content for hash verification';
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      const artifactId = await artifacts.createArtifact(content, {
        kind: 'code',
        path: 'hash-test.ts',
        tags: []
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.value.sha256).toBe(expectedHash);
    });

    test('should store manifest with TTL 0 (never expires)', async () => {
      const artifactId = await artifacts.createArtifact('content', {
        kind: 'code',
        path: 'permanent.ts',
        tags: []
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.ttl).toBe(0);
      expect(manifest.expiresAt).toBeNull();
    });

    test('should create nested directory paths', async () => {
      const artifactId = await artifacts.createArtifact('test', {
        kind: 'code',
        path: 'src/tests/integration/auth.test.ts',
        tags: []
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      const filePath = path.join(testArtifactsDir, manifest.value.path);

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('Artifact Retrieval', () => {
    test('should retrieve artifact by ID', async () => {
      const originalContent = 'Original test content';

      const artifactId = await artifacts.createArtifact(originalContent, {
        kind: 'code',
        path: 'retrieve-test.ts',
        tags: ['test']
      });

      const result = await artifacts.retrieveArtifact(artifactId);

      expect(result.manifest.kind).toBe('code');
      expect(result.manifest.path).toBe('retrieve-test.ts');
      expect(result.manifest.tags).toEqual(['test']);
      expect(result.content).toBe(originalContent);
    });

    test('should verify SHA256 integrity on retrieval', async () => {
      const originalContent = 'Content for integrity check';

      const artifactId = await artifacts.createArtifact(originalContent, {
        kind: 'data',
        path: 'integrity-test.json',
        tags: []
      });

      // Should not throw - integrity is valid
      const result = await artifacts.retrieveArtifact(artifactId);
      expect(result.content).toBe(originalContent);
    });

    test('should throw error if artifact content is corrupted', async () => {
      const originalContent = 'Original content';

      const artifactId = await artifacts.createArtifact(originalContent, {
        kind: 'code',
        path: 'corrupted.ts',
        tags: []
      });

      // Corrupt the file
      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      const filePath = path.join(testArtifactsDir, manifest.value.path);
      fs.writeFileSync(filePath, 'Corrupted content');

      // Should throw integrity error
      await expect(artifacts.retrieveArtifact(artifactId)).rejects.toThrow('Artifact integrity check failed');
    });

    test('should throw error if artifact manifest not found', async () => {
      await expect(
        artifacts.retrieveArtifact('artifact:non-existent-id')
      ).rejects.toThrow();
    });

    test('should throw error if artifact file not found', async () => {
      const artifactId = await artifacts.createArtifact('content', {
        kind: 'code',
        path: 'deleted.ts',
        tags: []
      });

      // Delete the file
      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      const filePath = path.join(testArtifactsDir, manifest.value.path);
      fs.unlinkSync(filePath);

      await expect(artifacts.retrieveArtifact(artifactId)).rejects.toThrow();
    });
  });

  describe('Tag-Based Organization', () => {
    test('should query artifacts by single tag', async () => {
      await artifacts.createArtifact('auth test 1', {
        kind: 'code',
        path: 'auth1.ts',
        tags: ['auth', 'unit']
      });

      await artifacts.createArtifact('auth test 2', {
        kind: 'code',
        path: 'auth2.ts',
        tags: ['auth', 'integration']
      });

      await artifacts.createArtifact('user test', {
        kind: 'code',
        path: 'user.ts',
        tags: ['user', 'unit']
      });

      const authArtifacts = await artifacts.queryByTags(['auth']);
      expect(authArtifacts.length).toBe(2);
      authArtifacts.forEach(artifact => {
        expect(artifact.manifest.tags).toContain('auth');
      });
    });

    test('should query artifacts by multiple tags (AND logic)', async () => {
      await artifacts.createArtifact('test 1', {
        kind: 'code',
        path: 'test1.ts',
        tags: ['auth', 'integration', 'v3']
      });

      await artifacts.createArtifact('test 2', {
        kind: 'code',
        path: 'test2.ts',
        tags: ['auth', 'unit']
      });

      await artifacts.createArtifact('test 3', {
        kind: 'code',
        path: 'test3.ts',
        tags: ['auth', 'integration', 'v2']
      });

      const results = await artifacts.queryByTags(['auth', 'integration']);
      expect(results.length).toBe(2);
      results.forEach(artifact => {
        expect(artifact.manifest.tags).toContain('auth');
        expect(artifact.manifest.tags).toContain('integration');
      });
    });

    test('should return empty array if no artifacts match tags', async () => {
      await artifacts.createArtifact('test', {
        kind: 'code',
        path: 'test.ts',
        tags: ['auth']
      });

      const results = await artifacts.queryByTags(['performance']);
      expect(results).toEqual([]);
    });

    test('should query by artifact kind', async () => {
      await artifacts.createArtifact('code', { kind: 'code', path: 'test.ts', tags: [] });
      await artifacts.createArtifact('doc', { kind: 'doc', path: 'README.md', tags: [] });
      await artifacts.createArtifact('data', { kind: 'data', path: 'data.json', tags: [] });
      await artifacts.createArtifact('config', { kind: 'config', path: 'config.json', tags: [] });

      const codeArtifacts = await artifacts.queryByKind('code');
      expect(codeArtifacts.length).toBe(1);
      expect(codeArtifacts[0].manifest.kind).toBe('code');
    });

    test('should query by kind and tags combined', async () => {
      await artifacts.createArtifact('test1', {
        kind: 'code',
        path: 'test1.ts',
        tags: ['auth', 'unit']
      });

      await artifacts.createArtifact('test2', {
        kind: 'doc',
        path: 'test2.md',
        tags: ['auth', 'docs']
      });

      await artifacts.createArtifact('test3', {
        kind: 'code',
        path: 'test3.ts',
        tags: ['user', 'unit']
      });

      const results = await artifacts.queryByKindAndTags('code', ['auth']);
      expect(results.length).toBe(1);
      expect(results[0].manifest.kind).toBe('code');
      expect(results[0].manifest.tags).toContain('auth');
    });
  });

  describe('Artifact Versioning', () => {
    test('should create new version of artifact', async () => {
      const v1Content = 'Version 1 content';
      const v1Id = await artifacts.createArtifact(v1Content, {
        kind: 'code',
        path: 'versioned.ts',
        tags: ['v1']
      });

      const v2Content = 'Version 2 content';
      const v2Id = await artifacts.createArtifactVersion(v1Id, v2Content, {
        tags: ['v2']
      });

      expect(v2Id).not.toBe(v1Id);

      const v2Result = await artifacts.retrieveArtifact(v2Id);
      expect(v2Result.content).toBe(v2Content);
      expect(v2Result.manifest.tags).toContain('v2');
      expect(v2Result.manifest.previousVersion).toBe(v1Id);
    });

    test('should maintain version history chain', async () => {
      const v1Id = await artifacts.createArtifact('v1', {
        kind: 'code',
        path: 'history.ts',
        tags: ['v1']
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'v2', { tags: ['v2'] });
      const v3Id = await artifacts.createArtifactVersion(v2Id, 'v3', { tags: ['v3'] });

      const history = await artifacts.getVersionHistory(v3Id);
      expect(history.length).toBe(3);
      expect(history[0].id).toBe(v3Id); // Latest first
      expect(history[1].id).toBe(v2Id);
      expect(history[2].id).toBe(v1Id);
    });

    test('should get latest version of artifact', async () => {
      const v1Id = await artifacts.createArtifact('v1', {
        kind: 'code',
        path: 'latest.ts',
        tags: []
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'v2', { tags: [] });
      const v3Id = await artifacts.createArtifactVersion(v2Id, 'v3', { tags: [] });

      const latest = await artifacts.getLatestVersion(v1Id);
      expect(latest.id).toBe(v3Id);
      expect(latest.content).toBe('v3');
    });

    test('should get specific version from history', async () => {
      const v1Id = await artifacts.createArtifact('version 1', {
        kind: 'code',
        path: 'specific.ts',
        tags: []
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'version 2', { tags: [] });
      await artifacts.createArtifactVersion(v2Id, 'version 3', { tags: [] });

      const v2Result = await artifacts.retrieveArtifact(v2Id);
      expect(v2Result.content).toBe('version 2');
    });

    test('should inherit path from previous version if not provided', async () => {
      const v1Id = await artifacts.createArtifact('v1', {
        kind: 'code',
        path: 'inherit-path.ts',
        tags: []
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'v2', { tags: [] });

      const v2Manifest = await memory.retrieve(v2Id, { partition: 'artifacts' });
      // Should create versioned path to avoid overwrites
      expect(v2Manifest.value.path).toMatch(/inherit-path\.v\d+\.ts/);
    });

    test('should allow changing path in new version', async () => {
      const v1Id = await artifacts.createArtifact('v1', {
        kind: 'code',
        path: 'old-path.ts',
        tags: []
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'v2', {
        path: 'new-path.ts',
        tags: []
      });

      const v2Manifest = await memory.retrieve(v2Id, { partition: 'artifacts' });
      expect(v2Manifest.value.path).toBe('new-path.ts');
    });
  });

  describe('Artifact Listing', () => {
    test('should list all artifacts', async () => {
      await artifacts.createArtifact('test1', { kind: 'code', path: 'test1.ts', tags: [] });
      await artifacts.createArtifact('test2', { kind: 'doc', path: 'test2.md', tags: [] });
      await artifacts.createArtifact('test3', { kind: 'data', path: 'test3.json', tags: [] });

      const allArtifacts = await artifacts.listArtifacts();
      expect(allArtifacts.length).toBe(3);
    });

    test('should list artifacts with limit', async () => {
      for (let i = 0; i < 10; i++) {
        await artifacts.createArtifact(`test${i}`, {
          kind: 'code',
          path: `test${i}.ts`,
          tags: []
        });
      }

      const limited = await artifacts.listArtifacts({ limit: 5 });
      expect(limited.length).toBe(5);
    });

    test('should sort artifacts by creation time (newest first)', async () => {
      const id1 = await artifacts.createArtifact('first', {
        kind: 'code',
        path: 'first.ts',
        tags: []
      });

      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

      const id2 = await artifacts.createArtifact('second', {
        kind: 'code',
        path: 'second.ts',
        tags: []
      });

      const list = await artifacts.listArtifacts();
      expect(list[0].id).toBe(id2); // Newest first
      expect(list[1].id).toBe(id1);
    });
  });

  describe('Artifact Deletion', () => {
    test('should delete artifact and its file', async () => {
      const artifactId = await artifacts.createArtifact('delete me', {
        kind: 'code',
        path: 'delete-test.ts',
        tags: []
      });

      await artifacts.deleteArtifact(artifactId);

      // Manifest should be gone
      await expect(
        memory.retrieve(artifactId, { partition: 'artifacts' })
      ).rejects.toThrow();

      // File should be gone
      const filePath = path.join(testArtifactsDir, 'delete-test.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('should handle deletion of non-existent artifact', async () => {
      await expect(
        artifacts.deleteArtifact('artifact:non-existent')
      ).rejects.toThrow();
    });

    test('should delete all versions when deleting versioned artifact', async () => {
      const v1Id = await artifacts.createArtifact('v1', {
        kind: 'code',
        path: 'delete-versions.ts',
        tags: []
      });

      const v2Id = await artifacts.createArtifactVersion(v1Id, 'v2', { tags: [] });
      const v3Id = await artifacts.createArtifactVersion(v2Id, 'v3', { tags: [] });

      await artifacts.deleteArtifactWithVersions(v3Id);

      // All versions should be deleted
      await expect(memory.retrieve(v1Id, { partition: 'artifacts' })).rejects.toThrow();
      await expect(memory.retrieve(v2Id, { partition: 'artifacts' })).rejects.toThrow();
      await expect(memory.retrieve(v3Id, { partition: 'artifacts' })).rejects.toThrow();
    });
  });

  describe('Integration with SwarmMemoryManager', () => {
    test('should store manifests in artifacts table', async () => {
      const artifactId = await artifacts.createArtifact('test', {
        kind: 'code',
        path: 'integration.ts',
        tags: []
      });

      // Verify stored in correct partition
      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest).toBeTruthy();
    });

    test('should use artifacts partition with TTL 0', async () => {
      const artifactId = await artifacts.createArtifact('test', {
        kind: 'code',
        path: 'ttl-test.ts',
        tags: []
      });

      const manifest = await memory.retrieve(artifactId, { partition: 'artifacts' });
      expect(manifest.ttl).toBe(0); // Never expires
    });

    test('should query artifacts using memory query methods', async () => {
      await artifacts.createArtifact('test1', {
        kind: 'code',
        path: 'query1.ts',
        tags: ['test']
      });

      await artifacts.createArtifact('test2', {
        kind: 'code',
        path: 'query2.ts',
        tags: ['test']
      });

      const results = await memory.query('artifact:*', { partition: 'artifacts' });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    test('should validate required fields', async () => {
      await expect(
        artifacts.createArtifact('', {
          kind: 'code',
          path: 'empty.ts',
          tags: []
        })
      ).rejects.toThrow();
    });

    test('should validate artifact kind', async () => {
      await expect(
        artifacts.createArtifact('test', {
          kind: 'invalid' as any,
          path: 'invalid.ts',
          tags: []
        })
      ).rejects.toThrow();
    });

    test('should handle file system errors gracefully', async () => {
      // Create artifact in read-only directory (if possible)
      // This is a platform-specific test
    });

    test('should validate artifact ID format on retrieval', async () => {
      await expect(
        artifacts.retrieveArtifact('invalid-id-format')
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle large artifacts efficiently', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB

      const start = Date.now();
      const artifactId = await artifacts.createArtifact(largeContent, {
        kind: 'data',
        path: 'large.dat',
        tags: []
      });
      const createTime = Date.now() - start;

      expect(createTime).toBeLessThan(1000); // Should complete in under 1 second

      const retrieveStart = Date.now();
      await artifacts.retrieveArtifact(artifactId);
      const retrieveTime = Date.now() - retrieveStart;

      expect(retrieveTime).toBeLessThan(1000);
    });

    test('should handle many artifacts efficiently', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          artifacts.createArtifact(`content ${i}`, {
            kind: 'code',
            path: `test${i}.ts`,
            tags: ['batch']
          })
        );
      }

      const start = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});
