/**
 * Type definitions for Tree-sitter code parser
 */

export type EntityType = 'function' | 'class' | 'method' | 'interface' | 'type';
export type Visibility = 'public' | 'private' | 'protected';

export interface CodeEntity {
  id: string;
  type: EntityType;
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  signature?: string;
  language: string;
  metadata: {
    parameters?: string[];
    returnType?: string;
    visibility?: Visibility;
    decorators?: string[];
    isAsync?: boolean;
    isExported?: boolean;
    isStatic?: boolean;
    isAbstract?: boolean;
    parentClass?: string;
  };
}

export interface ParseResult {
  entities: CodeEntity[];
  errors: ParseError[];
  parseTimeMs: number;
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  severity: 'warning' | 'error';
}

export interface LanguageConfig {
  extensions: string[];
  functionTypes: string[];
  classTypes: string[];
  methodTypes: string[];
  interfaceTypes: string[];
  typeAliasTypes: string[];
  parameterTypes: string[];
  returnTypeFields: string[];
  decoratorTypes: string[];
  visibilityModifiers: {
    public: string[];
    private: string[];
    protected: string[];
  };
  asyncKeywords: string[];
  exportKeywords: string[];
  staticKeywords: string[];
  abstractKeywords: string[];
}

export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
