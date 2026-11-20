/**
 * Native module load-failure diagnostics (#1173).
 *
 * npm 12 blocks dependency install scripts by default, so `npm install -g
 * agentic-qe` can leave better-sqlite3 without its compiled binary. These
 * tests pin the error shapes we recognise and the remedy we print.
 */

import { describe, it, expect } from 'vitest';
import { toErrorMessage } from '../../../src/shared/error-utils.js';
import {
  diagnoseNativeModuleError,
  findNpxCacheDir,
  findNpxCacheDirInText,
  formatNativeModuleRemedy,
  isNativeModuleLoadFailure,
  NativeModuleLoadError,
  withNativeModuleRemedy,
} from '../../../src/shared/native-module-errors.js';

// Verbatim first lines of the errors seen in the wild.
const MISSING_BINDING =
  'Could not locate the bindings file. Tried:\n' +
  ' → /opt/homebrew/lib/node_modules/agentic-qe/node_modules/better-sqlite3/build/better_sqlite3.node\n' +
  ' → /opt/homebrew/lib/node_modules/agentic-qe/node_modules/better-sqlite3/build/Release/better_sqlite3.node';
const ABI_MISMATCH =
  "The module '/x/better_sqlite3.node'\nwas compiled against a different Node.js version using\n" +
  'NODE_MODULE_VERSION 127. This version of Node.js requires\nNODE_MODULE_VERSION 137.';

describe('diagnoseNativeModuleError', () => {
  it('should_classify_missing_binding_when_bindings_file_not_found', () => {
    const failure = diagnoseNativeModuleError(new Error(MISSING_BINDING));

    expect(failure).toEqual({
      moduleName: 'better-sqlite3',
      reason: 'missing-binding',
      detail: 'Could not locate the bindings file.',
    });
  });

  it('should_classify_abi_mismatch_when_node_module_version_differs', () => {
    expect(diagnoseNativeModuleError(new Error(ABI_MISMATCH))?.reason).toBe('abi-mismatch');
  });

  it('should_classify_load_failed_when_dlopen_fails', () => {
    const err = Object.assign(new Error('dlopen(/x/better_sqlite3.node): mach-o file, but is an incompatible architecture'), {
      code: 'ERR_DLOPEN_FAILED',
    });

    expect(diagnoseNativeModuleError(err)?.reason).toBe('load-failed');
  });

  it('should_find_the_failure_in_the_cause_chain_when_rewrapped', () => {
    const wrapped = new Error('Failed to initialize fleet', { cause: new Error(MISSING_BINDING) });

    expect(diagnoseNativeModuleError(wrapped)?.reason).toBe('missing-binding');
  });

  it.each([
    ['disk full', new Error('SQLITE_FULL: database or disk is full')],
    ['lock contention', Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })],
    ['corruption', new Error('SQLITE_CORRUPT: database disk image is malformed')],
    ['non-error value', 'boom'],
    ['null', null],
  ])('should_return_null_for_%s', (_label, error) => {
    expect(diagnoseNativeModuleError(error)).toBeNull();
  });
});

describe('formatNativeModuleRemedy', () => {
  const remedy = formatNativeModuleRemedy({
    moduleName: 'better-sqlite3',
    reason: 'missing-binding',
    detail: 'Could not locate the bindings file.',
  });

  it('should_name_the_cause_when_install_script_was_blocked', () => {
    expect(remedy).toContain('better-sqlite3 native module could not be loaded');
    expect(remedy).toContain('npm 12+ blocks dependency install scripts');
  });

  it('should_give_the_global_reinstall_command_with_the_package_name', () => {
    // npm's own hint omits the package name, which installs the cwd instead.
    expect(remedy).toContain('npm install -g agentic-qe --allow-scripts=agentic-qe,better-sqlite3,hnswlib-node');
  });

  it('should_give_rebuild_commands_for_global_and_local_installs', () => {
    expect(remedy).toContain('npm rebuild -g better-sqlite3 --allow-scripts=better-sqlite3');
    expect(remedy).toContain('npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3');
  });

  it('should_keep_the_original_error_first_line', () => {
    expect(remedy).toContain('Original error: Could not locate the bindings file.');
  });
});

describe('withNativeModuleRemedy', () => {
  it('should_wrap_native_failures_and_preserve_the_cause', () => {
    const original = new Error(MISSING_BINDING);
    const result = withNativeModuleRemedy(original);

    expect(result).toBeInstanceOf(NativeModuleLoadError);
    expect((result as NativeModuleLoadError).cause).toBe(original);
    expect((result as NativeModuleLoadError).reason).toBe('missing-binding');
  });

  it('should_return_other_errors_unchanged', () => {
    const original = new Error('SQLITE_FULL: database or disk is full');

    expect(withNativeModuleRemedy(original)).toBe(original);
  });

  it('should_not_double_wrap_an_error_that_already_carries_the_remedy', () => {
    const once = withNativeModuleRemedy(new Error(MISSING_BINDING));
    const rewrapped = new Error(`Failed to initialize UnifiedMemoryManager: ${(once as Error).message}`);

    expect(withNativeModuleRemedy(once)).toBe(once);
    expect(withNativeModuleRemedy(rewrapped)).toBe(rewrapped);
  });
});

