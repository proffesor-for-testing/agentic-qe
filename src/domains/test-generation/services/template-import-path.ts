/**
 * #1370: the import target a framework template writes for the module under
 * test, in the form that language expects. Previously every language got the
 * file path with only JS extensions stripped, giving `from src.calc.py import`,
 * `import "pkg/calc.go"`, `package src.Calc;` and `using src/Calc.cs;`.
 *
 * Each generator's documented importPath form:
 * - pytest: a dotted module path (`app.services.user_service`)
 * - go-test: a package import path (`github.com/org/app/services`), or empty
 *   when the module path is unknown (the template then imports nothing)
 * - junit5 / kotlin-junit: a fully qualified class name (`com.example.Calc`)
 * - xunit: a namespace (`MyApp.Services`), or empty when none is declared
 * Other languages keep the extension-stripped path (unchanged behaviour).
 */
import * as path from 'path';
import { readConfinedTextSync } from '../../../shared/io/confined-read.js';

const JS_EXT = /\.(?:ts|js|tsx|jsx)$/;

function stem(sourceFile: string): string {
  return path.basename(sourceFile).replace(/\.[^.]+$/, '');
}

/** A source path relative to the working directory when it lies inside it. */
function projectRelative(sourceFile: string): string {
  if (!path.isAbsolute(sourceFile)) return sourceFile.replace(/^\.\//, '');
  const rel = path.relative(process.cwd(), sourceFile);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.basename(sourceFile);
}

function pythonModule(sourceFile: string): string {
  return projectRelative(sourceFile).replace(/\\/g, '/').replace(/\.py$/i, '').split('/').filter(Boolean).join('.');
}

/** `module x` from the nearest go.mod inside the project, plus the package directory. */
function goPackage(sourceFile: string): string {
  const dir = path.dirname(path.resolve(sourceFile));
  for (let current = dir, depth = 0; depth < 32; depth++) {
    let content: string | undefined;
    try {
      content = readConfinedTextSync(path.join(current, 'go.mod'));
    } catch {
      content = undefined;
    }
    const module = content?.match(/^\s*module\s+(\S+)/m)?.[1];
    if (module) {
      const rel = path.relative(current, dir).replace(/\\/g, '/');
      return rel ? `${module}/${rel}` : module;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

function jvmClass(sourceFile: string, sourceContent: string): string {
  const pkg = sourceContent.match(/^\s*package\s+([\w.]+)\s*;?\s*$/m)?.[1];
  return pkg ? `${pkg}.${stem(sourceFile)}` : stem(sourceFile);
}

function csharpNamespace(sourceContent: string): string {
  return sourceContent.match(/^\s*namespace\s+([\w.]+)/m)?.[1] ?? '';
}

export function templateImportPath(sourceFile: string, sourceContent = ''): string {
  if (/\.py$/i.test(sourceFile)) return pythonModule(sourceFile);
  if (/\.go$/i.test(sourceFile)) return goPackage(sourceFile);
  if (/\.(?:java|kt|kts)$/i.test(sourceFile)) return jvmClass(sourceFile, sourceContent);
  if (/\.cs$/i.test(sourceFile)) return csharpNamespace(sourceContent);
  return sourceFile.replace(JS_EXT, '');
}
