import type { DomainPlugin, PluginLoader } from '../../kernel/interfaces.js';
import type { DomainName } from '../../shared/types/index.js';

/** Supply the Queen with the actual plugin instances that execute CLI tasks. */
export async function loadCLIDomainPlugins(loader: PluginLoader): Promise<Map<DomainName, DomainPlugin>> {
  await loader.loadAll();
  const plugins = new Map<DomainName, DomainPlugin>();
  for (const domain of loader.getLoaded()) {
    // load() returns the cached instance after loadAll(), including dependencies.
    plugins.set(domain, await loader.load(domain));
  }
  return plugins;
}
