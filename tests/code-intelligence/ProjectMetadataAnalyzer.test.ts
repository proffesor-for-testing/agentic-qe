/**
 * Tests for ProjectMetadataAnalyzer
 */

import { ProjectMetadataAnalyzer } from '../../src/code-intelligence/inference/ProjectMetadataAnalyzer';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ProjectMetadataAnalyzer', () => {
  let analyzer: ProjectMetadataAnalyzer;
  const testProjectDir = path.join(__dirname, 'fixtures', 'test-project');

  beforeEach(async () => {
    analyzer = new ProjectMetadataAnalyzer(testProjectDir);

    // Clean up test directory
    await fs.remove(testProjectDir);
    await fs.ensureDir(testProjectDir);
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(testProjectDir);
  });

  describe('parsePackageJson', () => {
    it('should extract basic project metadata from package.json', async () => {
      // Create test package.json
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
        version: '1.0.0',
        description: 'Test application',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        dependencies: {
          express: '^4.18.0',
          pg: '^8.11.0',
        },
      });

      const metadata = await analyzer.analyze();

      expect(metadata.name).toBe('test-app');
      expect(metadata.description).toBe('Test application');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should detect CLI type from bin field', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-cli',
        bin: {
          'test-cli': './bin/cli.js',
        },
      });

      const metadata = await analyzer.analyze();

      expect(metadata.systemType).toBe('cli');
    });

    it('should detect library type from main and types fields', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-lib',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
      });

      const metadata = await analyzer.analyze();

      expect(metadata.systemType).toBe('library');
    });
  });

  describe('detectTechnologyStack', () => {
    it('should detect TypeScript from tsconfig.json', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });
      await fs.writeJson(path.join(testProjectDir, 'tsconfig.json'), {
        compilerOptions: {},
      });

      const metadata = await analyzer.analyze();

      expect(metadata.technology).toBe('TypeScript');
    });

    it('should detect JavaScript when no tsconfig.json exists', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      const metadata = await analyzer.analyze();

      expect(metadata.technology).toBe('JavaScript');
    });
  });

  describe('parseDockerCompose', () => {
    it('should detect containers from docker-compose.yml', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      const dockerCompose = {
        version: '3.8',
        services: {
          app: {
            image: 'node:18',
            ports: ['3000:3000'],
          },
          db: {
            image: 'postgres:15',
            ports: ['5432:5432'],
          },
          cache: {
            image: 'redis:7',
            ports: ['6379:6379'],
          },
        },
      };

      await fs.writeFile(
        path.join(testProjectDir, 'docker-compose.yml'),
        `version: '3.8'
services:
  app:
    image: node:18
    ports:
      - "3000:3000"
  db:
    image: postgres:15
    ports:
      - "5432:5432"
  cache:
    image: redis:7
    ports:
      - "6379:6379"
`
      );

      const metadata = await analyzer.analyze();

      expect(metadata.containers).toHaveLength(3);
      expect(metadata.containers.find((c) => c.name === 'app')).toBeDefined();
      expect(metadata.containers.find((c) => c.name === 'db')).toBeDefined();
      expect(metadata.containers.find((c) => c.name === 'cache')).toBeDefined();
    });

    it('should detect container types correctly', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      await fs.writeFile(
        path.join(testProjectDir, 'docker-compose.yml'),
        `version: '3.8'
services:
  app:
    image: node:18
  postgres:
    image: postgres:15
  redis:
    image: redis:7
  rabbitmq:
    image: rabbitmq:3
`
      );

      const metadata = await analyzer.analyze();

      const appContainer = metadata.containers.find((c) => c.name === 'app');
      const dbContainer = metadata.containers.find((c) => c.name === 'postgres');
      const cacheContainer = metadata.containers.find((c) => c.name === 'redis');
      const queueContainer = metadata.containers.find((c) => c.name === 'rabbitmq');

      expect(appContainer?.type).toBe('application');
      expect(dbContainer?.type).toBe('database');
      expect(cacheContainer?.type).toBe('cache');
      expect(queueContainer?.type).toBe('queue');
    });
  });

  describe('detectSystemType', () => {
    it('should detect microservice architecture from multiple services', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      await fs.writeFile(
        path.join(testProjectDir, 'docker-compose.yml'),
        `version: '3.8'
services:
  api:
    image: node:18
  worker:
    image: node:18
  db:
    image: postgres:15
`
      );

      const metadata = await analyzer.analyze();

      expect(metadata.systemType).toBe('microservice');
    });

    it('should detect monolith architecture from single service', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      await fs.writeFile(
        path.join(testProjectDir, 'docker-compose.yml'),
        `version: '3.8'
services:
  app:
    image: node:18
`
      );

      const metadata = await analyzer.analyze();

      expect(metadata.systemType).toBe('monolith');
    });
  });

  describe('detectLayers', () => {
    it('should detect architectural layers from directory structure', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      // Create layer directories
      await fs.ensureDir(path.join(testProjectDir, 'src', 'controllers'));
      await fs.ensureDir(path.join(testProjectDir, 'src', 'services'));
      await fs.ensureDir(path.join(testProjectDir, 'src', 'repositories'));

      const metadata = await analyzer.analyze();

      expect(metadata.layers).toContain('controllers');
      expect(metadata.layers).toContain('services');
      expect(metadata.layers).toContain('repositories');
    });
  });

  describe('extractPort', () => {
    it('should extract port from docker-compose port mapping', async () => {
      await fs.writeJson(path.join(testProjectDir, 'package.json'), {
        name: 'test-app',
      });

      await fs.writeFile(
        path.join(testProjectDir, 'docker-compose.yml'),
        `version: '3.8'
services:
  app:
    image: node:18
    ports:
      - "3000:3000"
`
      );

      const metadata = await analyzer.analyze();
      const appContainer = metadata.containers.find((c) => c.name === 'app');

      expect(appContainer?.port).toBe(3000);
    });
  });

  describe('getRootDir / setRootDir', () => {
    it('should get and set root directory', () => {
      const newDir = '/new/test/dir';
      analyzer.setRootDir(newDir);

      expect(analyzer.getRootDir()).toBe(newDir);
    });
  });
});
