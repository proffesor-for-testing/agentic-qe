/** Constraint-aware plugin selection followed by dependency-safe ordering. */
import type { QEPluginManifest } from './manifest';
import {
  AQE_VERSION, validVersion, validRange, compareVersions, newestVersionFirst,
  satisfiesVersion, type PluginVersionFailure,
} from './version-policy';
export interface ResolvedPlugin { manifest: QEPluginManifest; order: number; }
export interface ResolutionResult {
  ordered: ResolvedPlugin[];
  missing: Map<string, string[]>;
  errors: PluginVersionFailure[];
  selectedVersions: Record<string, string>;
  aqeVersion: string;
}
export class PluginResolver {
  constructor(private readonly aqeVersion = AQE_VERSION) {}

  resolve(manifests: QEPluginManifest[], roots?: readonly string[]): ResolutionResult {
    const groups = new Map<string, QEPluginManifest[]>();
    const rejected = new Map<string, PluginVersionFailure[]>();
    for (const manifest of manifests) {
      const candidates = groups.get(manifest.name) ?? [];
      groups.set(manifest.name, candidates);
      const error = this.validateVersions(manifest);
      if (error) rejected.set(manifest.name, [...(rejected.get(manifest.name) ?? []), error]);
      else candidates.push(manifest);
    }
    for (const candidates of groups.values()) {
      candidates.sort((a, b) => newestVersionFirst(a.version, b.version));
    }
    const missing = new Map<string, string[]>();
    const errors: PluginVersionFailure[] = [];
    const result = (ordered: QEPluginManifest[]): ResolutionResult => ({
      ordered: ordered.map((manifest, order) => ({ manifest, order })), missing, errors,
      selectedVersions: Object.fromEntries(ordered.map(m => [m.name, m.version])),
      aqeVersion: this.aqeVersion,
    });
    const names = [...(roots ?? groups.keys())].sort();
    const required = new Set(names);
    const selected = new Map<string, QEPluginManifest>();
    let attempts = 0;
    let limited = false;
    const compatible = (): boolean => {
      for (const manifest of selected.values()) {
        for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
          const chosen = selected.get(dep);
          const candidates = chosen ? [chosen] : groups.get(dep) ?? [];
          if (!candidates.some(candidate => satisfiesVersion(candidate.version, range))) return false;
        }
      }
      return true;
    };
    let cycle: string[] | undefined;
    const findCycle = (): string[] | undefined => {
      const visited = new Set<string>();
      const visiting = new Set<string>();
      const visit = (name: string, path: string[]): string[] | undefined => {
        if (visiting.has(name)) return [...path.slice(path.indexOf(name)), name];
        if (visited.has(name)) return;
        visiting.add(name);
        for (const dependency of Object.keys(selected.get(name)?.dependencies ?? {})) {
          const found = visit(dependency, [...path, name]);
          if (found) return found;
        }
        visiting.delete(name);
        visited.add(name);
        return undefined;
      };
      for (const name of selected.keys()) {
        const found = visit(name, []);
        if (found) return found;
      }
      return undefined;
    };
    const choose = (): boolean => {
      const pending = new Set(names);
      for (const manifest of selected.values()) {
        for (const name of Object.keys(manifest.dependencies ?? {})) pending.add(name);
      }
      const name = [...pending].sort().find(name => !selected.has(name));
      if (!name) {
        const found = findCycle();
        if (found) { cycle = found; return false; }
        return true;
      }
      required.add(name);
      for (const candidate of groups.get(name) ?? []) {
        if (++attempts > 10_000) { limited = true; return false; }
        selected.set(name, candidate);
        if (compatible() && choose()) return true;
        selected.delete(name);
        if (limited) return false;
      }
      return false;
    };
    if (!choose()) {
      if (cycle && !limited) throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`);
      for (const name of required) {
        if (!groups.get(name)?.length) errors.push(...(rejected.get(name) ?? []));
      }
      for (const [name, candidates] of groups) {
        const absent = [...new Set(candidates.flatMap(m => Object.keys(m.dependencies ?? {})))].filter(dep => !groups.has(dep));
        if (absent.length) missing.set(name, absent);
      }
      errors.push({
        code: limited ? 'RESOLUTION_LIMIT' : missing.size ? 'MISSING_DEPENDENCY' : 'UNSATISFIED_DEPENDENCY_RANGE',
        plugin: names.join(', '),
        message: limited ? 'Plugin dependency search exceeded 10000 candidates' : 'No cached plugin selection satisfies all dependency ranges',
      });
      return result([]);
    }
    const ordered: QEPluginManifest[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (name: string, path: string[]): void => {
      if (visited.has(name)) return;
      if (visiting.has(name)) throw new Error(`Dependency cycle detected: ${[...path.slice(path.indexOf(name)), name].join(' -> ')}`);
      visiting.add(name);
      const manifest = selected.get(name)!;
      for (const dep of Object.keys(manifest.dependencies ?? {})) visit(dep, [...path, name]);
      visiting.delete(name); visited.add(name); ordered.push(manifest);
    };
    for (const name of [...selected.keys()].sort()) visit(name, []);
    return result(ordered);
  }

  /** Version-constrained dependencies require versions, not a legacy name-only Set. */
  canLoad(manifest: QEPluginManifest, loaded: ReadonlyMap<string, string> | Set<string>): { canLoad: boolean; missingDeps: string[] } {
    const missingDeps = Object.entries(manifest.dependencies ?? {}).filter(([name, range]) => {
      const version = loaded instanceof Set ? undefined : loaded.get(name);
      return !version || !validRange(range) || !satisfiesVersion(version, range);
    }).map(([name]) => name);
    return { canLoad: !this.validateVersions(manifest) && missingDeps.length === 0, missingDeps };
  }

  private validateVersions(manifest: QEPluginManifest): PluginVersionFailure | undefined {
    if (!validVersion(manifest.version)) return { code: 'INVALID_PLUGIN_VERSION', plugin: manifest.name, message: 'Invalid plugin version' };
    for (const range of Object.values(manifest.dependencies ?? {})) {
      if (!validRange(range)) return { code: 'INVALID_DEPENDENCY_RANGE', plugin: manifest.name, message: 'Invalid dependency range' };
    }
    if (manifest.minAqeVersion && (!validVersion(manifest.minAqeVersion) || !validVersion(this.aqeVersion) || compareVersions(this.aqeVersion, manifest.minAqeVersion) < 0)) {
      return { code: 'AQE_VERSION_INCOMPATIBLE', plugin: manifest.name, message: `Requires AQE ${manifest.minAqeVersion}; running ${this.aqeVersion}` };
    }
    return undefined;
  }
}
