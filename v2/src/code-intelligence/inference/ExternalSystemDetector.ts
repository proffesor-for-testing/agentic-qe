import { promises as fs } from 'fs';
import path from 'path';
import type { ExternalSystem, ExternalSystemMapping } from './types';

/**
 * Detects external systems and dependencies for C4 Context diagrams
 */
export class ExternalSystemDetector {
  private static readonly PACKAGE_MAPPINGS: ExternalSystemMapping[] = [
    // Databases
    {
      packagePattern: /^(pg|postgres)$/,
      systemType: 'database',
      technology: 'PostgreSQL',
      relationship: 'stores_data_in',
      description: 'PostgreSQL relational database',
    },
    {
      packagePattern: /^mysql2?$/,
      systemType: 'database',
      technology: 'MySQL',
      relationship: 'stores_data_in',
      description: 'MySQL relational database',
    },
    {
      packagePattern: /^mongodb$/,
      systemType: 'database',
      technology: 'MongoDB',
      relationship: 'stores_data_in',
      description: 'MongoDB document database',
    },
    {
      packagePattern: /^mongoose$/,
      systemType: 'database',
      technology: 'MongoDB',
      relationship: 'stores_data_in',
      description: 'MongoDB via Mongoose ODM',
    },
    {
      packagePattern: /^sqlite3$/,
      systemType: 'database',
      technology: 'SQLite',
      relationship: 'stores_data_in',
      description: 'SQLite embedded database',
    },
    {
      packagePattern: /^oracledb$/,
      systemType: 'database',
      technology: 'Oracle',
      relationship: 'stores_data_in',
      description: 'Oracle database',
    },

    // Cache systems
    {
      packagePattern: /^(redis|ioredis)$/,
      systemType: 'cache',
      technology: 'Redis',
      relationship: 'uses',
      description: 'Redis in-memory cache',
    },
    {
      packagePattern: /^memcached$/,
      systemType: 'cache',
      technology: 'Memcached',
      relationship: 'uses',
      description: 'Memcached distributed cache',
    },

    // Message queues
    {
      packagePattern: /^amqplib$/,
      systemType: 'queue',
      technology: 'RabbitMQ',
      relationship: 'sends_messages_to',
      description: 'RabbitMQ message broker',
    },
    {
      packagePattern: /^kafkajs$/,
      systemType: 'queue',
      technology: 'Apache Kafka',
      relationship: 'sends_messages_to',
      description: 'Apache Kafka event streaming',
    },
    {
      packagePattern: /^bull$/,
      systemType: 'queue',
      technology: 'Bull Queue',
      relationship: 'sends_messages_to',
      description: 'Bull job queue (Redis-based)',
    },
    {
      packagePattern: /^bee-queue$/,
      systemType: 'queue',
      technology: 'Bee Queue',
      relationship: 'sends_messages_to',
      description: 'Bee job queue (Redis-based)',
    },

    // AI/ML APIs
    {
      packagePattern: /^@anthropic-ai\/sdk$/,
      systemType: 'api',
      technology: 'Anthropic Claude',
      relationship: 'uses',
      description: 'Anthropic Claude AI API',
    },
    {
      packagePattern: /^openai$/,
      systemType: 'api',
      technology: 'OpenAI',
      relationship: 'uses',
      description: 'OpenAI API (GPT, DALL-E, etc.)',
    },
    {
      packagePattern: /^@google-ai\/generativelanguage$/,
      systemType: 'api',
      technology: 'Google AI',
      relationship: 'uses',
      description: 'Google Generative AI API',
    },

    // Cloud providers - AWS
    {
      packagePattern: /^(aws-sdk|@aws-sdk\/.+)$/,
      systemType: 'storage',
      technology: 'AWS',
      relationship: 'uses',
      description: 'Amazon Web Services',
    },
    {
      packagePattern: /^@aws-sdk\/client-s3$/,
      systemType: 'storage',
      technology: 'AWS S3',
      relationship: 'uses',
      description: 'AWS S3 object storage',
    },
    {
      packagePattern: /^@aws-sdk\/client-dynamodb$/,
      systemType: 'database',
      technology: 'AWS DynamoDB',
      relationship: 'stores_data_in',
      description: 'AWS DynamoDB NoSQL database',
    },

    // Cloud providers - Google Cloud
    {
      packagePattern: /^@google-cloud\/.+$/,
      systemType: 'storage',
      technology: 'Google Cloud',
      relationship: 'uses',
      description: 'Google Cloud Platform',
    },
    {
      packagePattern: /^@google-cloud\/storage$/,
      systemType: 'storage',
      technology: 'Google Cloud Storage',
      relationship: 'uses',
      description: 'Google Cloud Storage',
    },
    {
      packagePattern: /^@google-cloud\/firestore$/,
      systemType: 'database',
      technology: 'Firestore',
      relationship: 'stores_data_in',
      description: 'Google Cloud Firestore',
    },

    // Cloud providers - Azure
    {
      packagePattern: /^@azure\/.+$/,
      systemType: 'storage',
      technology: 'Azure',
      relationship: 'uses',
      description: 'Microsoft Azure',
    },
    {
      packagePattern: /^@azure\/storage-blob$/,
      systemType: 'storage',
      technology: 'Azure Blob Storage',
      relationship: 'uses',
      description: 'Azure Blob Storage',
    },

    // Authentication
    {
      packagePattern: /^passport$/,
      systemType: 'auth',
      technology: 'Passport.js',
      relationship: 'authenticates_with',
      description: 'Authentication middleware',
    },
    {
      packagePattern: /^@auth0\/auth0-spa-js$/,
      systemType: 'auth',
      technology: 'Auth0',
      relationship: 'authenticates_with',
      description: 'Auth0 authentication service',
    },
    {
      packagePattern: /^jsonwebtoken$/,
      systemType: 'auth',
      technology: 'JWT',
      relationship: 'authenticates_with',
      description: 'JSON Web Token authentication',
    },

    // Monitoring & Analytics
    {
      packagePattern: /^@sentry\/node$/,
      systemType: 'monitoring',
      technology: 'Sentry',
      relationship: 'uses',
      description: 'Sentry error monitoring',
    },
    {
      packagePattern: /^newrelic$/,
      systemType: 'monitoring',
      technology: 'New Relic',
      relationship: 'uses',
      description: 'New Relic APM',
    },
    {
      packagePattern: /^datadog-metrics$/,
      systemType: 'monitoring',
      technology: 'Datadog',
      relationship: 'uses',
      description: 'Datadog monitoring',
    },
    {
      packagePattern: /^prom-client$/,
      systemType: 'monitoring',
      technology: 'Prometheus',
      relationship: 'uses',
      description: 'Prometheus metrics',
    },

    // HTTP clients (generic API)
    {
      packagePattern: /^axios$/,
      systemType: 'api',
      technology: 'HTTP Client',
      relationship: 'uses',
      description: 'External HTTP APIs',
    },
    {
      packagePattern: /^(node-)?fetch$/,
      systemType: 'api',
      technology: 'HTTP Client',
      relationship: 'uses',
      description: 'External HTTP APIs',
    },
    {
      packagePattern: /^got$/,
      systemType: 'api',
      technology: 'HTTP Client',
      relationship: 'uses',
      description: 'External HTTP APIs',
    },

    // Email services
    {
      packagePattern: /^nodemailer$/,
      systemType: 'api',
      technology: 'Email Service',
      relationship: 'uses',
      description: 'Email delivery service',
    },
    {
      packagePattern: /^@sendgrid\/mail$/,
      systemType: 'api',
      technology: 'SendGrid',
      relationship: 'uses',
      description: 'SendGrid email service',
    },

    // Payment gateways
    {
      packagePattern: /^stripe$/,
      systemType: 'api',
      technology: 'Stripe',
      relationship: 'uses',
      description: 'Stripe payment processing',
    },
    {
      packagePattern: /^paypal-rest-sdk$/,
      systemType: 'api',
      technology: 'PayPal',
      relationship: 'uses',
      description: 'PayPal payment processing',
    },

    // Search engines
    {
      packagePattern: /^@elastic\/elasticsearch$/,
      systemType: 'database',
      technology: 'Elasticsearch',
      relationship: 'uses',
      description: 'Elasticsearch search engine',
    },
    {
      packagePattern: /^algoliasearch$/,
      systemType: 'api',
      technology: 'Algolia',
      relationship: 'uses',
      description: 'Algolia search service',
    },
  ];

