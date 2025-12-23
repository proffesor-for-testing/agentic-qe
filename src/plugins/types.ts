/**
 * Plugin System Types
 * Phase 3 B2: Extensible Test Framework Adapters
 *
 * Provides type definitions for the plugin architecture enabling:
 * - Hot-swappable test framework adapters
 * - Community plugin development
 * - Enterprise customization
 */

/**
 * Plugin metadata for identification and compatibility
 */
export interface PluginMetadata {
  /** Unique plugin identifier (e.g., 'playwright-adapter') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version (e.g., '1.0.0') */
  version: string;

  /** Plugin description */
  description: string;

  /** Plugin author */
  author: string;

  /** Plugin homepage or repository URL */
  homepage?: string;

  /** Plugin license */
  license?: string;

  /** Keywords for discovery */
  keywords?: string[];

  /** Minimum agentic-qe version required */
  minAgenticQEVersion: string;

  /** Maximum agentic-qe version supported (optional) */
  maxAgenticQEVersion?: string;

  /** Plugin dependencies (other plugins) */
  dependencies?: PluginDependency[];

  /** Plugin category */
  category: PluginCategory;

  /** Whether plugin is enabled by default */
  enabledByDefault?: boolean;
}

/**
 * Plugin dependency specification
 */
export interface PluginDependency {
  /** Plugin ID */
  pluginId: string;

  /** Version requirement (semver range) */
  versionRange: string;

  /** Whether dependency is optional */
  optional?: boolean;
}

/**
 * Plugin categories
 */
export enum PluginCategory {
  /** Test framework adapters (Playwright, Vitest, Cypress) */
  TEST_FRAMEWORK = 'test-framework',

  /** Test generation strategies */
  TEST_GENERATOR = 'test-generator',

  /** Coverage analysis tools */
  COVERAGE = 'coverage',

  /** Reporting and output formats */
  REPORTER = 'reporter',

  /** MCP tool integrations */
  MCP_TOOLS = 'mcp-tools',

  /** CI/CD integrations */
  CI_CD = 'ci-cd',

  /** IDE integrations */
  IDE = 'ide',

  /** Custom agent extensions */
  AGENT_EXTENSION = 'agent-extension',

  /** Utility plugins */
  UTILITY = 'utility',
}

/**
 * Plugin lifecycle state
 */
export enum PluginState {
  /** Plugin discovered but not loaded */
  DISCOVERED = 'discovered',

  /** Plugin is loading */
  LOADING = 'loading',

  /** Plugin loaded but not activated */
  LOADED = 'loaded',

  /** Plugin is activating */
  ACTIVATING = 'activating',

  /** Plugin active and ready */
  ACTIVE = 'active',

  /** Plugin is deactivating */
  DEACTIVATING = 'deactivating',

  /** Plugin deactivated */
  INACTIVE = 'inactive',

  /** Plugin failed to load or activate */
  ERROR = 'error',

  /** Plugin unloaded */
  UNLOADED = 'unloaded',
}

/**
 * Plugin context provided during lifecycle events
 */
export interface PluginContext {
  /** Plugin's own metadata */
  metadata: PluginMetadata;

  /** Agentic QE version */
  agenticQEVersion: string;

  /** Plugin manager API for inter-plugin communication */
  pluginManager: PluginManagerAPI;

  /** Logger for plugin */
  logger: PluginLogger;

  /** Configuration store */
  config: PluginConfigStore;

  /** Event bus for plugin events */
  events: PluginEventBus;

  /** Storage API for plugin data */
  storage: PluginStorage;
}

/**
 * Plugin manager API exposed to plugins
 */
export interface PluginManagerAPI {
  /** Get another plugin by ID */
  getPlugin<T extends Plugin = Plugin>(id: string): T | undefined;

  /** Check if plugin is available */
  hasPlugin(id: string): boolean;

  /** Get all plugins of a category */
  getPluginsByCategory(category: PluginCategory): Plugin[];

  /** Register a service that other plugins can use */
  registerService<T>(name: string, service: T): void;

  /** Get a registered service */
  getService<T>(name: string): T | undefined;

