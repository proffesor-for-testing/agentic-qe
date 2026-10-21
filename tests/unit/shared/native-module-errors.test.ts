/**
 * Native module load-failure diagnostics (#1173).
 *
 * npm 12 blocks dependency install scripts by default, so `npm install -g
 * agentic-qe` can leave better-sqlite3 without its compiled binary. These
 * tests pin the error shapes we recognise and the remedy we print.
 */

import { describe, it, expect } from 'vitest';
import {
  diagnoseNativeModuleError,
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
