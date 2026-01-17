/**
 * Integration Testing MCP Tool Types
 * Defines types for integration test orchestration, contract validation, and dependency checking
 */

/**
 * Execution mode for integration tests
 */
export type ExecutionMode = 'sequential' | 'parallel';

/**
 * Test environment
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Contract type for validation
 */
export type ContractType = 'openapi' | 'graphql' | 'message-queue' | 'grpc';

/**
 * Dependency status
 */
export type DependencyStatus = 'healthy' | 'unhealthy' | 'degraded' | 'timeout' | 'unknown';

/**
 * Parameters for integration test orchestration
 */
export interface IntegrationTestOrchestrateParams {
  /**
   * List of services involved in the integration test
   */
  services: string[];

  /**
   * Test scenario name or identifier
   */
  scenario: string;

  /**
   * Execution mode (sequential or parallel)
   * @default 'parallel'
   */
  executionMode?: ExecutionMode;

  /**
   * Test environment
   * @default 'development'
   */
  environment?: Environment;

  /**
   * Test data to use
   */
  testData?: Record<string, unknown>;

  /**
   * Timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Number of retry attempts
   * @default 0
   */
  retryCount?: number;

  /**
   * Additional configuration
   */
  config?: Record<string, unknown>;
}

/**
 * Test result for a single test case
 */
export interface TestResult {
  /**
   * Test name
   */
  name: string;

  /**
   * Test status
   */
  status: 'passed' | 'failed' | 'skipped';

  /**
   * Execution time in milliseconds
   */
  duration: number;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Test assertions
   */
  assertions?: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Result of integration test orchestration
 */
export interface IntegrationTestOrchestrateResult {
  /**
   * Overall success status
   */
  success: boolean;

  /**
   * Test scenario
   */
  scenario: string;

  /**
   * Services tested
   */
  services: string[];

  /**
   * Execution mode used
   */
  executionMode: ExecutionMode;

  /**
   * Environment used
   */
  environment: Environment;

  /**
   * Test results
   */
  testResults?: TestResult[];

  /**
   * Total execution time in milliseconds
   */
  executionTime: number;

  /**
   * Number of retry attempts made
   */
  retries: number;

  /**
   * Test data used
   */
  testData?: Record<string, unknown>;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Warnings
   */
  warnings?: string[];

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for contract validation
 */
export interface ContractValidateParams {
  /**
   * Service providing the contract
   */
  provider: string;

  /**
   * Service consuming the contract
   */
  consumer: string;

  /**
   * Type of contract
   */
  contractType: ContractType;

  /**
   * Contract specification
   */
  contractSpec: Record<string, unknown>;

  /**
   * Previous contract version for comparison
   */
  previousContract?: Record<string, unknown>;

  /**
   * Consumer version for compatibility check
   */
  consumerVersion?: string;

  /**
   * Enable strict validation
   * @default false
   */
  strictMode?: boolean;

  /**
   * Additional validation options
   */
  options?: Record<string, unknown>;
}

/**
 * Contract validation error
 */
export interface ContractValidationError {
  /**
   * Error path in contract
   */
  path: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Error severity
   */
  severity: 'error' | 'warning';

  /**
   * Suggested fix
   */
  suggestion?: string;
}

/**
 * Breaking change detected
 */
export interface BreakingChange {
  /**
   * Type of breaking change
   */
  type: 'removed' | 'modified' | 'incompatible';

  /**
   * Path to the changed element
   */
  path: string;

  /**
   * Description of the change
   */
  description: string;

  /**
   * Old value
   */
  oldValue?: unknown;

  /**
   * New value
   */
  newValue?: unknown;
}

/**
 * Result of contract validation
 */
export interface ContractValidateResult {
  /**
   * Whether the contract is valid
   */
  valid: boolean;

  /**
   * Provider service
   */
  provider: string;

  /**
   * Consumer service
   */
  consumer: string;

  /**
   * Contract type
   */
  contractType: ContractType;

  /**
   * Validation errors
   */
  errors?: ContractValidationError[];

  /**
   * Breaking changes detected
   */
  breakingChanges?: BreakingChange[];

  /**
   * Whether versions are compatible
   */
  versionCompatible?: boolean;

  /**
   * Strict mode enabled
   */
  strictMode?: boolean;

  /**
   * Validation details
   */
  validationDetails?: {
    /**
     * Number of endpoints validated
     */
    endpointsValidated?: number;

    /**
     * Number of schemas validated
     */
    schemasValidated?: number;

    /**
     * Validation timestamp
     */
    timestamp: string;
  };

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for dependency health check
 */
export interface DependencyCheckParams {
  /**
   * List of services to check
   */
  services: string[];

  /**
   * Timeout for each check in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Include detailed health information
   * @default false
   */
  detailed?: boolean;

  /**
   * Number of retry attempts
   * @default 1
   */
  retryCount?: number;

  /**
   * Check dependencies in parallel
   * @default true
   */
  parallel?: boolean;

  /**
   * Critical services that must be healthy
   */
  criticalServices?: string[];

  /**
   * Additional check configuration
   */
  config?: Record<string, unknown>;
}

/**
 * Health check result for a single dependency
 */
export interface DependencyHealth {
  /**
   * Service name
   */
  name: string;

  /**
   * Health status
   */
  status: DependencyStatus;

  /**
   * Response time in milliseconds
   */
  responseTime: number;

  /**
   * Number of retries attempted
   */
  retries: number;

  /**
   * Error message if unhealthy
   */
  error?: string;

  /**
   * Detailed health information
   */
  details?: {
    /**
     * Service version
     */
    version?: string;

    /**
     * Uptime in seconds
     */
    uptime?: number;

    /**
     * Memory usage
     */
    memory?: {
      used: number;
      total: number;
      percentage: number;
    };

    /**
     * CPU usage percentage
     */
    cpu?: number;

    /**
     * Custom metrics
     */
    metrics?: Record<string, unknown>;
  };

  /**
   * Last check timestamp
   */
  timestamp: string;
}

/**
 * Result of dependency health check
 */
export interface DependencyCheckResult {
  /**
   * Overall health status
   */
  healthy: boolean;

  /**
   * Health check results for each dependency
   */
  dependencies: DependencyHealth[];

  /**
   * Overall health score (0-100)
   */
  healthScore: number;

  /**
   * Critical failures
   */
  criticalFailures?: string[];

  /**
   * Total check duration in milliseconds
   */
  checkDuration: number;

  /**
   * Whether checks were run in parallel
   */
  parallel: boolean;

  /**
   * Check timestamp
   */
  timestamp: string;

  /**
   * Metadata
   */
  metadata?: Record<string, unknown>;
}
