/**
 * Project Metadata Analyzer for C4 Model Integration
 *
 * Extracts project metadata from configuration files to generate C4 diagrams:
 * - Parse package.json for system name, type, and technology stack
 * - Parse docker-compose.yml and Dockerfile for container detection
 * - Analyze directory structure to infer system architecture
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { createHash } from 'crypto';
import type { ProjectMetadata, Container } from './types';

/**
 * Package.json structure (partial)
 */
interface PackageJson {
  name?: string;
  description?: string;
  version?: string;
  main?: string;
  types?: string;
  bin?: Record<string, string> | string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  repository?: string | { type: string; url: string };
  scripts?: Record<string, string>;
}

/**
 * Docker Compose structure (partial)
 */
interface DockerCompose {
  version?: string;
  services?: Record<string, DockerService>;
}

interface DockerService {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  ports?: string[];
  environment?: Record<string, string> | string[];
  depends_on?: string[] | Record<string, any>;
  volumes?: string[];
  command?: string | string[];
}

/**
 * Dockerfile instruction
 */
interface DockerInstruction {
  instruction: string;
  arguments: string;
}

/**
 * Technology stack detection result
 */
interface TechnologyStack {
  primary: string;
  runtime: string;
  frameworks: string[];
  databases: string[];
  infrastructure: string[];
}

export class ProjectMetadataAnalyzer {
  constructor(private rootDir: string) {}

