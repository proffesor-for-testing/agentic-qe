/** npm SemVer is the single oracle for plugin versions and ranges. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const semver = require('semver') as {
  valid(version: string): string | null;
  validRange(range: string): string | null;
  compare(a: string, b: string): number;
  satisfies(version: string, range: string): boolean;
};
// Bundled CLI chunks are one level deeper than emitted library modules.
// Reuse the package version injected by the existing CLI/MCP build scripts.
declare const __CLI_VERSION__: string;
declare const __MCP_VERSION__: string;
export const AQE_VERSION = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__
  : typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__
    : (require('../../package.json') as { version: string }).version;
// semver.valid drops build metadata; retain valid metadata but reject normalized
// prefixes/whitespace so cache directory names remain canonical.
// Cached manifests are untrusted JSON (older releases admitted a non-string
// minAqeVersion), so a non-string must be rejected here rather than throw.
export const validVersion = (value: unknown): boolean =>
  typeof value === 'string' && semver.valid(value) === value.split('+')[0];
export const validRange = (value: string): boolean => semver.validRange(value) !== null;
export const satisfiesVersion = (version: string, range: string): boolean => semver.satisfies(version, range);
export const compareVersions = (a: string, b: string): number => semver.compare(a, b);
/** Equal-precedence build metadata has a stable lexical tie-break, not higher precedence. */
export const newestVersionFirst = (a: string, b: string): number =>
  compareVersions(b, a) || a.localeCompare(b);
export interface PluginVersionFailure {
  code: 'INVALID_PLUGIN_VERSION' | 'INVALID_DEPENDENCY_RANGE' | 'MISSING_DEPENDENCY'
    | 'DEPENDENCY_CYCLE' | 'UNSATISFIED_DEPENDENCY_RANGE' | 'AQE_VERSION_INCOMPATIBLE' | 'RESOLUTION_LIMIT';
  plugin: string;
  message: string;
}