describe('isNativeModuleLoadFailure', () => {
  it('should_be_true_for_raw_and_rewrapped_native_failures', () => {
    const remedied = withNativeModuleRemedy(new Error(MISSING_BINDING)) as Error;

    expect(isNativeModuleLoadFailure(new Error(MISSING_BINDING))).toBe(true);
    expect(isNativeModuleLoadFailure(new Error(`wrapped: ${remedied.message}`))).toBe(true);
  });

  it('should_be_false_for_ordinary_database_errors', () => {
    expect(isNativeModuleLoadFailure(new Error('SQLITE_READONLY: attempt to write a readonly database'))).toBe(false);
  });
});

// #1466: the Claude Code plugin runs AQE through npx, whose cache neither the
// global nor the project-local remedy reaches.
describe('npx cache remedy (#1466)', () => {
  const NPX_DIR = '/Users/me/.npm/_npx/b17e51337d3b411c';
  const NPX_MISSING_BINDING =
    'Could not locate the bindings file. Tried:\n' +
    ` → ${NPX_DIR}/node_modules/better-sqlite3/build/better_sqlite3.node\n` +
    ` → ${NPX_DIR}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`;

  it('should_find_the_npx_cache_dir_when_the_probed_paths_are_in_it', () => {
    // The text is the fallback; where the module resolves from is authoritative,
    // and in this test run it resolves to the repo's own node_modules.
    expect(findNpxCacheDirInText(NPX_MISSING_BINDING)).toBe(NPX_DIR);
  });

  it('should_trust_the_resolved_module_location_over_paths_in_the_error_text', () => {
    expect(diagnoseNativeModuleError(new Error(NPX_MISSING_BINDING))?.npxCacheDir).toBeUndefined();
  });

  it('should_find_a_windows_npx_cache_dir', () => {
    const dir = 'C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\0a1b2c';
    expect(findNpxCacheDir(`${dir}\\node_modules\\better-sqlite3\\build`)).toBe(dir);
  });

  it('should_not_report_an_npx_cache_for_a_global_install', () => {
    expect(diagnoseNativeModuleError(new Error(MISSING_BINDING))?.npxCacheDir).toBeUndefined();
  });

  it('should_give_the_in_place_repair_commands_for_the_npx_cache', () => {
    const remedy = formatNativeModuleRemedy(
      { moduleName: 'better-sqlite3', reason: 'missing-binding', detail: 'x', npxCacheDir: NPX_DIR },
      'darwin',
    );

    expect(remedy).toContain(`    cd "${NPX_DIR}"\n    npm install-scripts approve better-sqlite3 hnswlib-node\n    npm rebuild better-sqlite3`);
    expect(remedy).not.toContain('&&');
    expect(remedy).not.toContain('npm install -g agentic-qe');
  });

  it('should_use_cd_slash_d_on_windows_so_cmd_changes_drive', () => {
    const remedy = formatNativeModuleRemedy(
      { moduleName: 'better-sqlite3', reason: 'missing-binding', detail: 'x', npxCacheDir: 'D:\\npm-cache\\_npx\\0a1b' },
      'win32',
    );
    expect(remedy).toContain('cd /d "D:\\npm-cache\\_npx\\0a1b"');
  });

  it.each([
    ['/Users/Jane Doe/.npm/_npx/abc/node_modules/better-sqlite3', '/Users/Jane Doe/.npm/_npx/abc'],
    ['C:\\Users\\John Smith\\AppData\\Local\\npm-cache\\_npx\\0a1b\\node_modules\\better-sqlite3', 'C:\\Users\\John Smith\\AppData\\Local\\npm-cache\\_npx\\0a1b'],
    ['/home/u/.npm/_npx/abc/node_modules/agentic-qe/node_modules/better-sqlite3', '/home/u/.npm/_npx/abc'],
  ])('should_keep_the_whole_cache_dir_for_%s', (path, dir) => {
    expect(findNpxCacheDir(path)).toBe(dir);
  });

  it.each([
    "Error: The module '/Users/Jane Doe/.npm/_npx/abc/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
    'Require stack:\n- /Users/Jane Doe/.npm/_npx/abc/node_modules/better-sqlite3/lib/database.js',
  ])('should_drop_the_line_prefix_before_the_cache_dir_%#', (text) => {
    expect(findNpxCacheDirInText(text)).toBe('/Users/Jane Doe/.npm/_npx/abc');
  });

  it('should_find_a_cache_dir_with_spaces_in_the_probed_paths', () => {
    const text = 'Could not locate the bindings file. Tried:\n → /Users/Jane Doe/.npm/_npx/abc/node_modules/better-sqlite3/build/x.node';
    expect(findNpxCacheDirInText(text)).toBe('/Users/Jane Doe/.npm/_npx/abc');
  });

  it.each([
    '/usr/local/lib/node_modules/agentic-qe/node_modules/better-sqlite3',
    '/home/u/project/node_modules/better-sqlite3',
    '/home/u/_npx-notes/node_modules/x',
  ])('should_not_report_an_npx_cache_for_%s', (path) => {
    expect(findNpxCacheDir(path)).toBeUndefined();
  });

  it('should_tell_the_user_to_restart_the_running_server', () => {
    const remedy = toErrorMessage(withNativeModuleRemedy(new Error(NPX_MISSING_BINDING)));
    expect(remedy).toContain('restart AQE');
  });

  it('should_point_npx_users_at_the_cache_when_the_location_is_unknown', () => {
    const remedy = formatNativeModuleRemedy({
      moduleName: 'better-sqlite3',
      reason: 'missing-binding',
      detail: 'Could not locate the bindings file.',
    });
    expect(remedy).toContain('inside its npx cache directory');
    expect(remedy).toContain('restart AQE');
  });
});
