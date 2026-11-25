/**
 * #1443: published declarations must not need types a consumer cannot install.
 *
 * Our .d.ts files imported `Database`/`Statement` from 'better-sqlite3' (its
 * types are the devDependency @types/better-sqlite3) and `Tensor` from
 * '@huggingface/transformers' (a devDependency). Consumers got TS7016/TS2307
 * with skipLibCheck: false and silent `any` types with skipLibCheck: true.
 *
 * Covered here (no build needed):
 *  - the declaration-import checker used by CI (scripts/check-public-declarations.mjs);
 *  - a source guard: type positions use AQE interfaces, never those packages;
 *  - drift: a real better-sqlite3 Database still satisfies SqliteDatabase.
 * CI also runs the checker on the built dist and a consumer `tsc` against the
 * packed tarball (optimized-ci.yml, "Public declarations").
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  declarationImports,
  findUnresolvableDeclarationImports,
  packageNameOf,
  typedExportSpecifiers,
  typesPackageFor,
  unresolvableReason,
} from '../../../scripts/check-public-declarations.mjs';

const ROOT = path.join(__dirname, '..', '..', '..');

const manifest = {
  name: 'agentic-qe',
  dependencies: { 'better-sqlite3': '^12', typed: '^1', untyped: '^1', '@types/untyped': '^1' },
  devDependencies: { '@huggingface/transformers': '^4', '@types/better-sqlite3': '^7' },
  peerDependencies: { vibium: '^26' },
};
const shipsTypes = (name: string) => name === 'typed' || name === 'vibium';

describe('declaration import checker (#1443)', () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should_flagRuntimeDependency_when_itsTypesAreOnlyADevDependency', () => {
    expect(unresolvableReason('better-sqlite3', manifest, shipsTypes)).toBe(
      'ships no types and @types/better-sqlite3 is not a dependency',
    );
  });

  it('should_flagDevDependency_when_declarationsImportIt', () => {
    expect(unresolvableReason('@huggingface/transformers', manifest, shipsTypes)).toBe(
      'devDependency (not installed for consumers)',
    );
  });

  it('should_flagUnknownPackage_when_itIsNotDeclaredAtAll', () => {
    expect(unresolvableReason('left-pad', manifest, shipsTypes)).toBe('not a dependency');
  });

  it('should_allowImports_when_consumerCanResolveTypes', () => {
    const allowed = ['typed', 'untyped', 'vibium', 'agentic-qe', 'node:fs', 'events'];
    expect(allowed.map((name) => unresolvableReason(name, manifest, shipsTypes))).toEqual(
      allowed.map(() => null),
    );
  });

  it('should_readImportsAndImportTypes_butIgnoreComments', () => {
    const text = [
      "/** import Database from 'better-sqlite3'; */",
      "import type { A } from 'better-sqlite3';",
      "export declare const t: import('@huggingface/transformers').Tensor;",
      "export * from './local.js';",
    ].join('\n');
    expect(declarationImports(text)).toEqual(['better-sqlite3', '@huggingface/transformers', './local.js']);
  });

  it('should_mapSpecifiersToPackageAndTypesNames', () => {
    expect(packageNameOf('@scope/pkg/deep/path')).toBe('@scope/pkg');
    expect(packageNameOf('pkg/sub')).toBe('pkg');
    expect(typesPackageFor('@scope/pkg')).toBe('@types/scope__pkg');
    expect(typesPackageFor('better-sqlite3')).toBe('@types/better-sqlite3');
  });

  it('should_reportEachOffendingFile_when_scanningADistTree', () => {
    // Arrange: a dist tree with one leak per package, plus a clean file.
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-dts-1443-'));
    const nodeModules = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-dts-1443-nm-'));
    tempDirs.push(dist, nodeModules);
    fs.mkdirSync(path.join(dist, 'kernel'));
    fs.writeFileSync(path.join(dist, 'kernel', 'memory.d.ts'),
      "import { type Database as DatabaseType } from 'better-sqlite3';\nexport declare const db: DatabaseType;\n");
    fs.writeFileSync(path.join(dist, 'embed.d.ts'), "import type { Tensor } from '@huggingface/transformers';\n");
    fs.writeFileSync(path.join(dist, 'clean.d.ts'), "import type { SqliteDatabase } from './shared/sqlite-types.js';\n");
    fs.mkdirSync(path.join(nodeModules, 'better-sqlite3'));
    fs.writeFileSync(path.join(nodeModules, 'better-sqlite3', 'package.json'), '{"name":"better-sqlite3","main":"lib/index.js"}');

    // Act
    const findings = findUnresolvableDeclarationImports(dist, manifest, nodeModules);

    // Assert
    expect(findings.map((f: { file: string; specifier: string }) => `${f.file}:${f.specifier}`).sort()).toEqual([
      'embed.d.ts:@huggingface/transformers',
      `${path.join('kernel', 'memory.d.ts')}:better-sqlite3`,
    ]);
  });

  it('should_listEveryTypedExportOfTheRealPackage', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const specifiers = typedExportSpecifiers(pkg);
    expect(specifiers).toContain('agentic-qe');
    expect(specifiers).toContain('agentic-qe/kernel');
    // './cli' has no types condition, so a consumer cannot import types from it.
    expect(specifiers).not.toContain('agentic-qe/cli');
  });
});

function listTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTs(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('source guard (#1443)', () => {
  it('should_useAqeSqliteTypes_when_aSourceFileNamesADatabaseType', () => {
    // Type positions must use src/shared/sqlite-types.ts. Value imports
    // (`import Database from 'better-sqlite3'` to construct a connection) are
    // fine: they are erased from declarations unless used as a type.
    const typeLeak = [
      /import\s+type\s[^;]*from\s+'(better-sqlite3|@huggingface\/transformers)'/,
      /import\s*\{[^}]*\btype\s[^}]*\}\s*from\s+'(better-sqlite3|@huggingface\/transformers)'/,
      /import\('(better-sqlite3|@huggingface\/transformers)'\)\.[A-Za-z]/,
      /\bDatabase\.(Database|Statement|RunResult|Transaction)\b/,
    ];
    const offenders = listTs(path.join(ROOT, 'src')).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return typeLeak.some((re) => re.test(text)) ? [path.relative(ROOT, file)] : [];
    });
    expect(offenders).toEqual([]);
  });
});

describe('SqliteDatabase drift (#1443)', () => {
  function diagnosticsFor(source: string): string[] {
    // A virtual file inside the repo so 'better-sqlite3' resolves to the real
    // package and its @types (devDependency) — the drift check needs both.
    const file = path.join(ROOT, 'tests', 'unit', 'packaging', '__sqlite_compat_1443__.ts');
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true,
      esModuleInterop: true, noEmit: true, skipLibCheck: true, types: ['node'],
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, ...rest) =>
      path.resolve(name) === file
        ? ts.createSourceFile(name, source, languageVersion)
        : getSourceFile(name, languageVersion, ...rest);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (name) => path.resolve(name) === file || fileExists(name);
    const program = ts.createProgram([file], options, host);
    return ts.getPreEmitDiagnostics(program)
      .filter((d) => d.file && path.resolve(d.file.fileName) === file)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }

  const header = [
    "import Database from 'better-sqlite3';",
    "import type { SqliteDatabase, SqliteStatement, SqliteTransaction } from '../../../src/shared/sqlite-types.js';",
    'declare const real: Database.Database;',
  ].join('\n');

  it('should_acceptARealBetterSqlite3Database_asSqliteDatabase', () => {
    const diagnostics = diagnosticsFor(`${header}
const db: SqliteDatabase = real;
const constructed: SqliteDatabase = new Database(':memory:');
const typed: SqliteStatement<[string], { n: number }> = real.prepare<[string], { n: number }>('select ?');
const tx: SqliteTransaction<(a: number) => string> = real.transaction((a: number) => String(a));
const viaInterface: SqliteStatement = db.prepare('select 1');
export { constructed, typed, tx, viaInterface };
`);
    expect(diagnostics).toEqual([]);
  }, 60_000);

  it('should_reportAnError_when_aTypeDoesNotMatch', () => {
    // Negative control: proves the check above really type-checks.
    const diagnostics = diagnosticsFor(`${header}
const wrong: SqliteDatabase = { prepare: (sql: number) => sql };
export { wrong };
`);
    expect(diagnostics.length).toBeGreaterThan(0);
  }, 60_000);
});
