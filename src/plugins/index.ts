/**
 * Agentic QE v3 - Plugin Architecture (IMP-09)
 *
 * External plugin system for QE domain extensions.
 * Supports local, GitHub, and npm plugin sources.
 */

export { type QEPluginManifest, type ManifestValidationResult, validateManifest, parseManifest } from './manifest';
export { PluginCache, type CachedPlugin, type PluginCacheOptions } from './cache';
export { PluginResolver, type ResolvedPlugin, type ResolutionResult } from './resolver';
export { checkPluginSecurity, isNameSafe, type SecurityCheckResult } from './security';
export { PluginLifecycleManager, type InstallResult, type PluginInfo, type PluginLifecycleOptions } from './lifecycle';
export { LocalPluginSource, type PluginSource } from './sources/local';
export { GitHubPluginSource } from './sources/github';
export { NpmPluginSource } from './sources/npm';
