/**
 * Unit Tests for ImportParser
 *
 * Tests import statement parsing for multiple languages.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ImportParser } from '../../../src/code-intelligence/graph/ImportParser.js';

describe('ImportParser', () => {
  let parser: ImportParser;

  beforeEach(() => {
    parser = new ImportParser();
  });

  describe('JavaScript/TypeScript imports', () => {
    it('should parse named imports', () => {
      const code = `import { foo, bar } from './utils';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].moduleSpecifier).toBe('./utils');
      expect(imports[0].importedNames).toContain('foo');
      expect(imports[0].importedNames).toContain('bar');
      expect(imports[0].isTypeOnly).toBe(false);
    });

    it('should parse default imports', () => {
      const code = `import React from 'react';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('default');
      expect(imports[0].moduleSpecifier).toBe('react');
      expect(imports[0].localName).toBe('React');
    });

    it('should parse namespace imports', () => {
      const code = `import * as path from 'path';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('namespace');
      expect(imports[0].moduleSpecifier).toBe('path');
      expect(imports[0].localName).toBe('path');
    });

    it('should parse type imports', () => {
      const code = `import type { User, Role } from './types';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].isTypeOnly).toBe(true);
      expect(imports[0].importedNames).toContain('User');
      expect(imports[0].importedNames).toContain('Role');
    });

    it('should parse mixed imports', () => {
      const code = `import React, { useState, useEffect } from 'react';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(2);

      const defaultImport = imports.find((i) => i.type === 'default');
      expect(defaultImport?.localName).toBe('React');

      const namedImport = imports.find((i) => i.type === 'named');
      expect(namedImport?.importedNames).toContain('useState');
      expect(namedImport?.importedNames).toContain('useEffect');
    });

    it('should parse side-effect imports', () => {
      const code = `import './styles.css';`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('side-effect');
      expect(imports[0].moduleSpecifier).toBe('./styles.css');
    });

    it('should parse CommonJS require', () => {
      const code = `const fs = require('fs');`;
      const imports = parser.parseImports(code, 'javascript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('require');
      expect(imports[0].moduleSpecifier).toBe('fs');
      expect(imports[0].localName).toBe('fs');
    });

    it('should parse destructured require', () => {
      const code = `const { readFile, writeFile } = require('fs/promises');`;
      const imports = parser.parseImports(code, 'javascript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('require');
      expect(imports[0].importedNames).toContain('readFile');
      expect(imports[0].importedNames).toContain('writeFile');
    });

    it('should parse dynamic imports', () => {
      const code = `const module = await import('./dynamic-module');`;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('dynamic');
      expect(imports[0].moduleSpecifier).toBe('./dynamic-module');
    });

    it('should parse multiple imports from same file', () => {
      const code = `
        import { a } from './module';
        import { b } from './module';
        import { c } from './other';
      `;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(3);
    });
  });

  describe('Python imports', () => {
    it('should parse simple import', () => {
      const code = `import os`;
      const imports = parser.parseImports(code, 'python');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('namespace');
      expect(imports[0].moduleSpecifier).toBe('os');
    });

    it('should parse import with alias', () => {
      const code = `import numpy as np`;
      const imports = parser.parseImports(code, 'python');

      expect(imports.length).toBe(1);
      expect(imports[0].localName).toBe('np');
    });

    it('should parse from import', () => {
      const code = `from typing import List, Dict`;
      const imports = parser.parseImports(code, 'python');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].moduleSpecifier).toBe('typing');
      expect(imports[0].importedNames).toContain('List');
      expect(imports[0].importedNames).toContain('Dict');
    });

    it('should parse star import', () => {
      const code = `from module import *`;
      const imports = parser.parseImports(code, 'python');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('namespace');
      expect(imports[0].importedNames).toContain('*');
    });
  });

  describe('Go imports', () => {
    it('should parse single import', () => {
      const code = `import "fmt"`;
      const imports = parser.parseImports(code, 'go');

      expect(imports.length).toBe(1);
      expect(imports[0].moduleSpecifier).toBe('fmt');
    });

    it('should parse named import', () => {
      const code = `import log "github.com/sirupsen/logrus"`;
      const imports = parser.parseImports(code, 'go');

      expect(imports.length).toBe(1);
      expect(imports[0].localName).toBe('log');
      expect(imports[0].moduleSpecifier).toBe('github.com/sirupsen/logrus');
    });
  });

  describe('Rust imports', () => {
    it('should parse use statement', () => {
      const code = `use std::collections::HashMap;`;
      const imports = parser.parseImports(code, 'rust');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].moduleSpecifier).toBe('std::collections::HashMap');
    });

    it('should parse glob use', () => {
      const code = `use std::collections::*;`;
      const imports = parser.parseImports(code, 'rust');

      expect(imports.length).toBe(1);
      expect(imports[0].type).toBe('namespace');
    });
  });

  describe('external package detection', () => {
    it('should detect external packages', () => {
      expect(parser.isExternalPackage('lodash')).toBe(true);
      expect(parser.isExternalPackage('@org/package')).toBe(true);
      expect(parser.isExternalPackage('fs')).toBe(true);
      expect(parser.isExternalPackage('node:fs')).toBe(true);
    });

    it('should detect relative imports', () => {
      expect(parser.isExternalPackage('./utils')).toBe(false);
      expect(parser.isExternalPackage('../models')).toBe(false);
      expect(parser.isExternalPackage('../../shared')).toBe(false);
    });
  });

  describe('path resolution', () => {
    it('should resolve relative imports', () => {
      const imp = {
        type: 'named' as const,
        moduleSpecifier: './utils',
        importedNames: ['foo'],
        isTypeOnly: false,
        line: 1,
      };

      const resolved = parser.resolveImportPath(
        imp,
        '/project/src/services/auth.ts',
        '/project'
      );

      expect(resolved).toBeDefined();
      expect(resolved).toContain('utils');
    });

    it('should not resolve external packages', () => {
      const imp = {
        type: 'named' as const,
        moduleSpecifier: 'lodash',
        importedNames: ['map'],
        isTypeOnly: false,
        line: 1,
      };

      const resolved = parser.resolveImportPath(
        imp,
        '/project/src/services/auth.ts',
        '/project'
      );

      expect(resolved).toBeNull();
    });
  });

  describe('line number tracking', () => {
    it('should track import line numbers', () => {
      const code = `
        // Comment line 1
        import { a } from './a';
        import { b } from './b';
      `;
      const imports = parser.parseImports(code, 'typescript');

      expect(imports.length).toBe(2);
      expect(imports[0].line).toBe(3);
      expect(imports[1].line).toBe(4);
    });
  });
});