  /** Request plugin activation */
  requestActivation(pluginId: string): Promise<void>;
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin configuration store
 */
export interface PluginConfigStore {
  /** Get configuration value */
  get<T>(key: string, defaultValue?: T): T | undefined;

  /** Set configuration value */
  set<T>(key: string, value: T): void;

  /** Check if key exists */
  has(key: string): boolean;

  /** Get all configuration */
  getAll(): Record<string, unknown>;

  /** Reset to defaults */
  reset(): void;
}

/**
 * Plugin event bus for inter-plugin communication
 */
export interface PluginEventBus {
  /** Emit an event */
  emit(event: string, data?: unknown): void;

  /** Listen for an event */
  on(event: string, handler: (data: unknown) => void): () => void;

  /** Listen for an event once */
  once(event: string, handler: (data: unknown) => void): () => void;

  /** Remove all listeners for an event */
  off(event: string): void;
}

/**
 * Plugin storage API
 */
export interface PluginStorage {
  /** Get stored value */
  get<T>(key: string): Promise<T | undefined>;

  /** Set stored value */
  set<T>(key: string, value: T): Promise<void>;

  /** Delete stored value */
  delete(key: string): Promise<void>;

  /** List all keys */
  keys(): Promise<string[]>;

  /** Clear all stored data */
  clear(): Promise<void>;
}

/**
 * Core plugin interface that all plugins must implement
 */
export interface Plugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /**
   * Called when plugin is loaded
   * Use for lightweight initialization (no async operations)
   */
  onLoad?(context: PluginContext): void;

  /**
   * Called when plugin is activated
   * Use for heavy initialization, connecting to services, etc.
   */
  onActivate?(context: PluginContext): Promise<void>;

  /**
   * Called when plugin is deactivated
   * Use for cleanup, disconnecting from services, etc.
   */
  onDeactivate?(context: PluginContext): Promise<void>;

  /**
   * Called when plugin is unloaded
   * Use for final cleanup
   */
  onUnload?(context: PluginContext): void;

  /**
   * Called when plugin configuration changes
   */
  onConfigChange?(context: PluginContext, changes: Record<string, unknown>): void;

  /**
   * Health check for the plugin
   * Returns true if plugin is healthy
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * Test framework adapter plugin interface
 * Extends Plugin with test-specific capabilities
 */
export interface TestFrameworkPlugin extends Plugin {
  /** Supported file patterns for this test framework */
  readonly filePatterns: string[];

  /** Framework identifier */
  readonly frameworkId: string;

  /**
   * Generate test code for the framework
   */
  generateTest(spec: TestGenerationSpec): Promise<GeneratedTest>;

  /**
   * Parse existing test file
   */
  parseTestFile(filePath: string, content: string): Promise<ParsedTestFile>;

  /**
   * Execute tests
   */
  executeTests(options: TestExecutionOptions): Promise<TestExecutionResult>;

  /**
   * Get framework-specific configuration
   */
  getFrameworkConfig(): FrameworkConfig;
}

/**
 * Test generation specification
 */
export interface TestGenerationSpec {
  /** Source code to test */
  sourceCode: string;

  /** Source file path */
  sourceFilePath: string;

  /** Test type */
  testType: 'unit' | 'integration' | 'e2e' | 'component';

  /** Target test file path */
  targetFilePath?: string;

  /** Additional context */
  context?: Record<string, unknown>;

  /** Coverage targets */
  coverageTargets?: string[];
}

/**
 * Generated test result
 */
export interface GeneratedTest {
  /** Generated test code */
  code: string;

  /** Suggested file path */
  filePath: string;

  /** Imports required */
  imports: string[];

  /** Dependencies to install */
  dependencies?: { name: string; version: string; dev?: boolean }[];

  /** Test metadata */
  metadata: {
    testCount: number;
    coveredFunctions: string[];
    coverageEstimate: number;
  };
}

/**
 * Parsed test file structure
 */
export interface ParsedTestFile {
  /** Test suites found */
  suites: ParsedTestSuite[];

  /** Imports */
  imports: string[];

