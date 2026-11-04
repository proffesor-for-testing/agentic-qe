/**
 * #1350 review: the node_modules exemption of 'refuse-outside-node-modules'
 * is judged on where the opened descriptor really points, not on the
 * realpath resolved before the open. Here a directory under node_modules is
 * swapped for a symlink to `src` between the realpath and the open, so the
 * open lands on a hardlink outside node_modules; it must be refused. A check
 * on the pre-open realpath would accept it and return the outside content.
 * Linux: the opened location comes from /proc/self/fd.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const hook = vi.hoisted(() => ({ beforeOpen: null as null | ((p: string) => void) }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      hook.beforeOpen?.(String(args[0]));
      return actual.open(...args);
    },
  };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      hook.beforeOpen?.(String(args[0]));
      return actual.openSync(...args);
    },
  };
});

const { readConfinedText, readConfinedTextSync } = await import('../../../../src/shared/io/confined-read');

const SECRET = 'OUTSIDE_SECRET_SWAP_1350';
const linux = process.platform === 'linux' && fs.existsSync('/proc/self/fd');

describe.runIf(linux)('node_modules exemption survives a directory swap (#1350)', () => {
  let base: string;
  let root: string;
  let pkg: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-swap-')));
    root = path.join(base, 'proj');
    pkg = path.join(root, 'node_modules', 'evil');
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(base, 'outside'));
    // A store-like hardlink under node_modules (exempt) ...
    fs.writeFileSync(path.join(base, 'outside', 'store.js'), 'module.exports = 1;\n');
    fs.linkSync(path.join(base, 'outside', 'store.js'), path.join(pkg, 'x.js'));
    // ... and a planted hardlink with the same name in src (not exempt).
    fs.writeFileSync(path.join(base, 'outside', 'secret.js'), `const k = "${SECRET}";\n`);
    fs.linkSync(path.join(base, 'outside', 'secret.js'), path.join(root, 'src', 'x.js'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    hook.beforeOpen = null;
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  /** Swap node_modules/evil for a symlink to src just before the confined open. */
  const swapOnOpen = () => {
    hook.beforeOpen = (opened) => {
      if (opened !== path.join(pkg, 'x.js')) return;
      hook.beforeOpen = null;
      fs.renameSync(pkg, `${pkg}-old`);
      fs.symlinkSync(path.join(root, 'src'), pkg);
    };
  };

  const policy = { hardlinks: 'refuse-outside-node-modules' as const };

  it('reads the exempt file when nothing is swapped', async () => {
    await expect(readConfinedText(path.join(pkg, 'x.js'), policy)).resolves.toContain('module.exports');
  });

  it('refuses the swapped-in hardlink (async)', async () => {
    swapOnOpen();
    const read = readConfinedText(path.join(pkg, 'x.js'), policy);
    await expect(read).rejects.toMatchObject({ reason: 'hardlinked' });
    expect(hook.beforeOpen).toBeNull(); // the swap really happened
  });

  it('refuses the swapped-in hardlink (sync)', () => {
    swapOnOpen();
    expect(() => readConfinedTextSync(path.join(pkg, 'x.js'), policy)).toThrow(/hardlinked/);
    expect(hook.beforeOpen).toBeNull();
  });
});
