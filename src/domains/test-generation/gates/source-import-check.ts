/**
 * #1371: does a generated test reference the module under test, in the import
 * forms its language actually uses?
 *
 * The gate used to look only for quoted JS specifiers whose last segment is
 * the source file's basename. That rejected valid tests:
 * - Python `from src.calc import add` / `import src.calc as calc` (unquoted);
 * - Go tests in the source's own package (`package calc`, no import);
 * - Java/Kotlin tests in the source's package (no import needed);
 * - TS `paths` aliases (`@math`) and directory-index imports (`../src/utils`
 *   for utils/index.ts).
 *
 * Verdicts:
 * - 'found': the test references the source;
 * - 'missing': it plainly does not (the gate reports no-source-import);
 * - 'unjudged': the gate cannot tell for this language or without the
 *   source text (C#, Rust, Swift, ...), so it reports nothing.
 */
import * as path from 'path';
import ts from 'typescript';
import { findProjectRoot } from '../../../kernel/project-root.js';
import { isJavaScriptFamily } from './test-substance.js';
import { stripCode } from './code-text.js';

export type SourceImportVerdict = 'found' | 'missing' | 'unjudged';

export interface SourceImportSubject {
  /** The file the test was generated from, with its real extension (selects the language). */
  sourceFilePath: string;
  /** The generated test file path, used to resolve relative imports. */
  testFilePath?: string;
  /** The module path the test should import when it differs (inline sourceCode's logical path). */
  importTarget?: string;
  /** The source text, when it was readable. */
  sourceCode?: string;
}

const JS_EXT = /\.(?:d\.)?(?:tsx?|jsx?|mjs|cjs|mts|cts)$/i;
const normalizePathSeparators = (value: string): string => value.replace(/\\/g, '/');

/** Longest specifier or path the checks look at; longer input is not a real module path. */
const MAX_PATH_LENGTH = 4096;