  /** File-level setup/teardown */
  hooks: ParsedHook[];
}

/**
 * Parsed test suite
 */
export interface ParsedTestSuite {
  name: string;
  tests: ParsedTest[];
  nestedSuites: ParsedTestSuite[];
  hooks: ParsedHook[];
  line: number;
}

/**
 * Parsed individual test
 */
export interface ParsedTest {
  name: string;
  line: number;
  isSkipped: boolean;
  isOnly: boolean;
  tags?: string[];
}

/**
 * Parsed hook (beforeAll, afterEach, etc.)
 */
export interface ParsedHook {
  type: 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach';
  line: number;
}

/**
 * Test execution options
 */
export interface TestExecutionOptions {
  /** Test files to run */
  testFiles: string[];

  /** Filter by test name pattern */
  testNamePattern?: string;

  /** Run in watch mode */
  watch?: boolean;

  /** Coverage options */
  coverage?: {
    enabled: boolean;
    reporters?: string[];
    threshold?: number;
  };

  /** Parallel execution */
  parallel?: boolean;

  /** Max workers */
  maxWorkers?: number;

  /** Timeout per test */
  timeout?: number;

  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
  /** Overall success */
  success: boolean;

  /** Test results */
  tests: TestResult[];

  /** Duration in ms */
  duration: number;

  /** Coverage data if collected */
  coverage?: CoverageData;

  /** Console output */
  output: string;
}

/**
 * Individual test result
 */
export interface TestResult {
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Coverage data
 */
export interface CoverageData {
  lines: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  statements: { total: number; covered: number; percentage: number };
}

/**
 * Framework-specific configuration
 */
export interface FrameworkConfig {
  /** Config file name (e.g., 'playwright.config.ts') */
  configFileName: string;

  /** Default test directory */
  defaultTestDir: string;

  /** Default config template */
  configTemplate: string;

  /** Required dependencies */
  dependencies: { name: string; version: string; dev?: boolean }[];
}

/**
 * Plugin registration entry
 */
export interface PluginRegistration {
  /** Plugin instance */
  plugin: Plugin;

  /** Current state */
  state: PluginState;

  /** Plugin context */
  context?: PluginContext;

  /** Load timestamp */
  loadedAt?: Date;

  /** Activation timestamp */
  activatedAt?: Date;

  /** Last error */
  lastError?: Error;

  /** Dependencies resolved */
  dependenciesResolved: boolean;
}

/**
 * Plugin discovery result
 */
export interface PluginDiscoveryResult {
  /** Discovered plugins */
  plugins: PluginMetadata[];

  /** Discovery errors */
  errors: { path: string; error: string }[];

  /** Discovery duration */
  duration: number;
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  /** Directories to search for plugins */
  pluginDirs: string[];

  /** Enable hot reload in development */
  hotReload: boolean;

  /** Plugin load timeout in ms */
  loadTimeout: number;

  /** Plugin activation timeout in ms */
  activationTimeout: number;

  /** Enable plugin sandboxing */
  sandboxing: boolean;

  /** Auto-activate plugins on load */
  autoActivate: boolean;

  /** Plugin config overrides */
  pluginConfigs: Record<string, Record<string, unknown>>;
}

/**
 * Plugin manager events
 */
export interface PluginManagerEvents {
  'plugin:discovered': { metadata: PluginMetadata };
  'plugin:loading': { pluginId: string };
  'plugin:loaded': { pluginId: string };
  'plugin:activating': { pluginId: string };
  'plugin:activated': { pluginId: string };
  'plugin:deactivating': { pluginId: string };
  'plugin:deactivated': { pluginId: string };
  'plugin:unloaded': { pluginId: string };
  'plugin:error': { pluginId: string; error: Error };
  'plugin:configChanged': { pluginId: string; changes: Record<string, unknown> };
}

/**
 * Factory function type for creating plugins
 */
export type PluginFactory = () => Plugin;

/**
 * Plugin module export structure
 * Supports multiple export patterns for flexibility
 */
export interface PluginModule {
  /** Default export can be plugin or factory */
  default?: Plugin | PluginFactory;

  /** Named createPlugin factory function */
  createPlugin?: PluginFactory;

  /** Named plugin export */
  plugin?: Plugin;

  /** Optional named export for metadata */
  metadata?: PluginMetadata;
}