  private static readonly ENV_PATTERNS: Array<{
    pattern: RegExp;
    systemType: ExternalSystem['type'];
    technology: string;
    relationship: ExternalSystem['relationship'];
  }> = [
    // Database URLs
    {
      pattern: /^(DATABASE_URL|POSTGRES_|PG_)/i,
      systemType: 'database',
      technology: 'PostgreSQL',
      relationship: 'stores_data_in',
    },
    {
      pattern: /^MYSQL_/i,
      systemType: 'database',
      technology: 'MySQL',
      relationship: 'stores_data_in',
    },
    {
      pattern: /^MONGO(DB)?_/i,
      systemType: 'database',
      technology: 'MongoDB',
      relationship: 'stores_data_in',
    },
    {
      pattern: /^REDIS_/i,
      systemType: 'cache',
      technology: 'Redis',
      relationship: 'uses',
    },

    // API keys
    {
      pattern: /^ANTHROPIC_/i,
      systemType: 'api',
      technology: 'Anthropic Claude',
      relationship: 'uses',
    },
    {
      pattern: /^OPENAI_/i,
      systemType: 'api',
      technology: 'OpenAI',
      relationship: 'uses',
    },
    {
      pattern: /^STRIPE_/i,
      systemType: 'api',
      technology: 'Stripe',
      relationship: 'uses',
    },
    {
      pattern: /^SENDGRID_/i,
      systemType: 'api',
      technology: 'SendGrid',
      relationship: 'uses',
    },
    {
      pattern: /^AWS_/i,
      systemType: 'storage',
      technology: 'AWS',
      relationship: 'uses',
    },
    {
      pattern: /^GOOGLE_CLOUD_/i,
      systemType: 'storage',
      technology: 'Google Cloud',
      relationship: 'uses',
    },
    {
      pattern: /^AZURE_/i,
      systemType: 'storage',
      technology: 'Azure',
      relationship: 'uses',
    },

    // Monitoring
    {
      pattern: /^SENTRY_/i,
      systemType: 'monitoring',
      technology: 'Sentry',
      relationship: 'uses',
    },
    {
      pattern: /^NEW_RELIC_/i,
      systemType: 'monitoring',
      technology: 'New Relic',
      relationship: 'uses',
    },
    {
      pattern: /^DATADOG_/i,
      systemType: 'monitoring',
      technology: 'Datadog',
      relationship: 'uses',
    },

    // Authentication
    {
      pattern: /^AUTH0_/i,
      systemType: 'auth',
      technology: 'Auth0',
      relationship: 'authenticates_with',
    },
  ];

