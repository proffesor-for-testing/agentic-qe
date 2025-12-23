/**
 * Plugin System Module
 * Phase 3 B2: Extensible Test Framework Adapters
 *
 * Provides a plugin architecture for:
 * - Hot-swappable test framework adapters
 * - Community plugin development
 * - Enterprise customization
 *
 * @example
 * ```typescript
 * import { getPluginManager, PluginCategory } from './plugins';
 *
 * // Get plugin manager
 * const manager = getPluginManager();
 * await manager.initialize();
 *
 * // Register a custom plugin
 * await manager.registerPlugin(myPlugin);
 * await manager.activatePlugin('my-plugin');
 *
 * // Get test framework plugins
 * const frameworks = manager.getPluginsByCategory(PluginCategory.TEST_FRAMEWORK);
 * ```
 */

// Core types
export {
  // Plugin interfaces
  Plugin,
  TestFrameworkPlugin,
  PluginMetadata,
  PluginDependency,
  PluginCategory,
  PluginState,
  PluginContext,
  PluginManagerAPI,
  PluginLogger,
  PluginConfigStore,
  PluginEventBus,
  PluginStorage,
  PluginRegistration,
  PluginDiscoveryResult,
  PluginManagerConfig,
  PluginManagerEvents,
  PluginFactory,
  PluginModule,

  // Test framework types
  TestGenerationSpec,
  GeneratedTest,
  ParsedTestFile,
  ParsedTestSuite,
  ParsedTest,
  ParsedHook,
  TestExecutionOptions,
  TestExecutionResult,
  TestResult,
  CoverageData,
  FrameworkConfig,
} from './types';

// Plugin Manager
export {
  PluginManager,
  getPluginManager,
  resetPluginManager,
} from './PluginManager';

// Base plugin class for easier plugin development
export { BasePlugin } from './BasePlugin';

// Reference plugins
export { PlaywrightPlugin } from './adapters/PlaywrightPlugin';
export { VitestPlugin } from './adapters/VitestPlugin';
export { McpToolsPlugin, McpToolCapability } from './adapters/McpToolsPlugin';
