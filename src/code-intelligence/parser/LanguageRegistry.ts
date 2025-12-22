/**
 * Language configuration registry for Tree-sitter parsing
 * Defines node type mappings and patterns for each supported language
 */

import { Language, LanguageConfig } from './types.js';

export class LanguageRegistry {
  private static configs: Map<Language, LanguageConfig> = new Map([
    [
      'typescript',
      {
        extensions: ['.ts', '.tsx'],
        functionTypes: ['function_declaration', 'arrow_function', 'function'],
        classTypes: ['class_declaration'],
        methodTypes: ['method_definition'],
        interfaceTypes: ['interface_declaration'],
        typeAliasTypes: ['type_alias_declaration'],
        parameterTypes: ['required_parameter', 'optional_parameter'],
        returnTypeFields: ['return_type', 'type_annotation'],
        decoratorTypes: ['decorator'],
        visibilityModifiers: {
          public: ['public'],
          private: ['private'],
          protected: ['protected'],
        },
        asyncKeywords: ['async'],
        exportKeywords: ['export'],
        staticKeywords: ['static'],
        abstractKeywords: ['abstract'],
      },
    ],
    [
      'javascript',
      {
        extensions: ['.js', '.jsx', '.mjs', '.cjs'],
        functionTypes: ['function_declaration', 'arrow_function', 'function'],
        classTypes: ['class_declaration'],
        methodTypes: ['method_definition'],
        interfaceTypes: [],
        typeAliasTypes: [],
        parameterTypes: ['identifier', 'rest_parameter', 'assignment_pattern'],
        returnTypeFields: [],
        decoratorTypes: ['decorator'],
        visibilityModifiers: {
          public: [],
          private: ['#'],
          protected: [],
        },
        asyncKeywords: ['async'],
        exportKeywords: ['export'],
        staticKeywords: ['static'],
        abstractKeywords: [],
      },
    ],
    [
      'python',
      {
        extensions: ['.py', '.pyi'],
        functionTypes: ['function_definition'],
        classTypes: ['class_definition'],
        methodTypes: ['function_definition'], // Methods are functions in classes
        interfaceTypes: [],
        typeAliasTypes: [],
        parameterTypes: ['identifier', 'typed_parameter', 'default_parameter'],
        returnTypeFields: ['return_type'],
        decoratorTypes: ['decorator'],
        visibilityModifiers: {
          public: [],
          private: ['__'], // Convention: __private
          protected: ['_'], // Convention: _protected
        },
        asyncKeywords: ['async'],
        exportKeywords: [],
        staticKeywords: ['staticmethod'],
        abstractKeywords: ['abstractmethod'],
      },
    ],
    [
      'go',
      {
        extensions: ['.go'],
        functionTypes: ['function_declaration', 'method_declaration'],
        classTypes: [],
        methodTypes: ['method_declaration'],
        interfaceTypes: ['interface_type'],
        typeAliasTypes: ['type_declaration'],
        parameterTypes: ['parameter_declaration'],
        returnTypeFields: ['result'],
        decoratorTypes: [],
        visibilityModifiers: {
          public: [], // Uppercase first letter
          private: [], // Lowercase first letter
          protected: [],
        },
        asyncKeywords: ['go'],
        exportKeywords: [],
        staticKeywords: [],
        abstractKeywords: [],
      },
    ],
    [
      'rust',
      {
        extensions: ['.rs'],
        functionTypes: ['function_item'],
        classTypes: ['struct_item', 'enum_item'],
        methodTypes: ['function_item'], // Methods in impl blocks
        interfaceTypes: ['trait_item'],
        typeAliasTypes: ['type_item'],
        parameterTypes: ['parameter'],
        returnTypeFields: ['return_type'],
        decoratorTypes: ['attribute_item'],
        visibilityModifiers: {
          public: ['pub'],
          private: [],
          protected: [],
        },
        asyncKeywords: ['async'],
        exportKeywords: ['pub'],
        staticKeywords: ['static'],
        abstractKeywords: [],
      },
    ],
  ]);

  static getConfig(language: Language): LanguageConfig {
    const config = this.configs.get(language);
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }
    return config;
  }

  static detectLanguage(filePath: string): Language | null {
    const extension = filePath.substring(filePath.lastIndexOf('.'));

    for (const [lang, config] of this.configs.entries()) {
      if (config.extensions.includes(extension)) {
        return lang;
      }
    }

    return null;
  }

  static getAllLanguages(): Language[] {
    return Array.from(this.configs.keys());
  }

  static isSupported(language: string): language is Language {
    return this.configs.has(language as Language);
  }
}
