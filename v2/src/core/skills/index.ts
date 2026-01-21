/**
 * Skills Module - Progressive Disclosure System
 * Achieves 98% token reduction by lazy-loading skills on demand
 */

// Core types
export {
  Skill,
  SkillMetadata,
  SkillManifest,
  SkillLoaderConfig,
  SkillUsageStats,
  SkillSearchFilter,
  SkillPriority,
  SkillCategory,
} from './types.js';

// Dynamic Skill Loader
export {
  DynamicSkillLoader,
  getDefaultLoader,
  resetDefaultLoader,
} from './DynamicSkillLoader.js';

// Manifest Generator
export {
  ManifestGenerator,
  ManifestGeneratorConfig,
  generateManifest,
  updateManifest,
  validateManifest,
} from './ManifestGenerator.js';

// Dependency Resolver
export {
  DependencyResolver,
  DependencyResolution,
  DependencyNode,
  ResolverOptions,
  createDependencyResolver,
  visualizeDependencyTree,
} from './DependencyResolver.js';
