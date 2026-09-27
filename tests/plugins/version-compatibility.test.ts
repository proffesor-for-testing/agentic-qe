import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginCache } from '../../src/plugins/cache';
import { PluginResolver } from '../../src/plugins/resolver';
import { validateManifest, type QEPluginManifest } from '../../src/plugins/manifest';
import { PluginLifecycleManager } from '../../src/plugins/lifecycle';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'aqe-semver-')); dirs.push(dir); return dir; }
function manifest(name = 'parent', version = '1.0.0', dependencies?: Record<string,string>): QEPluginManifest {
  return { name, version, dependencies, description: 'Test plugin', author: 'test', domains: ['test-generation'], entryPoint: 'index.js' };
}
function source(dir: string, m: QEPluginManifest) {
  mkdirSync(dir, {recursive:true}); writeFileSync(join(dir, 'qe-plugin.json'), JSON.stringify(m));
  writeFileSync(join(dir,'index.js'),'throw new Error("must not execute during admission")'); return dir;
}
describe('plugin version compatibility', () => {
  it.each([['2.9.0','2.10.0'], ['2.0.0-rc.1','2.0.0']])('orders %s before %s by semantic precedence', (old, current) => {
    const dir=fixture(); const cache=new PluginCache({cacheDir:join(dir,'cache'),keepVersions:10});
    cache.store(manifest('parent',old),source(join(dir,'old'),manifest('parent',old)));
    cache.store(manifest('parent',current),source(join(dir,'new'),manifest('parent',current)));
    expect(cache.listAll()[0].manifest.version).toBe(current);
  });
  it('rejects invalid versions and ranges, and accepts build metadata', () => {
    expect(validateManifest(manifest('parent','01.0.0')).valid).toBe(false);
    expect(validateManifest(manifest('parent','1.0.0', { child:'potato' })).valid).toBe(false);
    expect(validateManifest({...manifest(),minAqeVersion:'tomorrow'}).valid).toBe(false);
    expect(validateManifest(manifest('parent','1.0.0+build.7')).valid).toBe(true);
  });
  it('rejects unsatisfied ranges with no partial load order', () => {
    const result=new PluginResolver().resolve([manifest('child','1.0.0',{parent:'^2.0.0'}),manifest('parent','1.9.9')]);
    expect(result.ordered).toEqual([]);
  });
  it('selects an older compatible cached candidate', () => {
    const result=new PluginResolver().resolve([manifest('child','1.0.0',{parent:'^1.0.0'}),manifest('parent','1.8.0'),manifest('parent','2.0.0')]);
    expect(result.ordered.map(x=>[x.manifest.name,x.manifest.version])).toEqual([['parent','1.8.0'],['child','1.0.0']]);
  });
  it('rejects conflicting transitive constraints before loading anything', () => {
    const result=new PluginResolver().resolve([manifest('left','1.0.0',{parent:'^1'}),manifest('right','1.0.0',{parent:'^2'}),manifest('parent','1.8.0'),manifest('parent','2.0.0')]);
    expect(result.ordered).toEqual([]);
  });
  it('does not treat a loaded name as proof of version compatibility', () => {
    const resolver=new PluginResolver(); const child=manifest('child','1.0.0',{parent:'^2'});
    expect(resolver.canLoad(child,new Map([['parent','1.9.9']])).canLoad).toBe(false);
    expect(resolver.canLoad(child,new Map([['parent','2.1.0']])).canLoad).toBe(true);
    expect(resolver.canLoad(child,new Set(['parent'])).canLoad).toBe(false);
  });
  it.each([['^2.0.0','2.0.0-rc.1',false],['>=2.0.0-rc.1','2.0.0-rc.2',true],['^0.2','0.3.0',false],['<2','1.9.0',true]])('uses npm range rules %s / %s', (range,version,valid) => {
    const r=new PluginResolver().resolve([manifest('child','1.0.0',{parent:range}),manifest('parent',version)]);
    expect(r.ordered.length>0).toBe(valid);
  });
  it('rejects an incompatible AQE requirement before install and cached startup admission', async () => {
    const dir=fixture();const cache=new PluginCache({cacheDir:join(dir,'cache')});const manager=new PluginLifecycleManager({cache});
    const future={...manifest(),minAqeVersion:'999.0.0'};const src=source(join(dir,'source'),future);
    expect((await manager.install(src)).success).toBe(false);
    expect(cache.listAll()).toEqual([]);
    cache.store(future,src);
    expect(manager.resolveLoadOrder().ordered).toEqual([]);
  });
  it('rejects incompatible dependencies during install without caching the candidate', async () => {
    const dir=fixture();const cache=new PluginCache({cacheDir:join(dir,'cache')});const manager=new PluginLifecycleManager({cache});
    const parent=manifest('parent','1.0.0');cache.store(parent,source(join(dir,'parent'),parent));
    const child=manifest('child','1.0.0',{parent:'^2'});
    expect((await manager.install(source(join(dir,'child'),child))).success).toBe(false);
    expect(cache.has('child','1.0.0')).toBe(false);
  });
  it('installs an independent plugin despite an unrelated broken cached graph', async () => {
    const dir = fixture();
    const cache = new PluginCache({ cacheDir: join(dir, 'cache') });
    const broken = manifest('broken', '1.0.0', { missing: '^1' });
    cache.store(broken, source(join(dir, 'broken'), broken));
    const manager = new PluginLifecycleManager({ cache });
    expect((await manager.install(source(join(dir, 'independent'), manifest('independent')))).success).toBe(true);
    expect(manager.resolveLoadOrder().ordered).toEqual([]);
  });
  it('backtracks from a cyclic candidate to an acyclic compatible version', () => {
    const result = new PluginResolver().resolve([
      manifest('a', '2.0.0', { b: '*' }), manifest('a', '1.0.0'),
      manifest('b', '1.0.0', { a: '*' }),
    ]);
    expect(result.selectedVersions).toEqual({ a: '1.0.0', b: '1.0.0' });
    expect(result.ordered.map(p => p.manifest.name)).toEqual(['a', 'b']);
  });

  it.each([false, true])('kernel only registers admitted cached plugins (incompatible: %s)', async incompatible => {
    const { createKernel } = await import('../../src/kernel/kernel');
    const { DefaultPluginLoader } = await import('../../src/kernel/plugin-loader');
    const dir = fixture();
    const cache = new PluginCache({ cacheDir: join(dir, 'plugins') });
    const plugin = { ...manifest('external'), domains: ['external-test-domain'], minAqeVersion: incompatible ? '999.0.0' : '1.0.0' };
    cache.store(plugin, source(join(dir, 'source'), plugin));
    const registered = vi.spyOn(DefaultPluginLoader.prototype, 'registerFactory');
    const kernel = createKernel({ memoryBackend: 'memory', dataDir: dir, enabledDomains: [], lazyLoading: true,
      enableExperienceBridge: false, enableDreamScheduler: false });
    try {
      await kernel.initialize();
      const external = registered.mock.calls.filter(([name]) => name === 'external-test-domain');
      expect(external).toHaveLength(incompatible ? 0 : 1);
    } finally { await kernel.dispose(); registered.mockRestore(); }
  });

});