  constructor(private readonly rootDir: string) {}

  /**
   * Detect all external systems used by the project
   */
  async detect(): Promise<ExternalSystem[]> {
    const systems: ExternalSystem[] = [];

    // Analyze package.json for dependencies
    const packageSystems = await this.analyzePackageJson();
    systems.push(...packageSystems);

    // Analyze .env files for external system hints
    const envSystems = await this.analyzeEnvFiles();
    systems.push(...envSystems);

    // Deduplicate and return
    return this.deduplicateSystems(systems);
  }

  /**
   * Analyze package.json dependencies to identify external systems
   */
  private async analyzePackageJson(): Promise<ExternalSystem[]> {
    const systems: ExternalSystem[] = [];
    const packageJsonPath = path.join(this.rootDir, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [packageName] of Object.entries(allDependencies)) {
        for (const mapping of ExternalSystemDetector.PACKAGE_MAPPINGS) {
          if (mapping.packagePattern.test(packageName)) {
            systems.push({
              id: this.generateSystemId(mapping.technology, mapping.systemType),
              name: mapping.technology,
              type: mapping.systemType,
              technology: mapping.technology,
              relationship: mapping.relationship,
              description: mapping.description,
            });
            break; // Only match first pattern
          }
        }
      }
    } catch (error) {
      // package.json might not exist or be malformed
      // This is not critical, just skip
    }

    return systems;
  }

  /**
   * Analyze .env and .env.example files for external system hints
   */
  private async analyzeEnvFiles(): Promise<ExternalSystem[]> {
    const systems: ExternalSystem[] = [];
    const envFiles = ['.env', '.env.example', '.env.local', '.env.development'];

    for (const envFile of envFiles) {
      const envPath = path.join(this.rootDir, envFile);

      try {
        const content = await fs.readFile(envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          // Skip comments and empty lines
          if (line.trim().startsWith('#') || !line.trim()) {
            continue;
          }

          // Extract variable name
          const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
          if (!match) {
            continue;
          }

          const varName = match[1];

          // Check against patterns
          for (const envPattern of ExternalSystemDetector.ENV_PATTERNS) {
            if (envPattern.pattern.test(varName)) {
              systems.push({
                id: this.generateSystemId(envPattern.technology, envPattern.systemType),
                name: envPattern.technology,
                type: envPattern.systemType,
                technology: envPattern.technology,
                relationship: envPattern.relationship,
                description: `Detected from environment variable: ${varName}`,
              });
              break; // Only match first pattern
            }
          }
        }
      } catch (error) {
        // File might not exist, continue
      }
    }

    return systems;
  }

  /**
   * Deduplicate systems by ID, merging descriptions
   */
  private deduplicateSystems(systems: ExternalSystem[]): ExternalSystem[] {
    const systemMap = new Map<string, ExternalSystem>();

    for (const system of systems) {
      const existing = systemMap.get(system.id);
      if (existing) {
        // Merge descriptions if different
        if (system.description && system.description !== existing.description) {
          existing.description = existing.description
            ? `${existing.description}; ${system.description}`
            : system.description;
        }
      } else {
        systemMap.set(system.id, { ...system });
      }
    }

    return Array.from(systemMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  /**
   * Generate a unique system ID based on technology and type
   */
  private generateSystemId(technology: string, type: string): string {
    const normalized = technology.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `external-${type}-${normalized}`;
  }
}
