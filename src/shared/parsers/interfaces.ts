/**
 * Language Parser Abstraction Layer (ADR-076)
 * Defines the universal parser interface for multi-language support.
 */

import type { SupportedLanguage } from '../types/test-frameworks.js';

/**
 * Universal function parameter info (language-agnostic)
 */
export interface UniversalParameterInfo {
  name: string;
  type: string | undefined;
  isOptional: boolean;
  defaultValue: string | undefined;
}

/**
 * Universal function info (language-agnostic)
 */
export interface UniversalFunctionInfo {
  name: string;
  parameters: UniversalParameterInfo[];
  returnType: string | undefined;
  isAsync: boolean;
  isPublic: boolean;
  complexity: number;
  decorators: string[];
  genericParams: string[];
  body?: string;
  startLine: number;
  endLine: number;
}

/**
 * Universal property info
 */
export interface UniversalPropertyInfo {
  name: string;
  type: string | undefined;
  isPublic: boolean;
  isReadonly: boolean;
}

/**
 * Universal class info (language-agnostic)
 */
export interface UniversalClassInfo {
  name: string;
  methods: UniversalFunctionInfo[];
  properties: UniversalPropertyInfo[];
  isPublic: boolean;
  implements: string[];
  extends: string | undefined;
  decorators: string[];
  startLine: number;
  endLine: number;
}

/**
 * Import info (language-agnostic)
 */
export interface UniversalImportInfo {
  module: string;
  namedImports: string[];
  isTypeOnly: boolean;
}

/**
 * Parsed file result (language-agnostic)
 */
export interface ParsedFile {
  functions: UniversalFunctionInfo[];
  classes: UniversalClassInfo[];
  imports: UniversalImportInfo[];
  language: SupportedLanguage;
  framework?: string;
  filePath: string;
}

/**
 * Language parser interface — every language parser must implement this
 */
export interface ILanguageParser {
  readonly language: SupportedLanguage;
  readonly supportedExtensions: string[];
  parseFile(content: string, filePath: string): Promise<ParsedFile>;
}