/** The last `/`-separated segment, ignoring trailing slashes. String operations only (no backtracking regex). */
function lastSegment(p: string): string {
  const s = p.slice(0, MAX_PATH_LENGTH).split('\\').join('/');
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  const trimmed = s.slice(0, end);
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

/** Every module specifier: import/export ... from, side-effect import, import(), require(), vi/jest.mock(). */
function jsSpecifiers(testCode: string): string[] {
  const specs: string[] = [];
  const patterns = [
    // #1371: `from '<spec>'` only appears in import/export statements; scanning for it
    // directly is linear (a lazy `import ... from` scan was quadratic).
    /\bfrom\s*['"]([^'"\n]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of testCode.matchAll(re)) specs.push(m[1]);
  return specs.filter(spec => spec.length <= MAX_PATH_LENGTH);
}

interface TsPaths { baseDir: string; paths: Record<string, string[]> }

/** No file enumeration: only compilerOptions are needed, not the program's files. */
const OPTIONS_ONLY_HOST: ts.ParseConfigHost = {
  ...ts.sys,
  readDirectory: () => [],
};

/**
 * compilerOptions.paths from the project's tsconfig.json, following `extends`
 * the way tsc does (comments allowed).
 */
function readTsPaths(root: string, sourceFilePath: string): TsPaths | undefined {
  let directory = path.dirname(path.resolve(sourceFilePath));
  let configPath: string | undefined;
  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    const candidate = path.join(directory, 'tsconfig.json');
    if (ts.sys.fileExists(candidate)) {
      configPath = candidate;
      break;
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  if (!configPath) return undefined;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return undefined;
  const configDir = path.dirname(configPath);
  const { options } = ts.parseJsonConfigFileContent(read.config, OPTIONS_ONLY_HOST, configDir, undefined, configPath);
  if (!options.paths) return undefined;
  // tsc resolves `paths` against baseUrl, else against the config that declared them.
  const baseDir = options.baseUrl ?? (options as { pathsBasePath?: string }).pathsBasePath ?? configDir;
  return {
    baseDir: path.isAbsolute(baseDir) ? baseDir : path.resolve(configDir, baseDir),
    paths: options.paths,
  };
}

/** The files an aliased specifier can resolve to, extension-less. */
function aliasTargets(spec: string, tsPaths: TsPaths): string[] {
  const out: string[] = [];
  for (const [pattern, targets] of Object.entries(tsPaths.paths)) {
    // tsc allows at most one '*' in a pattern and in each substitution; it rejects others.
    if (pattern.split('*').length > 2) continue;
    const star = pattern.indexOf('*');
    let captured: string | undefined;
    if (star < 0) captured = pattern === spec ? '' : undefined;
    else if (spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
      && spec.length >= pattern.length - 1) {
      captured = spec.slice(star, spec.length - (pattern.length - star - 1));
    }
    if (captured === undefined) continue;
    for (const target of targets) {
      const parts = target.split('*');
      if (parts.length > 2) continue;
      const substituted = parts.length === 2 ? parts[0] + captured + parts[1] : target;
      out.push(path.resolve(tsPaths.baseDir, substituted).replace(JS_EXT, ''));
    }
  }
  return out;
}

function javascriptVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const root = path.resolve(findProjectRoot());
  const target = normalizePathSeparators(subject.importTarget || subject.sourceFilePath);
  const sourceNoExt = path.resolve(root, target).replace(JS_EXT, '');
  const normalizeModulePath = (value: string): string => {
    const withoutExt = normalizePathSeparators(value).replace(JS_EXT, '');
    return path.basename(withoutExt) === 'index' ? path.dirname(withoutExt) : withoutExt;
  };
  const sourceModulePath = normalizeModulePath(sourceNoExt);
  const tsPaths = readTsPaths(root, sourceNoExt);

  const matches = (spec: string): boolean => {
    const clean = normalizePathSeparators(spec.replace(/[?#].*$/, '')).replace(JS_EXT, '').replace(/\/index$/, '');
    if (spec.startsWith('.') || path.isAbsolute(spec)) {
      if (subject.testFilePath) {
        return normalizeModulePath(path.resolve(path.dirname(normalizePathSeparators(subject.testFilePath)), clean)) === sourceModulePath;
      }
      // Older direct gate callers do not provide the generated test path. Keep
      // their source-relative and conventional tests/ resolution, while still
      // comparing the complete normalized paths.
      return [path.dirname(sourceNoExt), root, path.join(root, 'tests')]
        .some(base => normalizeModulePath(path.resolve(base, clean)) === sourceModulePath);
    }
    // A tsconfig `paths` alias that resolves to the source (`@math`, `~/lib/math`).
    if (tsPaths && aliasTargets(spec, tsPaths).some(t => normalizeModulePath(t) === sourceModulePath)) return true;
    // Root-relative specifiers are used by a number of test runners and monorepo configs.
    return normalizeModulePath(path.resolve(root, clean)) === sourceModulePath;
  };
  const sourceFile = ts.createSourceFile('generated-test.ts', testCode, ts.ScriptTarget.Latest, true);
  const importedNames = new Set<string>();
  const importNodes = new Set<ts.Node>();
  const visitImports = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && matches(node.moduleSpecifier.text)) {
      importNodes.add(node);
      const clause = node.importClause;
      if (clause?.name) importedNames.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        importedNames.add(clause.namedBindings.name.text);
      } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) importedNames.add(element.name.text);
      }
    }
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && matches(node.arguments[0].text)
      && ts.isVariableDeclaration(node.parent)
      && node.parent.initializer === node) {
      const declaration = node.parent;
      importNodes.add(declaration);
      if (ts.isIdentifier(declaration.name)) {
        importedNames.add(declaration.name.text);
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (ts.isIdentifier(element.name)) importedNames.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(sourceFile);
  if (importedNames.size === 0) return 'missing';
  let referenced = false;
  const visitReferences = (node: ts.Node): void => {
    if (importNodes.has(node)) return;
    if (ts.isIdentifier(node) && importedNames.has(node.text)) referenced = true;
    if (!referenced) ts.forEachChild(node, visitReferences);
  };
  visitReferences(sourceFile);
  return referenced ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

/** Dotted module names and bound names used by Python imports. */
function pythonImports(testCode: string): { modules: Array<{ path: string; local: string }>; fromImports: Array<{ module: string; name: string; local: string }> } {
  // #1371: an import written inside a string or comment is not an import.
  const code = stripCode(testCode, 'python');
  const modules: Array<{ path: string; local: string }> = [];
  const fromImports: Array<{ module: string; name: string; local: string }> = [];
  for (const m of code.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]{0,4096}\)|[^\n]+)/gm)) {
    for (const entry of m[2].replace(/[()]/g, '').split(',')) {
      const parts = entry.trim().split(/\s+as\s+/);
      const name = parts[0];
      if (name) fromImports.push({ module: m[1], name, local: parts[1] || name });
    }
  }
  for (const m of code.matchAll(/^[ \t]*import\s+([^\n]+)/gm)) {
    for (const entry of m[1].split(',')) {
      const parts = entry.trim().split(/\s+as\s+/);
      if (parts[0]) modules.push({ path: parts[0], local: parts[1] || parts[0].split('.')[0] });
    }
  }
  const withStrings = stripCode(testCode, 'python', true);
  for (const m of withStrings.matchAll(/\b(?:importlib\.)?(?:import_module|__import__)\s*\(\s*['"]([.\w]+)['"]/g)) {
    const lineStart = withStrings.lastIndexOf('\n', m.index) + 1;
    const assigned = withStrings.slice(lineStart, m.index).match(/([A-Za-z_]\w*)\s*=\s*$/)?.[1];
    const module = m[1];
    modules.push({ path: module, local: assigned ?? module.split('.').pop()! });
  }
  return { modules, fromImports };
}

function pythonVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const root = path.resolve(findProjectRoot());
  const target = subject.importTarget || subject.sourceFilePath;
  const dottedTarget = !path.isAbsolute(target) && !target.includes('/') && target.includes('.')
    ? target.replace(/\.py$/i, '').split('.').filter(Boolean)
    : path.relative(root, path.resolve(root, target)).replace(/\\/g, '/').replace(/\.py$/i, '').split('/').filter(Boolean);
  let module = dottedTarget[dottedTarget.length - 1] ?? '';
  // A package's __init__.py is imported by the package name.
  const isPackageInit = module === '__init__';
  if (isPackageInit) module = dottedTarget[dottedTarget.length - 2] ?? '';
  if (!module) return 'unjudged';
  const expectedSegments = isPackageInit ? dottedTarget.slice(0, -1) : dottedTarget;
  const expected = expectedSegments.join('.');
  const { modules, fromImports } = pythonImports(testCode);
  const normalizeRelative = (value: string): string => {
    if (!value.startsWith('.')) return value;
    const testPath = path.resolve(root, subject.testFilePath || subject.sourceFilePath);
    const packageDir = path.relative(root, path.dirname(testPath))
      .replace(/\\/g, '/').split('/').filter(Boolean);
    const dots = value.match(/^\.+/)?.[0].length ?? 0;
    const base = packageDir.slice(0, Math.max(0, packageDir.length - dots + 1));
    return [...base, ...value.slice(dots).split('.').filter(Boolean)].join('.');
  };
  const sysPathPrefixes = [...stripCode(testCode, 'python', true).matchAll(/sys\.path\.insert\s*\(\s*\d+\s*,\s*['"]([^'"]+)['"]/g)]
    .map(m => m[1].replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '').replace(/\//g, '.'));
  const matchesModule = (candidate: string): boolean => {
    const normalized = normalizeRelative(candidate);
    if (normalized === expected) return true;
    return sysPathPrefixes.some(prefix => expected.startsWith(`${prefix}.`) && normalized === expected.slice(prefix.length + 1));
  };
  const boundNames = new Set<string>();
  for (const imported of modules) {
    if (matchesModule(imported.path) || (isPackageInit && imported.path === '.')) boundNames.add(imported.local);
  }
  for (const imported of fromImports) {
    if (matchesModule(imported.module)
      || matchesModule(`${imported.module}.${imported.name}`)
      || (isPackageInit && imported.module === '.' && imported.name === module)) {
      boundNames.add(imported.local);
    }
  }
  const executable = stripCode(testCode, 'python')
    .replace(/^[ \t]*(?:from|import)\s+[^\n]*/gm, '')
    .replace(/^[ \t]*(?:[A-Za-z_]\w*\s*=\s*)?(?:importlib\.)?(?:import_module|__import__)\s*\([^\n]*\)[ \t]*$/gm, '');
  return [...boundNames].some(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(executable))
    ? 'found'
    : 'missing';
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

const JVM_MODIFIERS = '(?:(?:public|private|protected|internal|open|final|abstract|sealed|data|value|inline|'
  + 'annotation|enum|static|suspend|expect|actual|const|lateinit|strictfp)\\s+)*';

/**
 * Top-level declarations of Go or Java/Kotlin source: functions, methods,
 * types, classes, objects and package-level variables. #1371: a local
 * (`var err error`, `val total` inside a function) is not something a test
 * can call, so only declarations at the start of a line count (Java/Kotlin
 * members are indented in their class; Go grouped `var (...)` entries are read
 * from the block).
 */
function declaredNames(sourceCode: string, language: 'go' | 'java' | 'kotlin'): Set<string> {
  const code = stripCode(sourceCode, language);
  const names = new Set<string>();
  const add = (re: RegExp) => { for (const m of code.matchAll(re)) names.add(m[1]); };
  if (language === 'go') {
    add(/^func[ \t]+(?:\([^)\n]*\)[ \t]*)?([A-Za-z_]\w*)/gm);
    add(/^(?:type|var|const)[ \t]+([A-Za-z_]\w*)/gm);
    for (const body of blocks(code, /^(?:type|var|const)[ \t]*\(/gm, '\n)')) {
      for (const m of body.matchAll(/^[ \t]+([A-Za-z_]\w*)/gm)) names.add(m[1]);
    }
  } else {
    add(new RegExp(`^${JVM_MODIFIERS}(?:class|interface|object|enum|record|fun|val|var|typealias)\\s+`
      + '(?:<[^>]*>\\s*)?(?:[\\w.]+\\.)?([A-Za-z_]\\w*)', 'gm'));
  }
  return names;
}

/**
 * Bodies of `start(... close` blocks (Go `var (`, `import (`). An index scan:
 * each block is searched from its own start, and an unclosed block ends the
 * scan, so the cost is linear (a lazy `[\s\S]*?` regex was quadratic).
 */
function blocks(code: string, start: RegExp, close: string): string[] {
  const out: string[] = [];
  start.lastIndex = 0;
  for (let m = start.exec(code); m; m = start.exec(code)) {
    const from = m.index + m[0].length;
    const end = code.indexOf(close, from);
    if (end < 0) break;
    out.push(code.slice(from, end));
    start.lastIndex = end + close.length;
  }
  return out;
}

/** Names assigned with `:=` (`x := ...`, `a, b := ...`): find each `:=` and walk back. Linear. */
function shortVarNames(code: string): string[] {
  const names: string[] = [];
  const isWord = (c: string | undefined) => !!c && /\w/.test(c);
  for (let at = code.indexOf(':='); at >= 0; at = code.indexOf(':=', at + 2)) {
    let k = at;
    for (;;) {
      while (code[k - 1] === ' ' || code[k - 1] === '\t') k--;
      const end = k;
      while (isWord(code[k - 1])) k--;
      if (k === end || !/[A-Za-z_]/.test(code[k])) break;
      names.push(code.slice(k, end));
      while (code[k - 1] === ' ' || code[k - 1] === '\t') k--;
      if (code[k - 1] !== ',') break;
      k--;
    }
  }
  return names;
}

const VAR_DECL = /\b(?:var|val|const|let|lateinit[ \t]+var)[ \t]+([A-Za-z_]\w*)/g;
const FUNC_DECL = /\b(?:fun|func|def)[ \t]+(?:\([^)\n]*\)[ \t]*)?(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)[ \t]*\(([^)\n]*)\)/g;

/**
 * True when a test function declaration at `index` is the test method itself:
 * `@Test`-annotated (on its line or the annotation lines above), Go's
 * `TestX(t *testing.T)`, or pytest's `test_x()`; and it takes no other parameters.
 */
function isTestMethod(code: string, index: number, name: string, params: string): boolean {
  const p = params.trim();
  if (/^t[ \t]+\*testing\.T$/.test(p)) return name.startsWith('Test');
  if (p !== '') return false;
  if (name.startsWith('test_') || name === 'test') return true;
  // Walk up over annotation and blank lines (and the current line's prefix).
  let end = index;
  for (let lines = 0; lines < 8; lines++) {
    const start = code.lastIndexOf('\n', end - 1) + 1;
    const line = code.slice(start, lines === 0 ? index : end).trim();
    if (/(^|\s)@Test\b/.test(line)) return true;
    if (lines > 0 && line !== '' && !line.startsWith('@')) return false;
    if (start === 0) return false;
    end = start - 1;
  }
  return false;
}

interface TestOwnNames {
  /** Declared as a variable, constant or lambda (`val add = {...}`, `Add := func`, `var Add = ...`): always the test's own. */
  variables: Set<string>;
  /** Declared as a helper function: the test's own. */
  helpers: Set<string>;
  /** Declared only as the test method itself: a call elsewhere can still reach the source. */
  testMethods: Map<string, number>;
}

/** Names a test declares itself. Using them is not using the source (#1371). */
function testOwnNames(code: string): TestOwnNames {
  const variables = new Set<string>();
  for (const m of code.matchAll(VAR_DECL)) variables.add(m[1]);
  for (const name of shortVarNames(code)) variables.add(name);
  for (const m of code.matchAll(/\b(?:type|class|interface|object)[ \t]+([A-Za-z_]\w*)/g)) variables.add(m[1]);
  const helpers = new Set<string>();
  const testMethods = new Map<string, number>();
  for (const m of code.matchAll(FUNC_DECL)) {
    if (isTestMethod(code, m.index!, m[1], m[2])) testMethods.set(m[1], (testMethods.get(m[1]) ?? 0) + 1);
    else helpers.add(m[1]);
  }
  return { variables, helpers, testMethods };
}

/** How often each identifier occurs in `code`, and how often it is followed by `(`. One linear scan. */
function identifierCounts(code: string): { mentions: Map<string, number>; calls: Map<string, number> } {
  const mentions = new Map<string, number>();
  const calls = new Map<string, number>();
  for (const m of code.matchAll(/\b[A-Za-z_]\w*/g)) {
    const name = m[0];
    mentions.set(name, (mentions.get(name) ?? 0) + 1);
    let k = m.index! + name.length;
    while (code[k] === ' ' || code[k] === '\t') k++;
    if (code[k] === '(') calls.set(name, (calls.get(name) ?? 0) + 1);
  }
  return { mentions, calls };
}

/**
 * True when the (stripped) test uses a source declaration. A name the test
 * declares itself (variable, lambda, helper function) never counts. A test
 * method with the source's name counts only through a call outside its own
 * declaration: `@Test fun add() { assertEquals(5, add(2, 3)) }`.
 */
function usesSource(code: string, sourceNames: Set<string>): boolean {
  const own = testOwnNames(code);
  const { mentions, calls } = identifierCounts(code);
  for (const name of sourceNames) {
    if (!mentions.has(name) || own.variables.has(name) || own.helpers.has(name)) continue;
    const declaredAsTest = own.testMethods.get(name) ?? 0;
    if (declaredAsTest === 0 || (calls.get(name) ?? 0) > declaredAsTest) return true;
  }
  return false;
}

function goImports(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"\n]+)"/gm)) out.push(m[1]);
  for (const body of blocks(code, /^[ \t]*import[ \t]*\(/gm, ')')) {
    for (const m of body.matchAll(/"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

function goVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  // Imports are string literals: read them before strings are blanked.
  const imports = goImports(stripCode(testCode, 'go', true));
  const code = stripCode(testCode, 'go');
  const testPackage = code.match(/^[ \t]*package\s+(\w+)/m)?.[1];
  const sourcePackage = subject.sourceCode?.match(/^[ \t]*package\s+(\w+)/m)?.[1];
  if (!testPackage || !sourcePackage) return sourcePackage ? 'missing' : 'unjudged';
  // Same package (white-box test): no import; it must call something the source declares.
  if (testPackage === sourcePackage) return usesSource(code, declaredNames(subject.sourceCode ?? '', 'go')) ? 'found' : 'missing';
  // External test package: the source package must be imported by its module path.
  const root = path.resolve(findProjectRoot());
  const sourceDir = path.relative(root, path.dirname(path.resolve(root, subject.sourceFilePath))).replace(/\\/g, '/');
  const targetPath = subject.importTarget?.replace(/\\/g, '/').replace(/\/$/, '');
  const imported = targetPath
    ? imports.some(p => p === targetPath)
    : imports.some(p => p === sourceDir || p.endsWith(`/${sourceDir}`));
  return imported && usesSource(code, declaredNames(subject.sourceCode ?? '', 'go')) ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Java / Kotlin
// ---------------------------------------------------------------------------

function jvmVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  if (subject.sourceCode === undefined) return 'unjudged';
  const language = /\.kts?$/i.test(subject.sourceFilePath) ? 'kotlin' : 'java';
  const code = stripCode(testCode, language);
  const sourcePackage = subject.sourceCode.match(/^[ \t]*package\s+([\w.]+)/m)?.[1] ?? '';
  const testPackage = code.match(/^[ \t]*package\s+([\w.]+)/m)?.[1] ?? '';
  const names = declaredNames(subject.sourceCode, language);
  const stem = path.basename(subject.sourceFilePath).replace(/\.[^.]+$/, '');
  if (names.size === 0) names.add(stem);
  // Same package: no import is needed, but the test must use what the source declares.
  if (testPackage === sourcePackage) return usesSource(code, names) ? 'found' : 'missing';
  if (!sourcePackage) return 'missing'; // the default package cannot be imported
  // `import com.example.Calc;`, `import com.example.*`, `import static com.example.Calc.add;`, Kotlin `import com.ex.add`.
  // #1371: `\w+(?:\.\w+)*` so the `.` before a wildcard is not swallowed.
  const imported = [...code.matchAll(/^[ \t]*import\s+(?:static\s+)?(\w+(?:\.\w+)*(?:\.\*)?)/gm)].some(m => {
    const imp = m[1];
    if (!imp.startsWith(`${sourcePackage}.`)) return false;
    const next = imp.slice(sourcePackage.length + 1).split('.')[0];
    // A wildcard import counts only when the test then uses a source declaration.
    return next === '*' ? usesSource(code, names) : names.has(next) || next === stem;
  });
  return imported && usesSource(code, names) ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Quoted-path import (Dart `import 'package:app/calc.dart'`), the gate's original check. */
function quotedPathVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const baseName = lastSegment(subject.importTarget || subject.sourceFilePath);
  return jsSpecifiers(testCode).some(spec => lastSegment(spec) === baseName) ? 'found' : 'missing';
}

export function sourceImportVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const file = subject.sourceFilePath;
  if (isJavaScriptFamily(file)) return javascriptVerdict(testCode, subject);
  if (/\.py$/i.test(file)) return pythonVerdict(testCode, subject);
  if (/\.go$/i.test(file)) return goVerdict(testCode, subject);
  if (/\.(?:java|kt|kts)$/i.test(file)) return jvmVerdict(testCode, subject);
  if (/\.dart$/i.test(file)) return quotedPathVerdict(testCode, subject);
  // C# namespaces, Rust `use crate::`/in-module tests, Swift `@testable import Module`:
  // the module name is not derivable from the file, so the gate does not judge it.
  return 'unjudged';
}
