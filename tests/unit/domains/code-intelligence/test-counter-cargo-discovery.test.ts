import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

function installedTool(name: string): string | undefined {
  // Resolve rustup's actual installed binaries before entering the private HOME.
  // `which` is the fallback for system/Homebrew installations without rustup.
  for (const [command, args] of [['rustup', ['which', name]], ['which', [name]]] as const) {
    const result = spawnSync(command, args, { encoding: 'utf-8', timeout: 5000 });
    const path = result.stdout?.trim();
    if (result.status === 0 && path && existsSync(path)) return path;
  }
  return undefined;
}
const cargo = installedTool('cargo');
const rustc = installedTool('rustc');
const rustdoc = installedTool('rustdoc');
const fixtures: string[] = [];
const initialPath = process.env.PATH;

function fixture(source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'aqe cargo discovery '));
  fixtures.push(root);
  for (const directory of ['src', 'bin', 'home', 'tmp', 'target']) mkdirSync(join(root, directory));
  writeFileSync(join(root, 'Cargo.toml'), '[package]\nname="aqe-native-count"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(join(root, 'src', 'lib.rs'), source);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const environment = {
    HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'),
    CARGO_HOME: join(root, 'home', 'cargo'), CARGO_TARGET_DIR: join(root, 'target'),
    CARGO_NET_OFFLINE: 'true', RUSTC: rustc!, RUSTDOC: rustdoc!,
    PATH: dirname(rustc!) + ':/usr/bin:/bin',
  };
  writeFileSync(join(root, 'bin', 'cargo'), '#!/bin/sh\nexec /usr/bin/env -i ' +
    Object.entries(environment).map(([key, value]) => key + '=' + quote(value)).join(' ') +
    ' ' + quote(cargo!) + ' "$@"\n', { mode: 0o755 });
  process.env.PATH = join(root, 'bin') + ':' + (initialPath || '');
  return root;
}

afterEach(() => {
  if (initialPath === undefined) delete process.env.PATH;
  else process.env.PATH = initialPath;
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32' || !cargo || !rustc || !rustdoc)('native Cargo test discovery', () => {
  it('forwards the listing option to libtest and leaves callbacks unexecuted', async () => {
    const root = fixture(`#[test]
      fn first() { std::fs::write("executed", "bad").unwrap(); panic!("must not execute"); }
      #[test]
      fn second() { panic!("must not execute"); }`);
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'cargo', total: 2, unit: 2, integration: 0, e2e: 0 });
    expect(existsSync(join(root, 'executed'))).toBe(false);
  });

  it('preserves a genuinely empty native collection', async () => {
    const root = fixture('pub fn library_function() {}');
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'cargo', total: 0, unit: 0, integration: 0, e2e: 0 });
  });
});