  /**
   * Analyze project and extract metadata
   */
  async analyze(): Promise<ProjectMetadata> {
    const startTime = Date.now();

    try {
      // Parse package.json
      const packageData = await this.parsePackageJson();

      // Detect containers
      const containers = await this.detectContainers();

      // Detect system type
      const systemType = await this.detectSystemType();

      // Detect technology stack
      const techStack = await this.detectTechnologyStack();

      // Detect layers
      const layers = await this.detectLayers();

      const metadata: ProjectMetadata = {
        name: packageData.systemName || 'unknown-system',
        description: packageData.systemDescription,
        systemType,
        technology: techStack.primary,
        containers,
        layers,
        version: packageData.version,
        repository: packageData.repository,
      };

      return metadata;
    } catch (error) {
      throw new Error(
        `Failed to analyze project metadata: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Parse package.json for basic metadata
   */
  private async parsePackageJson(): Promise<{
    systemName?: string;
    systemDescription?: string;
    version?: string;
    repository?: string;
    hasBin: boolean;
    hasMain: boolean;
    hasTypes: boolean;
    dependencies: Record<string, string>;
  }> {
    const packagePath = path.join(this.rootDir, 'package.json');

    if (!(await fs.pathExists(packagePath))) {
      return {
        hasBin: false,
        hasMain: false,
        hasTypes: false,
        dependencies: {},
      };
    }

    const packageJson: PackageJson = await fs.readJson(packagePath);

    const repository =
      typeof packageJson.repository === 'string'
        ? packageJson.repository
        : packageJson.repository?.url;

    return {
      systemName: packageJson.name,
      systemDescription: packageJson.description,
      version: packageJson.version,
      repository,
      hasBin: !!packageJson.bin,
      hasMain: !!packageJson.main,
      hasTypes: !!packageJson.types,
      dependencies: {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      },
    };
  }

  /**
   * Parse docker-compose.yml to detect containers
   */
  private async parseDockerCompose(): Promise<Container[]> {
    const composePath = path.join(this.rootDir, 'docker-compose.yml');

    if (!(await fs.pathExists(composePath))) {
      return [];
    }

    try {
      const content = await fs.readFile(composePath, 'utf-8');
      const compose: DockerCompose = yaml.parse(content);

      if (!compose.services) {
        return [];
      }

      const containers: Container[] = [];

      for (const [serviceName, service] of Object.entries(compose.services)) {
        const container = this.parseDockerService(serviceName, service);
        if (container) {
          containers.push(container);
        }
      }

      return containers;
    } catch (error) {
      console.warn(`Failed to parse docker-compose.yml: ${error}`);
      return [];
    }
  }

  /**
   * Parse a Docker service definition
   */
  private parseDockerService(
    serviceName: string,
    service: DockerService
  ): Container | null {
    const image = service.image || '';
    const type = this.detectContainerType(serviceName, image, service);
    const technology = this.extractTechnology(image, service);
    const port = this.extractPort(service.ports);

    const dependencies: string[] = [];
    if (service.depends_on) {
      if (Array.isArray(service.depends_on)) {
        dependencies.push(...service.depends_on);
      } else {
        dependencies.push(...Object.keys(service.depends_on));
      }
    }

    return {
      id: this.generateContainerId(serviceName),
      name: serviceName,
      type,
      technology,
      port,
      dependencies,
    };
  }

  /**
   * Detect container type from service name and image
   */
  private detectContainerType(
    serviceName: string,
    image: string,
    service: DockerService
  ): Container['type'] {
    const lowerName = serviceName.toLowerCase();
    const lowerImage = image.toLowerCase();

    // Database detection
    if (
      lowerName.includes('db') ||
      lowerName.includes('database') ||
      lowerImage.includes('postgres') ||
      lowerImage.includes('mysql') ||
      lowerImage.includes('mongo') ||
      lowerImage.includes('mariadb')
    ) {
      return 'database';
    }

    // Cache detection
    if (
      lowerName.includes('redis') ||
      lowerName.includes('cache') ||
      lowerImage.includes('redis') ||
      lowerImage.includes('memcached')
    ) {
      return 'cache';
    }

    // Queue detection
    if (
      lowerName.includes('queue') ||
      lowerName.includes('rabbitmq') ||
      lowerName.includes('kafka') ||
      lowerImage.includes('rabbitmq') ||
      lowerImage.includes('kafka') ||
      lowerImage.includes('redis') // Redis can be a queue
    ) {
      return 'queue';
    }

    // API detection
    if (lowerName.includes('api') || lowerName.includes('gateway')) {
      return 'api';
    }

    // Service detection
    if (lowerName.includes('service') || lowerName.includes('worker')) {
      return 'service';
    }

    // Default to application
    return 'application';
  }

  /**
   * Extract technology from image or service definition
   */
  private extractTechnology(image: string, service: DockerService): string {
    const lowerImage = image.toLowerCase();

    // Common technology detection
    const techMap: Record<string, string> = {
      postgres: 'PostgreSQL',
      mysql: 'MySQL',
      mariadb: 'MariaDB',
      mongo: 'MongoDB',
      redis: 'Redis',
      rabbitmq: 'RabbitMQ',
      kafka: 'Apache Kafka',
      nginx: 'Nginx',
      node: 'Node.js',
      python: 'Python',
      java: 'Java',
      golang: 'Go',
      rust: 'Rust',
    };

    for (const [key, tech] of Object.entries(techMap)) {
      if (lowerImage.includes(key)) {
        return tech;
      }
    }

    // Extract from image name
    const parts = image.split(':')[0].split('/');
    const imageName = parts[parts.length - 1];

    return imageName || 'Unknown';
  }

  /**
   * Extract primary port from ports configuration
   */
  private extractPort(ports?: string[]): number | undefined {
    if (!ports || ports.length === 0) {
      return undefined;
    }

    // Parse first port mapping (e.g., "3000:3000" or "3000")
    const firstPort = ports[0];
    const match = firstPort.match(/(\d+):?(\d+)?/);

    if (match) {
      // Return external port (first number)
      return parseInt(match[1], 10);
    }

    return undefined;
  }

  /**
   * Parse Dockerfile to detect base image and technology
   */
  private async parseDockerfile(): Promise<{
    baseImage?: string;
    technology?: string;
  }> {
    const dockerfilePath = path.join(this.rootDir, 'Dockerfile');

    if (!(await fs.pathExists(dockerfilePath))) {
      return {};
    }

    try {
      const content = await fs.readFile(dockerfilePath, 'utf-8');
      const instructions = this.parseDockerInstructions(content);

      // Find FROM instruction
      const fromInstruction = instructions.find(
        (i) => i.instruction === 'FROM'
      );

      if (!fromInstruction) {
        return {};
      }

      const baseImage = fromInstruction.arguments.split(' ')[0];
      const technology = this.extractTechnology(baseImage, {});

      return { baseImage, technology };
    } catch (error) {
      console.warn(`Failed to parse Dockerfile: ${error}`);
      return {};
    }
  }

  /**
   * Parse Dockerfile instructions
   */
  private parseDockerInstructions(content: string): DockerInstruction[] {
    const lines = content.split('\n');
    const instructions: DockerInstruction[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse instruction
      const match = trimmed.match(/^([A-Z]+)\s+(.+)$/);
      if (match) {
        instructions.push({
          instruction: match[1],
          arguments: match[2],
        });
      }
    }

    return instructions;
  }

  /**
   * Detect all containers (Docker + inferred)
   */
  private async detectContainers(): Promise<Container[]> {
    const containers: Container[] = [];

    // Containers from docker-compose
    const dockerContainers = await this.parseDockerCompose();
    containers.push(...dockerContainers);

    // Inferred main application container if not in docker-compose
    if (containers.length === 0) {
      const packageData = await this.parsePackageJson();
      const dockerfile = await this.parseDockerfile();

      const mainContainer: Container = {
        id: this.generateContainerId('app'),
        name: packageData.systemName || 'application',
        type: 'application',
        technology: dockerfile.technology || 'Unknown',
      };

      containers.push(mainContainer);
    }

    return containers;
  }

  /**
   * Detect system type based on project structure
   */
  private async detectSystemType(): Promise<ProjectMetadata['systemType']> {
    const packageData = await this.parsePackageJson();

    // CLI detection
    if (packageData.hasBin) {
      return 'cli';
    }

    // Library detection
    if (packageData.hasMain && packageData.hasTypes && !packageData.hasBin) {
      return 'library';
    }

    // Microservice vs Monolith detection
    const hasDockerCompose = await fs.pathExists(
      path.join(this.rootDir, 'docker-compose.yml')
    );
    const containers = await this.parseDockerCompose();

    if (hasDockerCompose && containers.length > 1) {
      return 'microservice';
    }

    // Check for services directory (common in microservices)
    const servicesDir = path.join(this.rootDir, 'services');
    const hasServicesDir = await fs.pathExists(servicesDir);

    if (hasServicesDir) {
      const entries = await fs.readdir(servicesDir);
      const serviceDirs = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(servicesDir, entry);
          const stat = await fs.stat(fullPath);
          return stat.isDirectory();
        })
      );

      if (serviceDirs.filter(Boolean).length > 1) {
        return 'microservice';
      }
    }

    // Default to monolith
    return 'monolith';
  }

  /**
   * Detect technology stack
   */
  private async detectTechnologyStack(): Promise<TechnologyStack> {
    const packageData = await this.parsePackageJson();
    const dependencies = packageData.dependencies;

    const frameworks: string[] = [];
    const databases: string[] = [];
    const infrastructure: string[] = [];

    // Detect frameworks
    if (dependencies.express) frameworks.push('Express');
    if (dependencies.fastify) frameworks.push('Fastify');
    if (dependencies.koa) frameworks.push('Koa');
    if (dependencies.react) frameworks.push('React');
    if (dependencies.vue) frameworks.push('Vue');
    if (dependencies.angular) frameworks.push('Angular');
    if (dependencies.next) frameworks.push('Next.js');
    if (dependencies.nest || dependencies['@nestjs/core']) frameworks.push('NestJS');

    // Detect databases
    if (dependencies.pg) databases.push('PostgreSQL');
    if (dependencies.mysql || dependencies.mysql2) databases.push('MySQL');
    if (dependencies.mongodb || dependencies.mongoose) databases.push('MongoDB');
    if (dependencies.redis) databases.push('Redis');
    if (dependencies['better-sqlite3'] || dependencies.sqlite3)
      databases.push('SQLite');

    // Detect infrastructure
    if (dependencies.docker || dependencies.dockerode)
      infrastructure.push('Docker');
    if (dependencies.kubernetes || dependencies['@kubernetes/client-node'])
      infrastructure.push('Kubernetes');
    if (dependencies['aws-sdk']) infrastructure.push('AWS');

    // Determine primary technology
    let primary = 'TypeScript';
    let runtime = 'Node.js';

    const hasTsConfig = await fs.pathExists(path.join(this.rootDir, 'tsconfig.json'));
    if (!hasTsConfig) {
      primary = 'JavaScript';
    }

    // Check for other runtimes
    const pyRequirements = await fs.pathExists(
      path.join(this.rootDir, 'requirements.txt')
    );
    const goMod = await fs.pathExists(path.join(this.rootDir, 'go.mod'));
    const cargoToml = await fs.pathExists(path.join(this.rootDir, 'Cargo.toml'));

    if (pyRequirements) {
      primary = 'Python';
      runtime = 'Python';
    } else if (goMod) {
      primary = 'Go';
      runtime = 'Go';
    } else if (cargoToml) {
      primary = 'Rust';
      runtime = 'Rust';
    }

    return {
      primary,
      runtime,
      frameworks,
      databases,
      infrastructure,
    };
  }

  /**
   * Detect architectural layers from directory structure
   */
  private async detectLayers(): Promise<string[]> {
    const layers: string[] = [];

    const layerDirs = [
      'controllers',
      'services',
      'repositories',
      'models',
      'routes',
      'middleware',
      'utils',
      'helpers',
      'views',
      'components',
      'domain',
      'infrastructure',
      'application',
      'presentation',
    ];

    for (const layerDir of layerDirs) {
      const layerPath = path.join(this.rootDir, 'src', layerDir);
      const exists = await fs.pathExists(layerPath);

      if (exists) {
        layers.push(layerDir);
      }
    }

    return layers;
  }

  /**
   * Generate container ID
   */
  private generateContainerId(name: string): string {
    return createHash('md5').update(name).digest('hex').substring(0, 8);
  }

  /**
   * Get project root directory
   */
  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Set project root directory
   */
  setRootDir(rootDir: string): void {
    this.rootDir = rootDir;
  }
}
